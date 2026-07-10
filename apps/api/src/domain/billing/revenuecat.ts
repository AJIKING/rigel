// ============================================================
// domain/billing — RevenueCat Webhook の検証と plan 写像
// ------------------------------------------------------------
// エンタイトルメントの真実源は RevenueCat（web=Stripe / アプリ=IAP を横串）。
// この Webhook だけが users.plan（D1 射影）を書く。
// ペイロードは実採取（docs/plans/revenuecat-payloads/ 2026-07-09）に基づく。
// 未知のイベント種別・環境値は parse を通し、写像側で「変更なし」に倒す
// （拒否すると RevenueCat が再送し続けるため、受けて無視が正しい）。
// Plan: docs/plans/billing-revenuecat.md
// ============================================================

import { z } from "zod";
import type { Plan } from "../user/user";

/** Webhook の event 部（必要最小限のみ検証。他フィールドは通す）。 */
const RevenueCatEventSchema = z.object({
  /** イベントの一意ID（UUID）。冪等処理のキー。 */
  id: z.string().min(1),
  /** イベント種別。将来の追加に耐えるよう enum にしない。 */
  type: z.string().min(1),
  /** RevenueCat に渡した app_user_id ＝ rigel の users.id。 */
  app_user_id: z.string().min(1),
  /** このイベントで有効な entitlement 識別子（next/pro）。TEST 等は null。 */
  entitlement_ids: z.array(z.string()).nullable().default(null),
  /** "SANDBOX" | "PRODUCTION"（将来値も通す）。本番受け口の環境フィルタに使う。 */
  environment: z.string().min(1),
  /** 購入経路（"APP_STORE" | "PLAY_STORE" | "STRIPE" 等。将来値も通す）。
   *  web の購読管理の出し分け（Stripe ポータル vs ストアの購読設定）に使う。
   *  補助情報なので欠損・空文字でイベント全体を落とさない（400→再送地獄を防ぐ）。 */
  store: z
    .string()
    .nullable()
    .default(null)
    .transform((s) => s || null),
});
export type RevenueCatEvent = z.infer<typeof RevenueCatEventSchema>;

/** Webhook 全体（封筒）。 */
export const RevenueCatWebhookSchema = z.object({
  api_version: z.string(),
  event: RevenueCatEventSchema,
});

/** entitlement 識別子 → プラン。RevenueCat ダッシュボードの Entitlements 設定と一致させる。 */
const ENTITLEMENT_TO_PLAN: Record<string, Plan> = { next: "next", pro: "pro" };

/** プランを付与するイベント種別（購読の開始・継続・復帰・変更）。 */
const GRANT_EVENTS = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE"]);

export type RevenueCatPlanChange =
  { action: "set"; plan: Plan; store: string | null } | { action: "none" };

/** 処理済み Webhook イベントの記録（冪等キー = event.id）。実体は D1。 */
export interface RevenueCatEventRepository {
  isProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;
}

/** RevenueCat REST へのポート。Stripe 購読を RevenueCat に登録する（横串一元管理の起点）。 */
export interface RevenueCatGateway {
  /** POST /v1/receipts（fetch_token = Stripe subscription id）。失敗は例外。 */
  registerStripeSubscription(params: { appUserId: string; subscriptionId: string }): Promise<void>;
}

/**
 * イベント→plan の写像（純関数）。
 * - 付与イベント: entitlement に応じて next/pro（複数なら上位を採る）。
 *   写像に無い識別子（ダッシュボード設定ミス）は付与しない。
 * - EXPIRATION のみ free へ落とす。CANCELLATION は自動更新オフ＝期限まで有効なので変更しない。
 * - 未知イベントは変更しない（受けて無視）。
 */
/** 上位プラン優先（pro > next）。複数 entitlement が同時に有効なとき上を採る。 */
const PLAN_PRIORITY: readonly Plan[] = ["pro", "next"];

export function planChangeForRevenueCatEvent(event: RevenueCatEvent): RevenueCatPlanChange {
  if (GRANT_EVENTS.has(event.type)) {
    const plans = (event.entitlement_ids ?? []).flatMap((id) => {
      const plan = ENTITLEMENT_TO_PLAN[id];
      return plan ? [plan] : [];
    });
    const plan = PLAN_PRIORITY.find((p) => plans.includes(p));
    return plan ? { action: "set", plan, store: event.store } : { action: "none" };
  }
  // 失効は購入経路もクリアする（free に購読管理の導線は不要）。
  if (event.type === "EXPIRATION") return { action: "set", plan: "free", store: null };
  return { action: "none" };
}
