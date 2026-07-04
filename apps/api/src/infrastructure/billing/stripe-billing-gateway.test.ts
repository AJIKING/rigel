import { describe, expect, it } from "vitest";
import { subscriptionUpdatedEvent } from "./stripe-billing-gateway";

const PRICES = { priceNext: "price_next", pricePro: "price_pro" };

function sub(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    metadata: { userId: "u1" },
    items: { data: [{ price: { id: "price_pro" } }] },
    ...overrides,
  };
}

describe("subscriptionUpdatedEvent（Portal でのプラン変更の正規化）", () => {
  it("active なサブスクの価格IDからプランを引いて subscribed にする", () => {
    expect(subscriptionUpdatedEvent(sub(), PRICES)).toEqual({
      type: "subscribed",
      userId: "u1",
      plan: "pro",
    });
    expect(
      subscriptionUpdatedEvent(sub({ items: { data: [{ price: { id: "price_next" } }] } }), PRICES),
    ).toEqual({ type: "subscribed", userId: "u1", plan: "next" });
  });

  it("userId メタデータが無ければ無視", () => {
    expect(subscriptionUpdatedEvent(sub({ metadata: {} }), PRICES)).toEqual({ type: "ignored" });
  });

  it("active/trialing 以外（past_due等）は動かさない（解約確定は deleted が担う）", () => {
    expect(subscriptionUpdatedEvent(sub({ status: "past_due" }), PRICES)).toEqual({
      type: "ignored",
    });
    expect(subscriptionUpdatedEvent(sub({ status: "canceled" }), PRICES)).toEqual({
      type: "ignored",
    });
  });

  it("知らない価格IDは無視（誤って free に落とさない）", () => {
    expect(
      subscriptionUpdatedEvent(sub({ items: { data: [{ price: { id: "price_x" } }] } }), PRICES),
    ).toEqual({ type: "ignored" });
  });
});
