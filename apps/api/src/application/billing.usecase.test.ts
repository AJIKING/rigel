import { describe, expect, it } from "vitest";
import type {
  BillingEvent,
  BillingGateway,
  CheckoutParams,
} from "../domain/billing/billing-gateway";
import { User } from "../domain/user/user";
import { InMemoryUserRepository } from "../test-support/in-memory";
import { HandleBillingWebhook } from "./handle-billing-webhook.usecase";
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
  constructor(private readonly event: BillingEvent) {}
  createCheckoutSession(params: CheckoutParams): Promise<{ url: string }> {
    this.lastCheckout = params;
    return Promise.resolve({ url: `https://stripe.test/pay/${params.userId}` });
  }
  parseEvent(): Promise<BillingEvent> {
    return Promise.resolve(this.event);
  }
}

describe("StartCheckout", () => {
  it("userId を載せて Checkout URL を返す", async () => {
    const gateway = new FakeBillingGateway({ type: "ignored" });
    const url = await new StartCheckout(gateway).execute({
      userId: "u1",
      successUrl: "https://app/ok",
      cancelUrl: "https://app/ng",
    });
    expect(url.url).toContain("u1");
    expect(gateway.lastCheckout?.successUrl).toBe("https://app/ok");
  });
});

describe("HandleBillingWebhook", () => {
  it("subscribed でプランを paid にして保存する", async () => {
    const users = new InMemoryUserRepository([freeUser("u1")]);
    const gateway = new FakeBillingGateway({ type: "subscribed", userId: "u1" });
    const result = await new HandleBillingWebhook(gateway, users).execute({
      payload: "{}",
      signature: "sig",
    });
    expect(result.handled).toBe(true);
    expect((await users.findById("u1"))?.plan).toBe("paid");
  });

  it("unsubscribed でプランを free に戻す", async () => {
    const paid = freeUser("u1");
    paid.changePlan("paid");
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
    const gateway = new FakeBillingGateway({ type: "subscribed", userId: "ghost" });
    const result = await new HandleBillingWebhook(gateway, users).execute({
      payload: "{}",
      signature: "sig",
    });
    expect(result.handled).toBe(false);
  });
});
