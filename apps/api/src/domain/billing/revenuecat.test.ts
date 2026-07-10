import { describe, expect, it } from "vitest";
import { planChangeForRevenueCatEvent, RevenueCatWebhookSchema } from "./revenuecat";

// 2026-07-09 に Stripe sandbox で実採取した INITIAL_PURCHASE（docs/plans/revenuecat-payloads/1.json）。
// 実世界の形をスキーマに焼き付ける（フィールドの増減に耐えるか＝寛容さの検証を兼ねる）。
// 注: entitlement_ids のみ採取後にダッシュボードで改名した識別子（next/pro）へ差し替えている
// （採取時は "RIGEL Next"。識別子は変更不可のため Entitlements を作り直した）。
const CAPTURED_INITIAL_PURCHASE = {
  event: {
    event_timestamp_ms: 1783569042252,
    product_id: "prod_UqqWtrBrjqMMGp",
    period_type: "NORMAL",
    purchased_at_ms: 1783568864000,
    expiration_at_ms: 1786247264000,
    environment: "SANDBOX",
    entitlement_id: null,
    entitlement_ids: ["next"],
    presented_offering_id: null,
    transaction_id: "si_UqqdjbLaRH1M5k",
    original_transaction_id: "si_UqqdjbLaRH1M5k",
    is_family_share: false,
    country_code: "JP",
    app_user_id: "rigel-test-1",
    aliases: ["rigel-test-1"],
    original_app_user_id: "rigel-test-1",
    currency: "JPY",
    price: 2.956,
    price_in_purchased_currency: 480.0,
    subscriber_attributes: {},
    store: "STRIPE",
    takehome_percentage: 0.9594,
    offer_code: null,
    tax_percentage: 0.0,
    commission_percentage: 0.0406,
    metadata: {},
    renewal_number: 1,
    discount_percentage: null,
    discount_amount: null,
    discount_identifier: null,
    type: "INITIAL_PURCHASE",
    id: "726E73CD-876B-4A80-9A56-AEF201BD33E4",
    app_id: "app29181c6f6f",
  },
  api_version: "1.0",
};

/** 写像テスト用の最小イベント。 */
function event(over: Record<string, unknown> = {}) {
  return RevenueCatWebhookSchema.parse({
    api_version: "1.0",
    event: {
      id: "E1",
      type: "INITIAL_PURCHASE",
      app_user_id: "u1",
      entitlement_ids: ["next"],
      environment: "PRODUCTION",
      ...over,
    },
  }).event;
}

describe("RevenueCatWebhookSchema（Webhook payload の検証）", () => {
  it("実採取の INITIAL_PURCHASE ペイロードが通り、必要フィールドが取れる", () => {
    const parsed = RevenueCatWebhookSchema.parse(CAPTURED_INITIAL_PURCHASE);
    expect(parsed.event.id).toBe("726E73CD-876B-4A80-9A56-AEF201BD33E4");
    expect(parsed.event.type).toBe("INITIAL_PURCHASE");
    expect(parsed.event.app_user_id).toBe("rigel-test-1");
    expect(parsed.event.entitlement_ids).toEqual(["next"]);
    expect(parsed.event.environment).toBe("SANDBOX");
    expect(parsed.event.store).toBe("STRIPE");
  });

  it("store が無いイベントも通る（null 扱い。将来イベントで受け口を壊さない）", () => {
    expect(event({ store: undefined }).store).toBeNull();
  });

  it("store が空文字でもイベント全体を落とさない（null 扱い。400→再送地獄にしない）", () => {
    expect(event({ store: "" }).store).toBeNull();
  });

  it("未知のイベント種別・環境値でも parse は通る（将来の追加で受け口を壊さない）", () => {
    expect(() => event({ type: "SOME_FUTURE_EVENT", environment: "STAGING" })).not.toThrow();
  });

  it("必須フィールド（event / id / type / app_user_id）が欠けたら拒否する", () => {
    expect(() => RevenueCatWebhookSchema.parse({ api_version: "1.0" })).toThrow();
    expect(() => event({ id: undefined })).toThrow();
    expect(() => event({ type: undefined })).toThrow();
    expect(() => event({ app_user_id: undefined })).toThrow();
  });

  it("entitlement_ids が無い/null のイベントも通る（TEST イベント等）", () => {
    expect(event({ entitlement_ids: null }).entitlement_ids).toBeNull();
    expect(event({ entitlement_ids: undefined }).entitlement_ids).toBeNull();
  });
});

describe("planChangeForRevenueCatEvent（event→plan の写像）", () => {
  const cases = [
    {
      name: "INITIAL_PURCHASE(next) は next を付与（購入経路 store も一緒に返す）",
      over: { type: "INITIAL_PURCHASE", entitlement_ids: ["next"], store: "APP_STORE" },
      want: { action: "set", plan: "next", store: "APP_STORE" },
    },
    {
      name: "RENEWAL(pro) は pro を付与",
      over: { type: "RENEWAL", entitlement_ids: ["pro"], store: "STRIPE" },
      want: { action: "set", plan: "pro", store: "STRIPE" },
    },
    {
      name: "UNCANCELLATION(next) は next を再付与",
      over: { type: "UNCANCELLATION", entitlement_ids: ["next"], store: "APP_STORE" },
      want: { action: "set", plan: "next", store: "APP_STORE" },
    },
    {
      name: "PRODUCT_CHANGE(pro) はアップグレード先の pro",
      over: { type: "PRODUCT_CHANGE", entitlement_ids: ["pro"], store: "PLAY_STORE" },
      want: { action: "set", plan: "pro", store: "PLAY_STORE" },
    },
    {
      name: "複数 entitlement は上位（pro）を採る",
      over: { type: "INITIAL_PURCHASE", entitlement_ids: ["next", "pro"] },
      want: { action: "set", plan: "pro", store: null },
    },
    {
      name: "EXPIRATION は free へ落とす（購入経路もクリア）",
      over: { type: "EXPIRATION", entitlement_ids: ["next"], store: "APP_STORE" },
      want: { action: "set", plan: "free", store: null },
    },
    {
      name: "CANCELLATION（自動更新オフ）は期限まで有効なので変更しない",
      over: { type: "CANCELLATION", entitlement_ids: ["next"] },
      want: { action: "none" },
    },
    {
      name: "未知のイベント種別は変更しない",
      over: { type: "TEST", entitlement_ids: ["next"] },
      want: { action: "none" },
    },
    {
      name: "写像に無い entitlement 識別子（ダッシュボード設定ミス）は付与しない",
      over: { type: "INITIAL_PURCHASE", entitlement_ids: ["RIGEL Next"] },
      want: { action: "none" },
    },
    {
      name: "entitlement_ids が null の付与イベントは変更しない",
      over: { type: "INITIAL_PURCHASE", entitlement_ids: null },
      want: { action: "none" },
    },
  ] as const;

  it.each(cases)("$name", ({ over, want }) => {
    expect(planChangeForRevenueCatEvent(event(over))).toEqual(want);
  });
});
