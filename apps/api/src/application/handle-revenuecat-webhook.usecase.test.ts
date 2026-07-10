import { describe, expect, it } from "vitest";
import { makeFreeUser } from "../test-support/billing";
import {
  InMemoryRevenueCatEventRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { HandleRevenueCatWebhook } from "./handle-revenuecat-webhook.usecase";

/** RevenueCat Webhook body（実採取形の最小）。 */
function body(over: Record<string, unknown> = {}) {
  return {
    api_version: "1.0",
    event: {
      id: "E1",
      type: "INITIAL_PURCHASE",
      app_user_id: "u1",
      entitlement_ids: ["next"],
      environment: "PRODUCTION",
      ...over,
    },
  };
}

function setup(opts: { allowSandbox?: boolean } = {}) {
  const users = new InMemoryUserRepository([makeFreeUser("u1")]);
  const events = new InMemoryRevenueCatEventRepository();
  const uc = new HandleRevenueCatWebhook({
    users,
    events,
    allowSandbox: opts.allowSandbox ?? false,
  });
  return { users, events, uc };
}

describe("HandleRevenueCatWebhook（RevenueCat Webhook → plan 反映）", () => {
  it("INITIAL_PURCHASE(next) で plan が next になる", async () => {
    const { users, uc } = setup();
    const result = await uc.execute({ body: body() });
    expect(result).toEqual({ handled: true });
    expect((await users.findById("u1"))!.plan).toBe("next");
  });

  it("EXPIRATION で free に落ちる", async () => {
    const { users, uc } = setup();
    await uc.execute({ body: body({ id: "E1", entitlement_ids: ["pro"] }) });
    const result = await uc.execute({ body: body({ id: "E2", type: "EXPIRATION" }) });
    expect(result).toEqual({ handled: true });
    expect((await users.findById("u1"))!.plan).toBe("free");
  });

  it("購入経路（store）を plan と一緒に記録し、失効でクリアする", async () => {
    const { users, uc } = setup();
    await uc.execute({ body: body({ id: "E1", store: "APP_STORE" }) });
    expect((await users.findById("u1"))!.planStore).toBe("APP_STORE");

    await uc.execute({ body: body({ id: "E2", type: "EXPIRATION", store: "APP_STORE" }) });
    expect((await users.findById("u1"))!.planStore).toBeNull();
  });

  it("CANCELLATION（自動更新オフ）は plan を変えない", async () => {
    const { users, uc } = setup();
    await uc.execute({ body: body({ id: "E1" }) });
    const result = await uc.execute({ body: body({ id: "E2", type: "CANCELLATION" }) });
    expect(result).toEqual({ handled: false });
    expect((await users.findById("u1"))!.plan).toBe("next");
  });

  it("同一 event.id の再送は二重適用しない（失効後の再送で plan も planStore も復活しない）", async () => {
    const { users, uc } = setup();
    await uc.execute({ body: body({ id: "E1", store: "APP_STORE" }) }); // next
    await uc.execute({ body: body({ id: "E2", type: "EXPIRATION" }) }); // free
    const replay = await uc.execute({ body: body({ id: "E1", store: "APP_STORE" }) }); // E1 再送
    expect(replay).toEqual({ handled: false });
    expect((await users.findById("u1"))!.plan).toBe("free");
    expect((await users.findById("u1"))!.planStore).toBeNull();
  });

  it("対象ユーザーが居なければ何もしない（handled: false。例外にしない）", async () => {
    const { uc } = setup();
    const result = await uc.execute({ body: body({ app_user_id: "nobody" }) });
    expect(result).toEqual({ handled: false });
  });

  it("SANDBOX イベントは既定で無視し、allowSandbox=true なら適用する（開発環境用）", async () => {
    const ignored = setup();
    expect(await ignored.uc.execute({ body: body({ environment: "SANDBOX" }) })).toEqual({
      handled: false,
    });
    expect((await ignored.users.findById("u1"))!.plan).toBe("free");

    const allowed = setup({ allowSandbox: true });
    expect(await allowed.uc.execute({ body: body({ environment: "SANDBOX" }) })).toEqual({
      handled: true,
    });
    expect((await allowed.users.findById("u1"))!.plan).toBe("next");
  });

  it("スキーマ違反の body は例外（ルートが 400 を返す）", async () => {
    const { uc } = setup();
    await expect(uc.execute({ body: { nope: 1 } })).rejects.toThrow();
    await expect(uc.execute({ body: null })).rejects.toThrow();
  });
});
