// application — GetGameWithLogs（半荘詳細 = 半荘 + その局一覧）。

import type { Game } from "../domain/game/game";
import type { GameRepository } from "../domain/game/game.repository";
import type { GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export interface GameDetail {
  game: Game;
  logs: GameLog[];
}

export class GetGameWithLogs {
  constructor(
    private readonly games: GameRepository,
    private readonly gameLogs: GameLogRepository,
  ) {}

  async execute(gameId: string): Promise<GameDetail | null> {
    const game = await this.games.findById(gameId);
    if (!game) return null;
    const logs = await this.gameLogs.listByGame(gameId);
    return { game, logs };
  }
}
