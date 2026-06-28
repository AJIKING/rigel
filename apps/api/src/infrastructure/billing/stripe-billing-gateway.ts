// ============================================================
// infrastructure/billing — BillingGateway の Stripe 実装
// ------------------------------------------------------------
// Workers 上で動かすため fetch ベースの HttpClient を使い、stripe SDK は
// 遅延 import する（鍵未設定時はこのアダプタのメソッドが呼ばれないので、
// バンドル/起動コストもメソッド実行時まで遅らせる）。
//   - Checkout 作成時に userId を client_reference_id と subscription.metadata に載せ、
//     Webhook 側でユーザーを特定する（独自に顧客IDを保存しない）。
// ============================================================

import type {
  BillingEvent,
  BillingGateway,
  CheckoutParams,
} from "../../domain/billing/billing-gateway";

export interface StripeBillingConfig {
  secretKey: string;
  webhookSecret: string;
  /** サブスクの価格ID（Stripe ダッシュボードで作成した price_...）。 */
  priceId: string;
}

export class StripeBillingGateway implements BillingGateway {
  constructor(private readonly config: StripeBillingConfig) {}

  private async client() {
    const { default: Stripe } = await import("stripe");
    return new Stripe(this.config.secretKey, { httpClient: Stripe.createFetchHttpClient() });
  }

  async createCheckoutSession(params: CheckoutParams): Promise<{ url: string }> {
    const stripe = await this.client();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: this.config.priceId, quantity: 1 }],
      client_reference_id: params.userId,
      subscription_data: { metadata: { userId: params.userId } },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });
    if (!session.url) throw new Error("Stripe checkout session に url がありません");
    return { url: session.url };
  }

  async parseEvent(payload: string, signature: string): Promise<BillingEvent> {
    const stripe = await this.client();
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      this.config.webhookSecret,
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id;
        return userId ? { type: "subscribed", userId } : { type: "ignored" };
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        return userId ? { type: "unsubscribed", userId } : { type: "ignored" };
      }
      default:
        return { type: "ignored" };
    }
  }
}
