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

/**
 * customer.subscription.updated を正規化する（純関数）。Billing Portal でのプラン変更を
 * 反映する経路。active/trialing の価格IDからプランを引き、判定できないものは無視する
 * （誤って free に落とさない。解約確定は customer.subscription.deleted 側が担う）。
 */
export function subscriptionUpdatedEvent(
  sub: {
    status?: string | null;
    metadata?: Record<string, string> | null;
    items?: { data?: { price?: { id?: string | null } | null }[] | null } | null;
  },
  prices: { priceNext: string; pricePro: string },
): BillingEvent {
  const userId = sub.metadata?.userId;
  if (!userId) return { type: "ignored" };
  if (sub.status !== "active" && sub.status !== "trialing") return { type: "ignored" };
  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan = priceId === prices.pricePro ? "pro" : priceId === prices.priceNext ? "next" : null;
  // Portal 変更は初回 Checkout で RevenueCat 登録済みのため subscriptionId は載せない。
  return plan ? { type: "subscribed", userId, plan, subscriptionId: null } : { type: "ignored" };
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
        // 購読ID（sub_...）。RevenueCat への登録（fetch_token）に使う。expand なしだと文字列。
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null);
        return userId && plan
          ? { type: "subscribed", userId, plan, subscriptionId }
          : { type: "ignored" };
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;
        return userId ? { type: "unsubscribed", userId } : { type: "ignored" };
      }
      // Billing Portal でのプラン変更（next↔pro）を反映する。
      case "customer.subscription.updated":
        return subscriptionUpdatedEvent(event.data.object, this.config);
      default:
        return { type: "ignored" };
    }
  }

  async createPortalSession(params: {
    userId: string;
    returnUrl: string;
  }): Promise<{ url: string } | null> {
    const stripe = await this.client();
    // 顧客IDは保存しない設計のため、サブスクの metadata.userId から逆引きする。
    const found = await stripe.subscriptions.search({
      query: `metadata["userId"]:"${params.userId}"`,
      limit: 10,
    });
    const active = found.data.find((s) => s.status === "active" || s.status === "trialing");
    if (!active) return null;
    const customer = typeof active.customer === "string" ? active.customer : active.customer.id;
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }
}
