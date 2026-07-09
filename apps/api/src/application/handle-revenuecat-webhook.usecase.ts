// application — RevenueCat Webhook を受けてユーザーのプランを更新する。
// エンタイトルメントの真実源は RevenueCat（web=Stripe / アプリ=IAP を横串）で、
// この usecase だけが users.plan（D1 射影）を書く。
// 冪等: event.id を記録し、同一イベントの再送は適用しない（失効後に古い購入
// イベントが再送されてもプランが復活しない）。
// スキーマ違反は例外（ルートが 400 に変換）。未知イベント・対象ユーザー不在・
// SANDBOX（本番では無視）は handled: false で 200 を返させる（再送地獄防止）。

import {
  planChangeForRevenueCatEvent,
  RevenueCatWebhookSchema,
  type RevenueCatEventRepository,
} from "../domain/billing/revenuecat";
import type { UserRepository } from "../domain/user/user.repository";

export interface RevenueCatWebhookDeps {
  users: UserRepository;
  events: RevenueCatEventRepository;
  /** SANDBOX 環境のイベントを適用するか（開発 true / 本番 false）。 */
  allowSandbox: boolean;
}

export class HandleRevenueCatWebhook {
  constructor(private readonly deps: RevenueCatWebhookDeps) {}

  async execute(params: { body: unknown }): Promise<{ handled: boolean }> {
    const { users, events, allowSandbox } = this.deps;
    const { event } = RevenueCatWebhookSchema.parse(params.body);

    if (event.environment === "SANDBOX" && !allowSandbox) return { handled: false };

    const change = planChangeForRevenueCatEvent(event);
    if (change.action === "none") return { handled: false };

    // 冪等ゲート。適用が成功してから記録する（途中失敗は RevenueCat の再送で回復。
    // changePlan は同値収束なので、まれな並行再送で二重適用されても結果は同じ）。
    if (await events.isProcessed(event.id)) return { handled: false };

    const user = await users.findById(event.app_user_id);
    if (!user) return { handled: false };

    user.changePlan(change.plan);
    await users.save(user);
    await events.markProcessed(event.id);
    return { handled: true };
  }
}
