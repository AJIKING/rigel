// ============================================================
// 課金ルートの HTTP 統合テスト（マネタイズの中核＝手作業テストの置き換え）
// ------------------------------------------------------------
// ルート → ユースケース → in-memory リポジトリを実 HTTP リクエストで通す。
//   - Stripe Webhook は「実 Stripe SDK の署名検証」を通す（generateTestHeaderString
//     で署名した実ペイロード。ネットワーク不要・決定的）
//   - IAP は「実 AppleAppStoreVerifier の x5c チェーン検証」を通す（自作CAで署名）
//   - Checkout / Portal はフェイク gateway（Stripe API への送信内容は
//     stripe-billing-gateway.test.ts が担う）
// 申込→更新→プラン変更→解約/失効のライフサイクルをユーザー plan の遷移で検証する。
// ============================================================

import Stripe from "stripe";
import { beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../../env";
import { AppleAppStoreVerifier } from "../../infrastructure/billing/apple-appstore-verifier";
import { StripeBillingGateway } from "../../infrastructure/billing/stripe-billing-gateway";
import {
  createTestAppStoreChain,
  signAppStoreJws,
  type TestAppStoreChain,
} from "../../test-support/appstore-jws";
import {
  billingTestContainer,
  issueTestToken,
  makeFreeUser,
  APPSTORE_TEST_CONFIG,
  FakeAppStoreVerifier,
  FakeBillingGateway,
} from "../../test-support/billing";
import { InMemoryUserRepository } from "../../test-support/in-memory";
import { createApp } from "./app";

const fakeEnv = {
  DB: {} as unknown as D1Database,
  GEMINI_API_KEY: "",
  CLOUDFLARE_AI_GATEWAY_URL: "",
  GOOGLE_CLIENT_ID: "test-client-id",
  SESSION_SECRET: "test-secret",
} satisfies Env;

const jsonAuth = (token: string, body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

// ------------------------------------------------------------
// Stripe: Checkout / Portal（ルートの契約: ステータスと本文）
// ------------------------------------------------------------

describe("POST /billing/checkout", () => {
  const body = { plan: "pro", successUrl: "https://app/ok", cancelUrl: "https://app/ng" };

  it("free ユーザーは 200 で決済URLを得る（userId と plan が gateway に渡る）", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const gateway = new FakeBillingGateway();
    const app = createApp({
      container: billingTestContainer({ users, gateway, verifier: new FakeAppStoreVerifier(tx()) }),
    });
    const res = await app.request(
      "/billing/checkout",
      jsonAuth(await issueTestToken("u1"), body),
      fakeEnv,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://stripe.test/pay/u1" });
    expect(gateway.lastCheckout).toMatchObject({ userId: "u1", plan: "pro" });
  });

  it("加入中ユーザーは 409（二重サブスク防止）で、Checkout セッションを作らない", async () => {
    const paid = makeFreeUser("u1");
    paid.changePlan("next");
    const users = new InMemoryUserRepository([paid]);
    const gateway = new FakeBillingGateway();
    const app = createApp({
      container: billingTestContainer({ users, gateway, verifier: new FakeAppStoreVerifier(tx()) }),
    });
    const res = await app.request(
      "/billing/checkout",
      jsonAuth(await issueTestToken("u1"), body),
      fakeEnv,
    );
    expect(res.status).toBe(409);
    expect(gateway.lastCheckout).toBeUndefined();
  });

  it("不正な plan / URL 欠落は 400", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = createApp({
      container: billingTestContainer({
        users,
        gateway: new FakeBillingGateway(),
        verifier: new FakeAppStoreVerifier(tx()),
      }),
    });
    const token = await issueTestToken("u1");
    const bad1 = await app.request(
      "/billing/checkout",
      jsonAuth(token, { ...body, plan: "platinum" }),
      fakeEnv,
    );
    expect(bad1.status).toBe(400);
    const bad2 = await app.request(
      "/billing/checkout",
      jsonAuth(token, { plan: "pro", successUrl: "https://app/ok" }),
      fakeEnv,
    );
    expect(bad2.status).toBe(400);
  });
});

describe("POST /billing/portal", () => {
  it("加入中は 200 でポータルURL、未加入は 404", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const token = await issueTestToken("u1");
    const withSub = createApp({
      container: billingTestContainer({
        users,
        gateway: new FakeBillingGateway({ type: "ignored" }, "https://stripe.test/portal"),
        verifier: new FakeAppStoreVerifier(tx()),
      }),
    });
    const ok = await withSub.request(
      "/billing/portal",
      jsonAuth(token, { returnUrl: "https://app/settings" }),
      fakeEnv,
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ url: "https://stripe.test/portal" });

    const withoutSub = createApp({
      container: billingTestContainer({
        users,
        gateway: new FakeBillingGateway({ type: "ignored" }, null),
        verifier: new FakeAppStoreVerifier(tx()),
      }),
    });
    const ng = await withoutSub.request(
      "/billing/portal",
      jsonAuth(token, { returnUrl: "https://app/settings" }),
      fakeEnv,
    );
    expect(ng.status).toBe(404);
  });
});

// ------------------------------------------------------------
// Stripe Webhook: 実 SDK の署名検証を通す end-to-end
// ------------------------------------------------------------

describe("POST /billing/webhook（実 Stripe 署名）", () => {
  const WEBHOOK_SECRET = "whsec_test_secret";
  const stripe = new Stripe("sk_test_dummy");
  const gateway = new StripeBillingGateway({
    secretKey: "sk_test_dummy",
    webhookSecret: WEBHOOK_SECRET,
    priceNext: "price_next",
    pricePro: "price_pro",
  });

  function signedInit(payload: unknown, secret = WEBHOOK_SECRET): RequestInit {
    const body = JSON.stringify(payload);
    return {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: body, secret }),
      },
      body,
    };
  }

  function appWith(users: InMemoryUserRepository) {
    return createApp({
      container: billingTestContainer({ users, gateway, verifier: new FakeAppStoreVerifier(tx()) }),
    });
  }

  const completed = (userId: string, tier: string) => ({
    type: "checkout.session.completed",
    data: { object: { client_reference_id: userId, metadata: { tier } } },
  });
  const updated = (userId: string, priceId: string) => ({
    type: "customer.subscription.updated",
    data: {
      object: {
        status: "active",
        metadata: { userId },
        items: { data: [{ price: { id: priceId } }] },
      },
    },
  });
  const deleted = (userId: string) => ({
    type: "customer.subscription.deleted",
    data: { object: { metadata: { userId } } },
  });

  it("ライフサイクル: 加入(pro) → Portal でプラン変更(next) → 解約(free)", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = appWith(users);

    const r1 = await app.request("/billing/webhook", signedInit(completed("u1", "pro")), fakeEnv);
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ received: true, handled: true });
    expect((await users.findById("u1"))?.plan).toBe("pro");

    const r2 = await app.request(
      "/billing/webhook",
      signedInit(updated("u1", "price_next")),
      fakeEnv,
    );
    expect((await r2.json()) as { handled: boolean }).toMatchObject({ handled: true });
    expect((await users.findById("u1"))?.plan).toBe("next");

    const r3 = await app.request("/billing/webhook", signedInit(deleted("u1")), fakeEnv);
    expect((await r3.json()) as { handled: boolean }).toMatchObject({ handled: true });
    expect((await users.findById("u1"))?.plan).toBe("free");
  });

  it("署名が別 secret（改ざん相当）なら 400 で、プランは動かない", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = appWith(users);
    const res = await app.request(
      "/billing/webhook",
      signedInit(completed("u1", "pro"), "whsec_attacker"),
      fakeEnv,
    );
    expect(res.status).toBe(400);
    expect((await users.findById("u1"))?.plan).toBe("free");
  });

  it("署名ヘッダ無しは 400", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = appWith(users);
    const res = await app.request(
      "/billing/webhook",
      { method: "POST", body: JSON.stringify(completed("u1", "pro")) },
      fakeEnv,
    );
    expect(res.status).toBe(400);
  });

  it("支払い遅延（past_due の updated）ではプランを落とさない（解約確定は deleted が担う）", async () => {
    const paid = makeFreeUser("u1");
    paid.changePlan("pro");
    const users = new InMemoryUserRepository([paid]);
    const app = appWith(users);
    const res = await app.request(
      "/billing/webhook",
      signedInit({
        type: "customer.subscription.updated",
        data: {
          object: {
            status: "past_due",
            metadata: { userId: "u1" },
            items: { data: [{ price: { id: "price_pro" } }] },
          },
        },
      }),
      fakeEnv,
    );
    expect((await res.json()) as { handled: boolean }).toMatchObject({ handled: false });
    expect((await users.findById("u1"))?.plan).toBe("pro");
  });
});

// ------------------------------------------------------------
// IAP: 実 AppleAppStoreVerifier（x5c チェーン検証）を通す end-to-end
// ------------------------------------------------------------

function tx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    productId: APPSTORE_TEST_CONFIG.productPro,
    bundleId: APPSTORE_TEST_CONFIG.bundleId,
    originalTransactionId: "orig-1",
    expiresDate: Date.now() + 30 * 24 * 3600 * 1000,
    ...overrides,
  };
}

describe("IAP ルート（実 JWS 検証）", () => {
  let chain: TestAppStoreChain;
  let verifier: AppleAppStoreVerifier;

  beforeAll(async () => {
    chain = await createTestAppStoreChain();
    verifier = new AppleAppStoreVerifier({ rootCaDerB64: chain.rootDerB64 });
  });

  const sign = (payload: unknown) => signAppStoreJws(payload, chain.leafKeys, chain.x5c);
  const notif = async (notificationType: string, transaction: unknown) =>
    sign({ notificationType, data: { signedTransactionInfo: await sign(transaction) } });

  function appWith(users: InMemoryUserRepository) {
    return createApp({
      container: billingTestContainer({ users, gateway: new FakeBillingGateway(), verifier }),
    });
  }

  it("ライフサイクル: 購入引き換え(pro) → 更新(DID_RENEW) → 失効(EXPIRED で free)", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = appWith(users);

    // 1. アプリからの購入引き換え。
    const r1 = await app.request(
      "/billing/appstore/redeem",
      jsonAuth(await issueTestToken("u1"), { jws: await sign(tx()) }),
      fakeEnv,
    );
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ ok: true, plan: "pro" });
    const afterRedeem = await users.findById("u1");
    expect(afterRedeem?.plan).toBe("pro");
    expect(afterRedeem?.appStoreOriginalTransactionId).toBe("orig-1");

    // 2. 月次更新の Server Notification（認証なし・Apple から直接）。
    const r2 = await app.request(
      "/billing/appstore/notifications",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedPayload: await notif("DID_RENEW", tx()) }),
      },
      fakeEnv,
    );
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ received: true, handled: true });
    expect((await users.findById("u1"))?.plan).toBe("pro");

    // 3. 期限切れ（更新失敗の確定）で free へ。
    const r3 = await app.request(
      "/billing/appstore/notifications",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedPayload: await notif("EXPIRED", tx()) }),
      },
      fakeEnv,
    );
    expect(await r3.json()).toEqual({ received: true, handled: true });
    expect((await users.findById("u1"))?.plan).toBe("free");
  });

  it("redeem: 期限切れトランザクションは 410、プランは動かない", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = appWith(users);
    const res = await app.request(
      "/billing/appstore/redeem",
      jsonAuth(await issueTestToken("u1"), {
        jws: await sign(tx({ expiresDate: Date.now() - 1000 })),
      }),
      fakeEnv,
    );
    expect(res.status).toBe(410);
    expect((await users.findById("u1"))?.plan).toBe("free");
  });

  it("redeem: 別アプリの bundleId / 知らない商品は 400", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = appWith(users);
    const token = await issueTestToken("u1");
    const wrongBundle = await app.request(
      "/billing/appstore/redeem",
      jsonAuth(token, { jws: await sign(tx({ bundleId: "com.evil.app" })) }),
      fakeEnv,
    );
    expect(wrongBundle.status).toBe(400);
    const unknownProduct = await app.request(
      "/billing/appstore/redeem",
      jsonAuth(token, { jws: await sign(tx({ productId: "evil.product" })) }),
      fakeEnv,
    );
    expect(unknownProduct.status).toBe(400);
    expect((await users.findById("u1"))?.plan).toBe("free");
  });

  it("redeem: 署名が壊れた JWS は 400", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = appWith(users);
    const res = await app.request(
      "/billing/appstore/redeem",
      jsonAuth(await issueTestToken("u1"), { jws: "not-a-jws" }),
      fakeEnv,
    );
    expect(res.status).toBe(400);
  });

  it("notifications: 該当ユーザーが居ない失効は handled=false（200 で受領は返す）", async () => {
    const users = new InMemoryUserRepository([]);
    const app = appWith(users);
    const res = await app.request(
      "/billing/appstore/notifications",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedPayload: await notif("EXPIRED", tx()) }),
      },
      fakeEnv,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, handled: false });
  });

  it("notifications: 署名検証に失敗する signedPayload は 400", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = appWith(users);
    const res = await app.request(
      "/billing/appstore/notifications",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedPayload: "garbage" }),
      },
      fakeEnv,
    );
    expect(res.status).toBe(400);
  });
});
