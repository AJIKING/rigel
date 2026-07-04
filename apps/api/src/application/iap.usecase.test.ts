import { describe, expect, it } from "vitest";
import type {
  AppStoreConfig,
  AppStoreNotification,
  AppStoreTransaction,
  AppStoreVerifier,
} from "../domain/billing/appstore";
import { planForProduct } from "../domain/billing/appstore";
import { User } from "../domain/user/user";
import { InMemoryUserRepository } from "../test-support/in-memory";
import { HandleAppStoreNotification } from "./handle-appstore-notification.usecase";
import { RedeemAppStorePurchase } from "./redeem-appstore-purchase.usecase";

const CONFIG: AppStoreConfig = {
  bundleId: "jp.co.plaria.rigel",
  productNext: "rigel.next.monthly",
  productPro: "rigel.pro.monthly",
};

const NOW = new Date("2026-07-04T00:00:00.000Z");

function freeUser(id: string): User {
  return new User({
    id,
    googleSub: `sub-${id}`,
    plan: "free",
    analysisCountThisMonth: 0,
    countResetAt: new Date("2026-08-01T00:00:00.000Z"),
  });
}

function tx(overrides: Partial<AppStoreTransaction> = {}): AppStoreTransaction {
  return {
    productId: "rigel.pro.monthly",
    bundleId: "jp.co.plaria.rigel",
    originalTransactionId: "orig-1",
    expiresDate: NOW.getTime() + 30 * 24 * 3600 * 1000,
    ...overrides,
  };
}

/** verifyTransaction / parseNotification が固定値を返す（または例外を投げる）フェイク。 */
class FakeVerifier implements AppStoreVerifier {
  constructor(
    private readonly transaction: AppStoreTransaction | Error,
    private readonly notification: AppStoreNotification = { type: "ignored" },
  ) {}
  verifyTransaction(): Promise<AppStoreTransaction> {
    if (this.transaction instanceof Error) return Promise.reject(this.transaction);
    return Promise.resolve(this.transaction);
  }
  parseNotification(): Promise<AppStoreNotification> {
    return Promise.resolve(this.notification);
  }
}

describe("planForProduct", () => {
  it("商品IDからプランを引く。知らない商品は null（誤課金防止）", () => {
    expect(planForProduct("rigel.next.monthly", CONFIG)).toBe("next");
    expect(planForProduct("rigel.pro.monthly", CONFIG)).toBe("pro");
    expect(planForProduct("evil.product", CONFIG)).toBeNull();
  });
});

describe("RedeemAppStorePurchase（購入の引き換え）", () => {
  const deps = (t: AppStoreTransaction | Error, users: InMemoryUserRepository) => ({
    verifier: new FakeVerifier(t),
    users,
    config: CONFIG,
    now: () => NOW,
  });

  it("正しい購入JWSでプランが上がり、originalTransactionId が紐づく", async () => {
    const users = new InMemoryUserRepository([freeUser("u1")]);
    const result = await new RedeemAppStorePurchase(deps(tx(), users)).execute({
      userId: "u1",
      jws: "signed-jws",
    });
    expect(result).toEqual({ ok: true, plan: "pro" });
    const saved = await users.findById("u1");
    expect(saved?.plan).toBe("pro");
    expect(saved?.appStoreOriginalTransactionId).toBe("orig-1");
  });

  it("署名検証に失敗した JWS は invalid_transaction（プランは変えない）", async () => {
    const users = new InMemoryUserRepository([freeUser("u1")]);
    const result = await new RedeemAppStorePurchase(deps(new Error("bad sig"), users)).execute({
      userId: "u1",
      jws: "tampered",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_transaction" });
    expect((await users.findById("u1"))?.plan).toBe("free");
  });

  it("別アプリの bundleId は拒否する", async () => {
    const users = new InMemoryUserRepository([freeUser("u1")]);
    const result = await new RedeemAppStorePurchase(
      deps(tx({ bundleId: "com.evil.app" }), users),
    ).execute({ userId: "u1", jws: "jws" });
    expect(result).toEqual({ ok: false, reason: "wrong_bundle" });
  });

  it("知らない商品IDは拒否する", async () => {
    const users = new InMemoryUserRepository([freeUser("u1")]);
    const result = await new RedeemAppStorePurchase(
      deps(tx({ productId: "unknown.product" }), users),
    ).execute({ userId: "u1", jws: "jws" });
    expect(result).toEqual({ ok: false, reason: "unknown_product" });
  });

  it("期限切れのトランザクションは拒否する", async () => {
    const users = new InMemoryUserRepository([freeUser("u1")]);
    const result = await new RedeemAppStorePurchase(
      deps(tx({ expiresDate: NOW.getTime() - 1000 }), users),
    ).execute({ userId: "u1", jws: "jws" });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });
});

describe("HandleAppStoreNotification（更新・失効の反映）", () => {
  function usecase(notification: AppStoreNotification, users: InMemoryUserRepository) {
    return new HandleAppStoreNotification({
      verifier: new FakeVerifier(tx(), notification),
      users,
      config: CONFIG,
    });
  }

  /** 加入済み（orig-1 に紐づく pro ユーザー）を作る。 */
  function subscribedUser(id: string): User {
    const u = freeUser(id);
    u.changePlan("pro");
    u.linkAppStoreSubscription("orig-1");
    return u;
  }

  it("subscribed（更新/プラン変更）で該当ユーザーのプランを反映する", async () => {
    const users = new InMemoryUserRepository([subscribedUser("u1")]);
    const result = await usecase(
      { type: "subscribed", transaction: tx({ productId: "rigel.next.monthly" }) },
      users,
    ).execute({ signedPayload: "sp" });
    expect(result.handled).toBe(true);
    expect((await users.findById("u1"))?.plan).toBe("next");
  });

  it("revoked（失効/返金）で free に落とす", async () => {
    const users = new InMemoryUserRepository([subscribedUser("u1")]);
    const result = await usecase(
      { type: "revoked", originalTransactionId: "orig-1" },
      users,
    ).execute({ signedPayload: "sp" });
    expect(result.handled).toBe(true);
    expect((await users.findById("u1"))?.plan).toBe("free");
  });

  it("該当ユーザーが居なければ handled=false", async () => {
    const users = new InMemoryUserRepository([]);
    const result = await usecase(
      { type: "revoked", originalTransactionId: "orig-9" },
      users,
    ).execute({ signedPayload: "sp" });
    expect(result.handled).toBe(false);
  });

  it("別 bundleId の subscribed は無視する", async () => {
    const users = new InMemoryUserRepository([subscribedUser("u1")]);
    const result = await usecase(
      { type: "subscribed", transaction: tx({ bundleId: "com.evil.app" }) },
      users,
    ).execute({ signedPayload: "sp" });
    expect(result.handled).toBe(false);
    expect((await users.findById("u1"))?.plan).toBe("pro");
  });

  it("ignored は何もしない", async () => {
    const users = new InMemoryUserRepository([subscribedUser("u1")]);
    const result = await usecase({ type: "ignored" }, users).execute({ signedPayload: "sp" });
    expect(result.handled).toBe(false);
  });
});
