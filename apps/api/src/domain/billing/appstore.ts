// ============================================================
// domain/billing — App Store（IAP）のポート
// ------------------------------------------------------------
// アプリ（iOS）のサブスク販売は App Store 経由（StoreKit 2）。
// 検証・復号の実体（Apple の x5c チェーン検証）は infrastructure に置き、
// アプリ層は「JWS を正規化されたトランザクション/通知にする」契約だけに依存する。
// Stripe(web) とは独立した第2の課金経路。ユーザーの紐付けは
// originalTransactionId（購入引き換え時に保存）で行う。
// ============================================================

import type { PaidPlan } from "./billing-gateway";

/** StoreKit 2 の署名済みトランザクション（検証・復号済みの必要最小限）。 */
export interface AppStoreTransaction {
  /** 購読商品ID（App Store Connect で登録した productId）。 */
  productId: string;
  /** 購入したアプリの bundleId（自アプリ以外は拒否する）。 */
  bundleId: string;
  /** 元トランザクションID。更新・失効通知でユーザーを引くキー。 */
  originalTransactionId: string;
  /** 有効期限（ms epoch）。サブスクでなければ null。 */
  expiresDate: number | null;
}

/** App Store Server Notifications V2 を解釈した結果。アプリ層はこの3種だけ知ればよい。 */
export type AppStoreNotification =
  /** 加入・更新・プラン変更（transaction の productId が現在の購読）。 */
  | { type: "subscribed"; transaction: AppStoreTransaction }
  /** 失効・返金（プランを free に落とす）。 */
  | { type: "revoked"; originalTransactionId: string }
  /** 関心の無い通知。 */
  | { type: "ignored" };

export interface AppStoreVerifier {
  /** 署名済みトランザクション(JWS)を検証して復号する。署名不正は例外。 */
  verifyTransaction(jws: string): Promise<AppStoreTransaction>;
  /** Server Notifications V2 の signedPayload を検証して正規化する。署名不正は例外。 */
  parseNotification(signedPayload: string): Promise<AppStoreNotification>;
}

/** IAP の設定（bundleId と商品ID）。mobile 側の PRODUCT_IDS と一致させる。 */
export interface AppStoreConfig {
  bundleId: string;
  /** RIGEL Next 月額の productId。 */
  productNext: string;
  /** RIGEL Pro 月額の productId。 */
  productPro: string;
}

/** 商品ID → プラン。知らない商品は null（誤ってプランを与えない）。 */
export function planForProduct(productId: string, config: AppStoreConfig): PaidPlan | null {
  if (productId === config.productNext) return "next";
  if (productId === config.productPro) return "pro";
  return null;
}
