// application — 決済ポータル（Stripe Billing Portal）を開くユースケース。
// 加入中ユーザーのプラン変更・解約・支払い方法の管理はポータル側で行う
// （Checkout の作り直しは二重サブスク＝二重課金になるため使わない）。

import type { BillingGateway } from "../domain/billing/billing-gateway";

export type OpenPortalResult = { ok: true; url: string } | { ok: false; reason: "not_subscribed" };

export class OpenBillingPortal {
  constructor(private readonly billing: BillingGateway) {}

  async execute(params: { userId: string; returnUrl: string }): Promise<OpenPortalResult> {
    const session = await this.billing.createPortalSession(params);
    if (!session) return { ok: false, reason: "not_subscribed" };
    return { ok: true, url: session.url };
  }
}
