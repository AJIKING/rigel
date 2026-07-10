// application — 課金 Webhook を受けてユーザーのプランを更新するユースケース。
// 署名検証はゲートウェイに委譲し、正規化イベント(subscribed/unsubscribed)だけを扱う。
// 冪等: 同じイベントを複数回受けても changePlan は同じ結果に収束する。
// 初回 Checkout 完了時は購読を RevenueCat にも登録する（web=Stripe/アプリ=IAP の
// 横串一元管理の起点。以後の更新・解約は RevenueCat が Stripe から直接追跡する）。
// 登録失敗で plan 反映を壊さない（RevenueCat 側は再購読/手動リカバリで追いつける）。

import type { BillingGateway } from "../domain/billing/billing-gateway";
import type { RevenueCatGateway } from "../domain/billing/revenuecat";
import type { UserRepository } from "../domain/user/user.repository";

export interface WebhookResult {
  /** プラン更新まで行ったか（無関係イベント/対象ユーザー不在なら false）。 */
  handled: boolean;
}

export class HandleBillingWebhook {
  constructor(
    private readonly billing: BillingGateway,
    private readonly users: UserRepository,
    /** 未設定（null）なら RevenueCat 登録はスキップする。 */
    private readonly revenueCat: RevenueCatGateway | null = null,
  ) {}

  async execute(params: { payload: string; signature: string }): Promise<WebhookResult> {
    const event = await this.billing.parseEvent(params.payload, params.signature);
    if (event.type === "ignored") return { handled: false };

    const user = await this.users.findById(event.userId);
    if (!user) return { handled: false };

    // この経路は Stripe Webhook 専用なので購入経路は常に "STRIPE"（free 時は changePlan が null にする）。
    user.changePlan(event.type === "subscribed" ? event.plan : "free", "STRIPE");
    await this.users.save(user);

    // 初回 Checkout（subscriptionId あり）だけ RevenueCat に登録。plan 反映後に行い、
    // 失敗しても結果を壊さない。
    if (event.type === "subscribed" && event.subscriptionId && this.revenueCat) {
      try {
        await this.revenueCat.registerStripeSubscription({
          appUserId: event.userId,
          subscriptionId: event.subscriptionId,
        });
      } catch (e) {
        console.error("RevenueCat への購読登録に失敗（plan 反映は完了済み）", e);
      }
    }
    return { handled: true };
  }
}
