// application — ListKifu ユースケース（ユーザーの牌譜一覧。閲覧は無料）。
// 可視性（public は誰でも、private は所有者のみ）はここで判定し、
// viewer に見えない局は一覧に含めない。

import { isVisibleTo, type GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";

export class ListKifu {
  constructor(private readonly gameLogs: GameLogRepository) {}

  /** viewerId: 閲覧者（未ログインは null）。 */
  async execute(userId: string, viewerId: string | null): Promise<GameLog[]> {
    const logs = await this.gameLogs.listByUser(userId);
    return logs.filter((log) => isVisibleTo(log, viewerId));
  }
}
