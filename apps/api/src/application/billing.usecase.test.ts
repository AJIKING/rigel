import { describe, expect, it } from "vitest";
import type {
  BillingEvent,
  BillingGateway,
  CheckoutParams,
} from "../domain/billing/billing-gateway";
import { User } from "../domain/user/user";
import { InMemoryUserRepository } from "../test-support/in-memory";
import { HandleBillingWebhook } from "./handle-billing-webhook.usecase";
import { OpenBillingPortal } from "./open-billing-portal.usecase";
import { StartCheckout } from "./start-checkout.usecase";

function freeUser(id: string): User {
  return new User({
    id,
    googleSub: `sub-${id}`,
    plan: "free",
    analysisCountThisMonth: 0,
    countResetAt: new Date("2026-07-01T00:00:00.000Z"),
  });
}

/** parseEvent は固定イベントを返すフェイク。createCheckoutSession は引数を記録する。 */
class FakeBillingGateway implements BillingGateway {
  lastCheckout?: CheckoutParams;
  constructor(
    private readonly event: BillingEvent,
    private readonly portalUrl: string | null = null,
  ) {}
  createCheckoutSession(params: CheckoutParams): Promise<{ url: string }> {
    this.lastCheckout = params;
    return Promise.resolve({ url: `https://stripe.test/pay/${params.userId}` });
  }
  parseEvent(): Promise<BillingEvent> {
    return Promise.resolve(this.event);
  }
  createPortalSession(): Promise<{ url: string } | null> {
    return Promise.resolve(this.portalUrl ? { url: this.portalUrl } : null);
  }
}

describe("StartCheckout", () => {
  const params = {
    userId: "u1",
    plan: "pro",
    successUrl: "https://app/ok",
    cancelUrl: "https://app/ng",
  } as const;

  it("free ユーザーは userId と plan を載せて Checkout URL を得る", async () => {
    const users = new InMemoryUserRepository([freeUser("u1")]);
    const gateway = new FakeBillingGateway({ type: "ignored" });
    const result = await new StartCheckout(gateway, users).execute(params);
    expect(result).toEqual({ ok: true, url: "https://stripe.test/pay/u1" });
    expect(gateway.lastCheckout?.plan).toBe("pro");
    expect(gateway.lastCheckout?.successUrl).toBe("https://app/ok");
  });

  it("有料プラン加入中は拒否する（二重サブスク＝二重課金の防止）", async () => {
    const paid = freeUser("u1");
    paid.changePlan("next");
    const users = new InMemoryUserRepository([paid]);
    const gateway = new FakeBillingGateway({ type: "ignored" });
    const result = await new StartCheckout(gateway, users).execute(params);
    expect(result).toEqual({ ok: false, reason: "already_subscribed" });
    // Checkout セッションは作らない（作った時点で二重課金の入口になる）。
    expect(gateway.lastCheckout).toBeUndefined();
  });
});

describe("OpenBillingPortal", () => {
  it("加入中ユーザーには決済ポータルのURLを返す", async () => {
    const gateway = new FakeBillingGateway({ type: "ignored" }, "https://stripe.test/portal/u1");
    const result = await new OpenBillingPortal(gateway).execute({
      userId: "u1",
      returnUrl: "https://app/settings",
    });
    expect(result).toEqual({ ok: true, url: "https://stripe.test/portal/u1" });
  });

  it("サブスクリプションが無ければ not_subscribed", async () => {
    const gateway = new FakeBillingGateway({ type: "ignored" }, null);
    const result = await new OpenBillingPortal(gateway).execute({
      userId: "u1",
      returnUrl: "https://app/settings",
    });
    expect(result).toEqual({ ok: false, reason: "not_subscribed" });
  });
});

describe("HandleBillingWebhook", () => {
  it("subscribed でプランを申し込んだ tier にして保存する", async () => {
    const users = new InMemoryUserRepository([freeUser("u1")]);
    const gateway = new FakeBillingGateway({ type: "subscribed", userId: "u1", plan: "next" });
    const result = await new HandleBillingWebhook(gateway, users).execute({
      payload: "{}",
      signature: "sig",
    });
    expect(result.handled).toBe(true);
    expect((await users.findById("u1"))?.plan).toBe("next");
  });

  it("unsubscribed でプランを free に戻す", async () => {
    const paid = freeUser("u1");
    paid.changePlan("pro");
    const users = new InMemoryUserRepository([paid]);
    const gateway = new FakeBillingGateway({ type: "unsubscribed", userId: "u1" });
    const result = await new HandleBillingWebhook(gateway, users).execute({
      payload: "{}",
      signature: "sig",
    });
    expect(result.handled).toBe(true);
    expect((await users.findById("u1"))?.plan).toBe("free");
  });

  it("無関係なイベントは何もしない", async () => {
    const users = new InMemoryUserRepository([freeUser("u1")]);
    const gateway = new FakeBillingGateway({ type: "ignored" });
    const result = await new HandleBillingWebhook(gateway, users).execute({
      payload: "{}",
      signature: "sig",
    });
    expect(result.handled).toBe(false);
    expect((await users.findById("u1"))?.plan).toBe("free");
  });

  it("対象ユーザーが居なければ handled=false", async () => {
    const users = new InMemoryUserRepository([]);
    const gateway = new FakeBillingGateway({ type: "subscribed", userId: "ghost", plan: "pro" });
    const result = await new HandleBillingWebhook(gateway, users).execute({
      payload: "{}",
      signature: "sig",
    });
    expect(result.handled).toBe(false);
  });
});
