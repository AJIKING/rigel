// application — GetKifu ユースケース（牌譜1件の取得。閲覧は無料）。

import type { GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export class GetKifu {
  constructor(private readonly gameLogs: GameLogRepository) {}

  execute(id: string): Promise<GameLog | null> {
    return this.gameLogs.findById(id);
  }
}
