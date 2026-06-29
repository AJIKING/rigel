// domain/kifu — GameLog リポジトリのポート。実体は infrastructure 層（Drizzle/D1）。

import type { GameLog, Visibility } from "./game-log";

export interface GameLogRepository {
  save(gameLog: GameLog): Promise<void>;
  findById(id: string): Promise<GameLog | null>;
  /** ユーザーの牌譜一覧（新しい順）。閲覧は無料でも可能。 */
  listByUser(userId: string): Promise<GameLog[]>;
  /** 半荘内の局一覧（seq 昇順）。 */
  listByGame(gameId: string): Promise<GameLog[]>;
  /** ユーザーの、指定した公開範囲の牌譜数（保存上限の判定に使う）。 */
  countByUserAndVisibility(userId: string, visibility: Visibility): Promise<number>;
  /** 公開(public)の牌譜を新しい順に返す（公開フィード用。limit で上限）。 */
  listPublic(limit: number): Promise<GameLog[]>;
  /** 1件削除。 */
  deleteById(id: string): Promise<void>;
  /** ユーザーの全牌譜を削除（アカウント削除のカスケード）。 */
  deleteByUser(userId: string): Promise<void>;
}
