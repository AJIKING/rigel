// application — 牌譜の公開範囲(public/private)を切り替えるユースケース。
// 所有者のみ。private 化のときは無料プランの保存上限を超えないことを保証する
// （公開→非公開で上限を超える状態を作らせない）。public 化は無制限。

import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { Visibility } from "../domain/kifu/game-log";
import type { UserRepository } from "../domain/user/user.repository";
import { privateKifuLimit } from "../domain/user/user";

export type SetVisibilityResult =
  { ok: true } | { ok: false; reason: "not_found" | "private_limit" };

export class SetKifuVisibility {
  constructor(
    private readonly gameLogs: GameLogRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(params: {
    userId: string;
    logId: string;
    visibility: Visibility;
  }): Promise<SetVisibilityResult> {
    const log = await this.gameLogs.findById(params.logId);
    if (!log || log.userId !== params.userId) return { ok: false, reason: "not_found" };
    if (log.visibility === params.visibility) return { ok: true };

    // private 化のとき、無料プランの非公開上限を超えるなら拒否。
    if (params.visibility === "private") {
      const user = await this.users.findById(params.userId);
      const limit = user ? privateKifuLimit(user.plan) : 0;
      if (limit !== null) {
        const current = await this.gameLogs.countByUserAndVisibility(params.userId, "private");
        if (current >= limit) return { ok: false, reason: "private_limit" };
      }
    }

    await this.gameLogs.save({ ...log, visibility: params.visibility });
    return { ok: true };
  }
}
