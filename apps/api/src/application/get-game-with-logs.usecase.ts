// application — GetGameWithLogs（半荘詳細 = 半荘 + その局一覧）。
// 半荘詳細は所有者のみ。所有者判定はここで行い、他人・未ログインには
// 不存在と同じ null を返す（存在を漏らさない）。

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

  /** viewerId: 閲覧者（未ログインは null）。所有者以外には null。 */
  async execute(gameId: string, viewerId: string | null): Promise<GameDetail | null> {
    const game = await this.games.findById(gameId);
    if (!game || game.userId !== viewerId) return null;
    const logs = await this.gameLogs.listByGame(gameId);
    return { game, logs };
  }
}
