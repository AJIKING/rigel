// domain/kifu — GameLog リポジトリのポート。実体は infrastructure 層（Drizzle/D1）。

import type { GameLog } from "./game-log";

export interface GameLogRepository {
  save(gameLog: GameLog): Promise<void>;
  findById(id: string): Promise<GameLog | null>;
  /** ユーザーの牌譜一覧（新しい順）。閲覧は無料でも可能。 */
  listByUser(userId: string): Promise<GameLog[]>;
}
