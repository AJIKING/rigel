// IAP（App Store）の購読商品ID。
// App Store Connect の商品登録、および api（wrangler.toml の APPSTORE_PRODUCT_NEXT/PRO）と
// 必ず一致させること。ズレると api 側の検証で unknown_product として拒否される。

import type { PaidPlan } from "@rigel/ui";

export const IAP_PRODUCT_IDS: Record<PaidPlan, string> = {
  next: "rigel.next.monthly",
  pro: "rigel.pro.monthly",
};

export const IAP_SKUS: string[] = [IAP_PRODUCT_IDS.next, IAP_PRODUCT_IDS.pro];
