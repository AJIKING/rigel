// application — サブスク課金の Checkout を開始するユースケース。
// 認証済みユーザーの userId を Checkout に紐付け（client_reference_id / subscription metadata）、
// 決済成立/解約は Webhook(HandleBillingWebhook) 側でプランへ反映する。
// 有料プラン加入中は拒否する: Checkout の作り直しは既存と別のサブスクリプションを
// 追加してしまい二重課金になる。プラン変更・解約は OpenBillingPortal 側で行う。

import type { BillingGateway, CheckoutParams } from "../domain/billing/billing-gateway";
import type { UserRepository } from "../domain/user/user.repository";

export type StartCheckoutResult =
  { ok: true; url: string } | { ok: false; reason: "already_subscribed" };

export class StartCheckout {
  constructor(
    private readonly billing: BillingGateway,
    private readonly users: UserRepository,
  ) {}

  async execute(params: CheckoutParams): Promise<StartCheckoutResult> {
    const user = await this.users.findById(params.userId);
    if (user && user.plan !== "free") return { ok: false, reason: "already_subscribed" };
    const { url } = await this.billing.createCheckoutSession(params);
    return { ok: true, url };
  }
}
