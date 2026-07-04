// application — IAP 購入の引き換え（アプリ → api）。
// アプリが StoreKit 2 の署名済みトランザクション(JWS)を送ってくる。検証し、
// 自アプリ・既知の商品・有効期限内であることを確かめてからプランを反映する。
// originalTransactionId をユーザーに紐付け、以後の更新/失効通知の照合キーにする。

import type { AppStoreConfig, AppStoreVerifier } from "../domain/billing/appstore";
import { planForProduct } from "../domain/billing/appstore";
import type { PaidPlan } from "../domain/billing/billing-gateway";
import type { UserRepository } from "../domain/user/user.repository";

export type RedeemResult =
  | { ok: true; plan: PaidPlan }
  | {
      ok: false;
      reason: "invalid_transaction" | "wrong_bundle" | "unknown_product" | "expired" | "not_found";
    };

export interface RedeemDeps {
  verifier: AppStoreVerifier;
  users: UserRepository;
  config: AppStoreConfig;
  now: () => Date;
}

export class RedeemAppStorePurchase {
  constructor(private readonly deps: RedeemDeps) {}

  async execute(params: { userId: string; jws: string }): Promise<RedeemResult> {
    const { verifier, users, config, now } = this.deps;

    let tx;
    try {
      tx = await verifier.verifyTransaction(params.jws);
    } catch {
      return { ok: false, reason: "invalid_transaction" };
    }
    if (tx.bundleId !== config.bundleId) return { ok: false, reason: "wrong_bundle" };
    const plan = planForProduct(tx.productId, config);
    if (!plan) return { ok: false, reason: "unknown_product" };
    if (tx.expiresDate !== null && tx.expiresDate <= now().getTime()) {
      return { ok: false, reason: "expired" };
    }

    const user = await users.findById(params.userId);
    if (!user) return { ok: false, reason: "not_found" };

    user.changePlan(plan);
    user.linkAppStoreSubscription(tx.originalTransactionId);
    await users.save(user);
    return { ok: true, plan };
  }
}
