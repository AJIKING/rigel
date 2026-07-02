// application — プラン上限チェックの共通ヘルパ。
// 「ユーザーを引く → プラン上限を得る → 現在数を数える → 超過か判定」を1つにまとめる。

import type { Plan } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";

/**
 * ユーザーのプラン上限を超えているか。
 * limit=null は無制限（false）。ユーザー不在は上限0扱い（安全側）。
 * count は上限が有限のときだけ評価する（無駄な集計を避ける）。
 */
export async function isOverLimit(
  users: UserRepository,
  userId: string,
  limitOf: (plan: Plan) => number | null,
  count: () => Promise<number>,
): Promise<boolean> {
  const user = await users.findById(userId);
  const limit = user ? limitOf(user.plan) : 0;
  if (limit === null) return false;
  return (await count()) >= limit;
}
