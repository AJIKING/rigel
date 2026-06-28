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
  PaidPlan,
} from "../../domain/billing/billing-gateway";

export interface StripeBillingConfig {
  secretKey: string;
  webhookSecret: string;
  /** RIGEL Next の価格ID（price_...）。 */
  priceNext: string;
  /** RIGEL Pro の価格ID（price_...）。 */
  pricePro: string;
}

function asPaidPlan(value: unknown): PaidPlan | null {
  return value === "next" || value === "pro" ? value : null;
}

export class StripeBillingGateway implements BillingGateway {
  constructor(private readonly config: StripeBillingConfig) {}

  private async client() {
    const { default: Stripe } = await import("stripe");
    return new Stripe(this.config.secretKey, { httpClient: Stripe.createFetchHttpClient() });
  }

  private priceFor(plan: PaidPlan): string {
    return plan === "pro" ? this.config.pricePro : this.config.priceNext;
  }

  async createCheckoutSession(params: CheckoutParams): Promise<{ url: string }> {
    const stripe = await this.client();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: this.priceFor(params.plan), quantity: 1 }],
      client_reference_id: params.userId,
      // session 側(=completed イベント)に tier、subscription 側(=deleted イベント)に userId を残す。
      metadata: { tier: params.plan },
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
        const plan = asPaidPlan(session.metadata?.tier);
        return userId && plan ? { type: "subscribed", userId, plan } : { type: "ignored" };
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
