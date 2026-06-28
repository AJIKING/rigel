// application — ListKifu ユースケース（ユーザーの牌譜一覧。閲覧は無料）。

import type { GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export class ListKifu {
  constructor(private readonly gameLogs: GameLogRepository) {}

  execute(userId: string): Promise<GameLog[]> {
    return this.gameLogs.listByUser(userId);
  }
}
