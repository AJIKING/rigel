// application — 半荘（Game）を配下の全局ごと削除するユースケース。
// 所有者のみ。他人の半荘・不存在はどちらも not_found（存在を漏らさない）。

import type { GameRepository } from "../domain/game/game.repository";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export type DeleteGameResult = { ok: true } | { ok: false; reason: "not_found" };

export class DeleteGame {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
  ) {}

  async execute(params: { userId: string; gameId: string }): Promise<DeleteGameResult> {
    const game = await this.games.findById(params.gameId);
    if (!game || game.userId !== params.userId) return { ok: false, reason: "not_found" };
    await this.gameLogs.deleteByGame(params.gameId);
    await this.games.deleteById(params.gameId);
    return { ok: true };
  }
}
