// application — 半荘（Game）のルール設定を変更するユースケース。所有者のみ。
// ルールは「局ごとに持たず半荘で共有する」方針のため、配下の全局の kifu.rules を
// 一括で書き換える（新しい局は作成時に既存局のルールを引き継ぐ）。

import { KifuSchema, type Rules } from "@rigel/schema";
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import { findOwnedGame } from "./owned-game";

export type UpdateGameRulesResult = { ok: true } | { ok: false; reason: "not_found" };

export class UpdateGameRules {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
  ) {}

  async execute(params: {
    userId: string;
    gameId: string;
    rules: Rules;
  }): Promise<UpdateGameRulesResult> {
    const game = await findOwnedGame(this.games, params.gameId, params.userId);
    if (!game) return { ok: false, reason: "not_found" };
    const logs = await this.gameLogs.listByGame(params.gameId);
    for (const log of logs) {
      await this.gameLogs.save({
        ...log,
        kifu: KifuSchema.parse({ ...log.kifu, rules: params.rules }),
      });
    }
    return { ok: true };
  }
}
