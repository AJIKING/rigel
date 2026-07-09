// RevenueCat SDK（react-native-purchases）の薄いラッパ。
// エンタイトルメントの真実源は RevenueCat（web=Stripe / アプリ=IAP を横串一元管理）。
// 購入成立→サーバ plan 反映は RevenueCat Webhook 経由（apps/api）なので、
// アプリは「購入する・ユーザーIDを紐づける」ことだけに責任を持つ。
// ネイティブモジュールのため Expo Go では動かない（dev build / EAS 必須）。
// キー未設定（開発・CI）では全操作を安全に無効化する。
// Plan: docs/plans/billing-revenuecat.md

import Purchases from "react-native-purchases";
import type { PaidPlan } from "@rigel/ui";
import { IAP_PRODUCT_IDS } from "./iap";
import { revenueCatApiKey } from "./purchases-keys";

/** RevenueCat が使えるか（SDK キーが設定されているか）。 */
export function purchasesEnabled(): boolean {
  return revenueCatApiKey() !== "";
}

let configured = false;

/** アプリ起動時に1回だけ呼ぶ。キー未設定なら何もしない。 */
export function configurePurchases(): void {
  if (!purchasesEnabled() || configured) return;
  Purchases.configure({ apiKey: revenueCatApiKey() });
  configured = true;
}

/** ログイン成立時に呼ぶ。app_user_id = rigel の users.id（これが横串の要）。
 *  失敗しても認証フローを壊さない（次回起動時の再ログインで回復する）。 */
export async function logInPurchases(userId: string): Promise<void> {
  if (!purchasesEnabled()) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn("RevenueCat logIn に失敗", e);
  }
}

/** ログアウト時に呼ぶ（匿名ユーザーへ戻す）。 */
export async function logOutPurchases(): Promise<void> {
  if (!purchasesEnabled()) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    console.warn("RevenueCat logOut に失敗", e);
  }
}

export type PurchaseOutcome = "purchased" | "cancelled" | "failed" | "unavailable";

/** プランを購入する。offerings から商品ID（IAP_PRODUCT_IDS）一致のパッケージを買う。 */
export async function purchasePlan(plan: PaidPlan): Promise<PurchaseOutcome> {
  if (!purchasesEnabled()) return "unavailable";
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages.find(
      (p) => p.product.identifier === IAP_PRODUCT_IDS[plan],
    );
    if (!pkg) return "failed"; // ダッシュボードの Offerings 設定漏れ。
    await Purchases.purchasePackage(pkg);
    return "purchased";
  } catch (e) {
    return (e as { userCancelled?: boolean }).userCancelled ? "cancelled" : "failed";
  }
}

/** 購読の管理URL（App Store / Play の購読設定）。ストア購読が無ければ null。 */
export async function purchasesManagementUrl(): Promise<string | null> {
  if (!purchasesEnabled()) return null;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.managementURL ?? null;
  } catch {
    return null;
  }
}
