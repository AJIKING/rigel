// application — App Store Server Notifications V2 を受けてプランを更新する。
// 検証・正規化はポート（AppStoreVerifier）に委譲し、ここでは
// subscribed（更新・プラン変更）/ revoked（失効・返金）だけを扱う。
// ユーザーは originalTransactionId（購入引き換え時に保存）で引く。冪等。

import type { AppStoreConfig, AppStoreVerifier } from "../domain/billing/appstore";
import { planForProduct } from "../domain/billing/appstore";
import type { UserRepository } from "../domain/user/user.repository";

export interface AppStoreNotificationDeps {
  verifier: AppStoreVerifier;
  users: UserRepository;
  config: AppStoreConfig;
}

export class HandleAppStoreNotification {
  constructor(private readonly deps: AppStoreNotificationDeps) {}

  async execute(params: { signedPayload: string }): Promise<{ handled: boolean }> {
    const { verifier, users, config } = this.deps;
    const notification = await verifier.parseNotification(params.signedPayload);
    if (notification.type === "ignored") return { handled: false };

    if (notification.type === "subscribed") {
      const tx = notification.transaction;
      if (tx.bundleId !== config.bundleId) return { handled: false };
      const plan = planForProduct(tx.productId, config);
      if (!plan) return { handled: false };
      const user = await users.findByAppStoreOriginalTransactionId(tx.originalTransactionId);
      if (!user) return { handled: false };
      user.changePlan(plan);
      await users.save(user);
      return { handled: true };
    }

    // revoked: 失効・返金 → free に落とす。
    const user = await users.findByAppStoreOriginalTransactionId(
      notification.originalTransactionId,
    );
    if (!user) return { handled: false };
    user.changePlan("free");
    await users.save(user);
    return { handled: true };
  }
}
