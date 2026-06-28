// application — サブスク課金の Checkout を開始するユースケース。
// 認証済みユーザーの userId を Checkout に紐付け（client_reference_id / subscription metadata）、
// 決済成立/解約は Webhook(HandleBillingWebhook) 側でプランへ反映する。

import type { BillingGateway, CheckoutParams } from "../domain/billing/billing-gateway";

export class StartCheckout {
  constructor(private readonly billing: BillingGateway) {}

  execute(params: CheckoutParams): Promise<{ url: string }> {
    return this.billing.createCheckoutSession(params);
  }
}
