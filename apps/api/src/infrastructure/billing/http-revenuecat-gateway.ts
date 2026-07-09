// infrastructure/billing — RevenueCatGateway の REST 実装。
// Stripe 購読を RevenueCat に登録する（POST /v1/receipts, X-Platform: stripe,
// Authorization は Stripe アプリの Public API key = strp_...）。
// 手順は 2026-07-09 の sandbox 実測どおり（docs/plans/billing-revenuecat.md §4）。

import type { RevenueCatGateway } from "../../domain/billing/revenuecat";

const RECEIPTS_URL = "https://api.revenuecat.com/v1/receipts";

export interface HttpRevenueCatGatewayConfig {
  /** RevenueCat の Stripe アプリの Public API key（strp_...。環境ごとに別値）。 */
  stripePublicKey: string;
  /** テスト差し替え用。既定はグローバル fetch。 */
  fetchImpl?: typeof fetch;
}

export class HttpRevenueCatGateway implements RevenueCatGateway {
  constructor(private readonly config: HttpRevenueCatGatewayConfig) {}

  async registerStripeSubscription(params: {
    appUserId: string;
    subscriptionId: string;
  }): Promise<void> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const res = await fetchImpl(RECEIPTS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-platform": "stripe",
        authorization: `Bearer ${this.config.stripePublicKey}`,
      },
      body: JSON.stringify({
        app_user_id: params.appUserId,
        fetch_token: params.subscriptionId,
      }),
    });
    if (!res.ok) {
      throw new Error(`RevenueCat receipts が ${res.status} を返しました`);
    }
  }
}
