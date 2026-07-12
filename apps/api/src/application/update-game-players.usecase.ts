// application — 半荘（Game）の選手情報（選手名・リーグ戦ポイント）を変更するユースケース。
// 所有者のみ。rules と同じく「局ごとに持たず半荘で共有する」方針のため、
// 配下の全局の kifu.players を一括で書き換える（新しい局は作成時に引き継ぐ）。

import { KifuSchema, type Players } from "@rigel/schema";
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import { findOwnedGame } from "./owned-game";

export type UpdateGamePlayersResult = { ok: true } | { ok: false; reason: "not_found" };

export class UpdateGamePlayers {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
  ) {}

  async execute(params: {
    userId: string;
    gameId: string;
    /** null は「選手情報を記録しない対局」へ戻す。 */
    players: Players | null;
  }): Promise<UpdateGamePlayersResult> {
    const game = await findOwnedGame(this.games, params.gameId, params.userId);
    if (!game) return { ok: false, reason: "not_found" };
    const logs = await this.gameLogs.listByGame(params.gameId);
    for (const log of logs) {
      await this.gameLogs.save({
        ...log,
        kifu: KifuSchema.parse({ ...log.kifu, players: params.players }),
      });
    }
    return { ok: true };
  }
}
