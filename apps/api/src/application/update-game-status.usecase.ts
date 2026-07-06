// application — 半荘（Game）の編集状態（下書き/編集済）を変更するユースケース。所有者のみ。
// 下書きか編集済かは「局ごとに持たず半荘で決める」方針のため、配下の全局の status を
// 一括で書き換える（新しい局は作成時に既存局の状態を引き継ぐ）。
// これにより下書き半荘と非公開(編集済)半荘のカウントは排他になり、重複しない。

import type { GameRepository } from "../domain/game/game.repository";
import type { KifuStatus } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import { draftLimit, privateKifuLimit } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";
import { isOverLimit } from "./limits";
import { findOwnedGame } from "./owned-game";

export type UpdateGameStatusResult =
  { ok: true } | { ok: false; reason: "not_found" | "draft_limit" | "private_limit" };

export class UpdateGameStatus {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
    private readonly users: UserRepository,
  ) {}

  async execute(params: {
    userId: string;
    gameId: string;
    status: KifuStatus;
  }): Promise<UpdateGameStatusResult> {
    const game = await findOwnedGame(this.games, params.gameId, params.userId);
    if (!game) return { ok: false, reason: "not_found" };
    const logs = await this.gameLogs.listByGame(params.gameId);

    // 下書き化: 無料プランの下書き半荘上限を超えるなら拒否（当該半荘は除外して数える）。
    if (
      params.status === "draft" &&
      (await isOverLimit(this.users, params.userId, draftLimit, () =>
        this.gameLogs.countGamesByUserAndStatus(params.userId, "draft", params.gameId),
      ))
    ) {
      return { ok: false, reason: "draft_limit" };
    }

    // 編集済化: 非公開の半荘なら、無料プランの非公開(編集済)半荘上限を超えるなら拒否。
    if (
      params.status === "complete" &&
      logs.some((l) => l.visibility === "private") &&
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
      await this.gameLogs.save({ ...log, status: params.status });
    }
    return { ok: true };
  }
}
