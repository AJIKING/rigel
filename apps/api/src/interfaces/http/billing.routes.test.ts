// ============================================================
// 課金ルートの HTTP 統合テスト（マネタイズの中核＝手作業テストの置き換え）
// ------------------------------------------------------------
// ルート → ユースケース → in-memory リポジトリを実 HTTP リクエストで通す。
//   - Stripe Webhook は「実 Stripe SDK の署名検証」を通す（generateTestHeaderString
//     で署名した実ペイロード。ネットワーク不要・決定的）
//   - Checkout / Portal はフェイク gateway（Stripe API への送信内容は
//     stripe-billing-gateway.test.ts が担う）
// 申込→更新→プラン変更→解約/失効のライフサイクルをユーザー plan の遷移で検証する。
// ============================================================

import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { StripeBillingGateway } from "../../infrastructure/billing/stripe-billing-gateway";
import {
  billingTestContainer,
  fakeEnv,
  issueTestToken,
  makeFreeUser,
  FakeBillingGateway,
  REVENUECAT_TEST_AUTH,
} from "../../test-support/billing";
import { InMemoryUserRepository } from "../../test-support/in-memory";
import { createApp } from "./app";

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
      container: billingTestContainer({ users, gateway }),
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
      container: billingTestContainer({ users, gateway }),
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
      container: billingTestContainer({ users, gateway }),
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
// RevenueCat Webhook: エンタイトルメントの真実源（web=Stripe / アプリ=IAP 横串）
// ------------------------------------------------------------

describe("POST /billing/revenuecat/webhook", () => {
  const rcBody = (over: Record<string, unknown> = {}) => ({
    api_version: "1.0",
    event: {
      id: "E1",
      type: "INITIAL_PURCHASE",
      app_user_id: "u1",
      entitlement_ids: ["pro"],
      environment: "PRODUCTION",
      ...over,
    },
  });

  const rcInit = (auth: string | null, payload: unknown): RequestInit => ({
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify(payload),
  });

  function rcApp(users: InMemoryUserRepository) {
    return createApp({
      container: billingTestContainer({
        users,
        gateway: new FakeBillingGateway(),
      }),
    });
  }

  it("正しい Authorization + 購入イベントで plan が反映される（再送は二重適用しない）", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = rcApp(users);

    const r1 = await app.request(
      "/billing/revenuecat/webhook",
      rcInit(REVENUECAT_TEST_AUTH, rcBody()),
      fakeEnv,
    );
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ received: true, handled: true });
    expect((await users.findById("u1"))?.plan).toBe("pro");

    // 同一 event.id の再送 → 200 だが適用しない。
    const r2 = await app.request(
      "/billing/revenuecat/webhook",
      rcInit(REVENUECAT_TEST_AUTH, rcBody()),
      fakeEnv,
    );
    expect(await r2.json()).toEqual({ received: true, handled: false });
  });

  it("Authorization 不一致・欠落は 401 で、プランは動かない", async () => {
    const users = new InMemoryUserRepository([makeFreeUser("u1")]);
    const app = rcApp(users);

    const bad = await app.request(
      "/billing/revenuecat/webhook",
      rcInit("Bearer wrong", rcBody()),
      fakeEnv,
    );
    expect(bad.status).toBe(401);
    const missing = await app.request(
      "/billing/revenuecat/webhook",
      rcInit(null, rcBody()),
      fakeEnv,
    );
    expect(missing.status).toBe(401);
    expect((await users.findById("u1"))?.plan).toBe("free");
  });

  it("スキーマ違反の body は 400", async () => {
    const app = rcApp(new InMemoryUserRepository([makeFreeUser("u1")]));
    const res = await app.request(
      "/billing/revenuecat/webhook",
      rcInit(REVENUECAT_TEST_AUTH, { nope: 1 }),
      fakeEnv,
    );
    expect(res.status).toBe(400);
  });

  it("未知イベント（TEST 等）は 200 で handled: false（再送させない）", async () => {
    const app = rcApp(new InMemoryUserRepository([makeFreeUser("u1")]));
    const res = await app.request(
      "/billing/revenuecat/webhook",
      rcInit(REVENUECAT_TEST_AUTH, rcBody({ type: "TEST", entitlement_ids: null })),
      fakeEnv,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, handled: false });
  });
});
