import { describe, expect, it } from "vitest";
import { HttpRevenueCatGateway } from "./http-revenuecat-gateway";

describe("HttpRevenueCatGateway（RevenueCat REST への購読登録）", () => {
  it("POST /v1/receipts に X-Platform: stripe と app_user_id / fetch_token を送る", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ subscriber: {} }), { status: 200 });
    }) as unknown as typeof fetch;

    const gateway = new HttpRevenueCatGateway({ stripePublicKey: "strp_test", fetchImpl });
    await gateway.registerStripeSubscription({ appUserId: "u1", subscriptionId: "sub_123" });

    expect(captured!.url).toBe("https://api.revenuecat.com/v1/receipts");
    const { init } = captured!;
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer strp_test");
    expect(new Headers(init.headers).get("x-platform")).toBe("stripe");
    expect(JSON.parse(String(init.body))).toEqual({
      app_user_id: "u1",
      fetch_token: "sub_123",
    });
  });

  it("2xx 以外は例外（呼び出し側が握りつぶすか再試行するかを決める）", async () => {
    const fetchImpl = (async () => new Response("bad", { status: 400 })) as unknown as typeof fetch;
    const gateway = new HttpRevenueCatGateway({ stripePublicKey: "strp_test", fetchImpl });
    await expect(
      gateway.registerStripeSubscription({ appUserId: "u1", subscriptionId: "sub_x" }),
    ).rejects.toThrow();
  });
});
