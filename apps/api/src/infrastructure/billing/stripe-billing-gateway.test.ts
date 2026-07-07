import Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StripeBillingGateway, subscriptionUpdatedEvent } from "./stripe-billing-gateway";

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

// ------------------------------------------------------------
// 実 Stripe SDK を通す統合テスト（ネットワーク不要・決定的）
//   - parseEvent: generateTestHeaderString で実署名した Webhook を検証する
//   - createCheckoutSession / createPortalSession: fetch をスタブして
//     「Stripe API に何を送るか」を検証する（userId の紐付けが要）
// ------------------------------------------------------------

const CONFIG = {
  secretKey: "sk_test_dummy",
  webhookSecret: "whsec_gateway_test",
  priceNext: "price_next",
  pricePro: "price_pro",
};

describe("StripeBillingGateway.parseEvent（実SDKの署名検証）", () => {
  const gateway = new StripeBillingGateway(CONFIG);
  const stripe = new Stripe(CONFIG.secretKey);

  /** 実ペイロードに実署名を付ける（secret を替えれば改ざんの再現になる）。 */
  function signed(payload: unknown, secret = CONFIG.webhookSecret): [string, string] {
    const body = JSON.stringify(payload);
    return [body, stripe.webhooks.generateTestHeaderString({ payload: body, secret })];
  }

  it("checkout.session.completed → subscribed（client_reference_id と tier から）", async () => {
    const [body, sig] = signed({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "u1", metadata: { tier: "next" } } },
    });
    expect(await gateway.parseEvent(body, sig)).toEqual({
      type: "subscribed",
      userId: "u1",
      plan: "next",
    });
  });

  it("checkout.session.completed でも userId / tier が欠けていれば ignored（誤課金防止）", async () => {
    const [b1, s1] = signed({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: null, metadata: { tier: "pro" } } },
    });
    expect(await gateway.parseEvent(b1, s1)).toEqual({ type: "ignored" });
    const [b2, s2] = signed({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "u1", metadata: { tier: "platinum" } } },
    });
    expect(await gateway.parseEvent(b2, s2)).toEqual({ type: "ignored" });
  });

  it("customer.subscription.deleted → unsubscribed", async () => {
    const [body, sig] = signed({
      type: "customer.subscription.deleted",
      data: { object: { metadata: { userId: "u1" } } },
    });
    expect(await gateway.parseEvent(body, sig)).toEqual({ type: "unsubscribed", userId: "u1" });
  });

  it("customer.subscription.updated（Portal のプラン変更）→ subscribed", async () => {
    const [body, sig] = signed({
      type: "customer.subscription.updated",
      data: {
        object: {
          status: "active",
          metadata: { userId: "u1" },
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    });
    expect(await gateway.parseEvent(body, sig)).toEqual({
      type: "subscribed",
      userId: "u1",
      plan: "pro",
    });
  });

  it("関心の無いイベントタイプは ignored", async () => {
    const [body, sig] = signed({ type: "invoice.paid", data: { object: {} } });
    expect(await gateway.parseEvent(body, sig)).toEqual({ type: "ignored" });
  });

  it("別の secret で署名された（改ざん相当の）Webhook は拒否する", async () => {
    const [body, sig] = signed(
      { type: "checkout.session.completed", data: { object: {} } },
      "whsec_attacker",
    );
    await expect(gateway.parseEvent(body, sig)).rejects.toThrow();
  });

  it("署名後にペイロードを書き換えたら拒否する", async () => {
    const [body, sig] = signed({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "u1", metadata: { tier: "next" } } },
    });
    const tampered = body.replace('"u1"', '"attacker"');
    await expect(gateway.parseEvent(tampered, sig)).rejects.toThrow();
  });
});

describe("StripeBillingGateway.createCheckoutSession（Stripe へ送る内容）", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** fetch をスタブして Stripe API への各リクエストを捕まえる。 */
  function stubStripeApi(responses: Record<string, unknown>) {
    const calls: { url: string; body: URLSearchParams }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, body: new URLSearchParams(String(init?.body ?? "")) });
        const match = Object.entries(responses).find(([path]) => url.includes(path));
        return new Response(JSON.stringify(match ? match[1] : {}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    return calls;
  }

  it("mode=subscription・価格ID・userId の紐付け（client_reference_id / metadata）を送る", async () => {
    // userId が metadata に載らないと Webhook でユーザーを特定できず、
    // 「入金したのにプランが反映されない」事故になる。ここで機械検知する。
    const calls = stubStripeApi({
      "checkout/sessions": { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" },
    });
    const gateway = new StripeBillingGateway(CONFIG);
    const result = await gateway.createCheckoutSession({
      userId: "u1",
      plan: "pro",
      successUrl: "https://app/ok",
      cancelUrl: "https://app/ng",
    });
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/cs_1");
    const sent = calls.find((c) => c.url.includes("checkout/sessions"))!.body;
    expect(sent.get("mode")).toBe("subscription");
    expect(sent.get("line_items[0][price]")).toBe("price_pro");
    expect(sent.get("client_reference_id")).toBe("u1");
    expect(sent.get("metadata[tier]")).toBe("pro");
    expect(sent.get("subscription_data[metadata][userId]")).toBe("u1");
    expect(sent.get("success_url")).toBe("https://app/ok");
    expect(sent.get("cancel_url")).toBe("https://app/ng");
  });

  it("plan=next は next の価格IDを使う", async () => {
    const calls = stubStripeApi({
      "checkout/sessions": { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" },
    });
    await new StripeBillingGateway(CONFIG).createCheckoutSession({
      userId: "u1",
      plan: "next",
      successUrl: "https://app/ok",
      cancelUrl: "https://app/ng",
    });
    expect(
      calls.find((c) => c.url.includes("checkout/sessions"))!.body.get("line_items[0][price]"),
    ).toBe("price_next");
  });

  it("Stripe が url を返さなければ例外（呼び出し側で 502 にする）", async () => {
    stubStripeApi({ "checkout/sessions": { id: "cs_1", url: null } });
    await expect(
      new StripeBillingGateway(CONFIG).createCheckoutSession({
        userId: "u1",
        plan: "pro",
        successUrl: "https://app/ok",
        cancelUrl: "https://app/ng",
      }),
    ).rejects.toThrow();
  });
});

describe("StripeBillingGateway.createPortalSession（顧客の逆引きとポータル作成）", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubSearchAndPortal(subscriptions: unknown[]) {
    const calls: { url: string; body: URLSearchParams }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, body: new URLSearchParams(String(init?.body ?? "")) });
        const payload = url.includes("subscriptions/search")
          ? {
              object: "search_result",
              data: subscriptions,
              has_more: false,
              url: "/v1/subscriptions/search",
            }
          : { id: "bps_1", url: "https://billing.stripe.com/p/session_1" };
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    return calls;
  }

  it("metadata.userId で active なサブスクを逆引きし、その顧客のポータルURLを作る", async () => {
    const calls = stubSearchAndPortal([
      { id: "sub_1", status: "canceled", customer: "cus_old" },
      { id: "sub_2", status: "active", customer: "cus_1" },
    ]);
    const result = await new StripeBillingGateway(CONFIG).createPortalSession({
      userId: "u1",
      returnUrl: "https://app/settings",
    });
    expect(result).toEqual({ url: "https://billing.stripe.com/p/session_1" });
    // 検索クエリに userId が入っている（他人のサブスクを開かない）。
    const search = calls.find((c) => c.url.includes("subscriptions/search"))!;
    expect(decodeURIComponent(search.url)).toContain('metadata["userId"]:"u1"');
    const portal = calls.find((c) => c.url.includes("billing_portal/sessions"))!.body;
    expect(portal.get("customer")).toBe("cus_1");
    expect(portal.get("return_url")).toBe("https://app/settings");
  });

  it("active/trialing のサブスクが無ければ null（ポータルは作らない）", async () => {
    const calls = stubSearchAndPortal([{ id: "sub_1", status: "canceled", customer: "cus_old" }]);
    const result = await new StripeBillingGateway(CONFIG).createPortalSession({
      userId: "u1",
      returnUrl: "https://app/settings",
    });
    expect(result).toBeNull();
    expect(calls.some((c) => c.url.includes("billing_portal"))).toBe(false);
  });
});
