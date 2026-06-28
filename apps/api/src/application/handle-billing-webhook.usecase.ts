// application — 課金 Webhook を受けてユーザーのプランを更新するユースケース。
// 署名検証はゲートウェイに委譲し、正規化イベント(subscribed/unsubscribed)だけを扱う。
// 冪等: 同じイベントを複数回受けても changePlan は同じ結果に収束する。

import type { BillingGateway } from "../domain/billing/billing-gateway";
import type { UserRepository } from "../domain/user/user.repository";

export interface WebhookResult {
  /** プラン更新まで行ったか（無関係イベント/対象ユーザー不在なら false）。 */
  handled: boolean;
}

export class HandleBillingWebhook {
  constructor(
    private readonly billing: BillingGateway,
    private readonly users: UserRepository,
  ) {}

  async execute(params: { payload: string; signature: string }): Promise<WebhookResult> {
    const event = await this.billing.parseEvent(params.payload, params.signature);
    if (event.type === "ignored") return { handled: false };

    const user = await this.users.findById(event.userId);
    if (!user) return { handled: false };

    user.changePlan(event.type === "subscribed" ? event.plan : "free");
    await this.users.save(user);
    return { handled: true };
  }
}
