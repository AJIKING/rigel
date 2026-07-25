// application — GetKifu ユースケース（牌譜1件の取得。閲覧は無料）。
// 可視性（public は誰でも、private は所有者のみ）はここで判定し、
// 見えない局は不存在と同じ null を返す（存在を漏らさない）。

import { isVisibleTo, type GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export class GetKifu {
  constructor(private readonly gameLogs: GameLogRepository) {}

  /** viewerId: 閲覧者（未ログインは null）。 */
  async execute(id: string, viewerId: string | null): Promise<GameLog | null> {
    const log = await this.gameLogs.findById(id);
    if (!log || !isVisibleTo(log, viewerId)) return null;
    return log;
  }
}
