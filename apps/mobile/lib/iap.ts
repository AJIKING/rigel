// IAP の購読商品ID（App Store / Play 共通の体系）。
// App Store Connect / Play Console の商品登録、および RevenueCat の Products 設定と
// 必ず一致させること。ズレると offerings からパッケージを引けず購入できない
//（lib/purchases.ts の purchasePlan が failed を返す）。

import type { PaidPlan } from "@rigel/ui";

export const IAP_PRODUCT_IDS: Record<PaidPlan, string> = {
  next: "rigel.next.monthly",
  pro: "rigel.pro.monthly",
};
