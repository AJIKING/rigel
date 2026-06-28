// ============================================================
// domain/billing — 課金ゲートウェイのポート（インターフェース）
// ------------------------------------------------------------
// 決済プロバイダ(Stripe 等)の都合をアプリ層から隠す。アプリ層は「Checkout を
// 始める」「Webhook を正規化されたイベントにする」という契約だけに依存する。
// 「誰が」課金/解約したかは userId で表現する（プロバイダの顧客IDは持ち込まない）。
// ============================================================

/** 課金対象の有料プラン（無料以外）。 */
export type PaidPlan = "next" | "pro";

/** Webhook を解釈した結果。アプリ層はこの3種だけ知っていればよい。 */
export type BillingEvent =
  | { type: "subscribed"; userId: string; plan: PaidPlan }
  | { type: "unsubscribed"; userId: string }
  /** 関心の無いイベント（無視してよい）。 */
  | { type: "ignored" };

export interface CheckoutParams {
  userId: string;
  /** 申し込む有料プラン。 */
  plan: PaidPlan;
  /** 決済成功後に戻すURL。 */
  successUrl: string;
  /** 決済中断時に戻すURL。 */
  cancelUrl: string;
}

export interface BillingGateway {
  /** サブスク用の Checkout セッションを作り、決済ページのURLを返す。 */
  createCheckoutSession(params: CheckoutParams): Promise<{ url: string }>;
  /** Webhook ペイロードを署名検証し、正規化したイベントにする。検証失敗は例外。 */
  parseEvent(payload: string, signature: string): Promise<BillingEvent>;
}
