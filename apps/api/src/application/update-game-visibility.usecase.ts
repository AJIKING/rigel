// application — 半荘（Game）の公開範囲を変更するユースケース。所有者のみ。
// 公開/非公開は「局ごとに選ばず半荘で決める」方針のため、配下の全局の visibility を
// 一括で書き換える（新しい局は作成時に既存局の公開範囲を引き継ぐ）。
// private 化は無料プランの非公開上限（半荘数）を超えないことを保証する。

import type { GameRepository } from "../domain/game/game.repository";
import type { Visibility } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import { privateKifuLimit } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";
import { isOverLimit } from "./limits";
import { findOwnedGame } from "./owned-game";

export type UpdateGameVisibilityResult =
  { ok: true } | { ok: false; reason: "not_found" | "private_limit" };

export class UpdateGameVisibility {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(params: {
    userId: string;
    gameId: string;
    visibility: Visibility;
  }): Promise<UpdateGameVisibilityResult> {
    const game = await findOwnedGame(this.games, params.gameId, params.userId);
    if (!game) return { ok: false, reason: "not_found" };
    const logs = await this.gameLogs.listByGame(params.gameId);

    // private 化のとき、無料プランの非公開上限（半荘数）を超えるなら拒否。
    // complete 局を含む半荘だけが対象（下書きは別枠）。当該半荘は除外して数える。
    if (
      params.visibility === "private" &&
      logs.some((l) => l.status === "complete") &&
      (await isOverLimit(this.users, params.userId, privateKifuLimit, () =>
        this.gameLogs.countGamesByUserVisibilityStatus(
          params.userId,
          "private",
          "complete",
          params.gameId,
        ),
      ))
    ) {
      return { ok: false, reason: "private_limit" };
    }

    for (const log of logs) {
      await this.gameLogs.save({ ...log, visibility: params.visibility });
    }
    return { ok: true };
  }
}
