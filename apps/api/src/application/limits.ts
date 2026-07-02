// application — プラン上限チェックの共通ヘルパ。
// 「ユーザーを引く → プラン上限を得る → 現在数を数える → 超過か判定」を1つにまとめる。

import type { Plan } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

/**
 * プランの上限を超えているか。limit=null は無制限（false）。
 * count は上限が有限のときだけ評価する（無駄な集計を避ける）。
 */
export async function isOverLimitForPlan(
  plan: Plan,
  limitOf: (plan: Plan) => number | null,
  count: () => Promise<number>,
): Promise<boolean> {
  const limit = limitOf(plan);
  if (limit === null) return false;
  return (await count()) >= limit;
}

/**
 * ユーザーを引いてプラン上限を超えているか判定する。
 * ユーザー不在は上限超過(true)扱い（安全側）。既に user がある場合は
 * isOverLimitForPlan を直接使う（二重取得を避ける）。
 */
export async function isOverLimit(
  users: UserRepository,
  userId: string,
  limitOf: (plan: Plan) => number | null,
  count: () => Promise<number>,
): Promise<boolean> {
  const user = await users.findById(userId);
  if (!user) return true;
  return isOverLimitForPlan(user.plan, limitOf, count);
}
