// domain/kifu — GameLog リポジトリのポート。実体は infrastructure 層（Drizzle/D1）。

import type { GameLog, KifuStatus, Visibility } from "./game-log";

export interface GameLogRepository {
  save(gameLog: GameLog): Promise<void>;
  findById(id: string): Promise<GameLog | null>;
  /** ユーザーの牌譜一覧（新しい順）。閲覧は無料でも可能。 */
  listByUser(userId: string): Promise<GameLog[]>;
  /** 半荘内の局一覧（seq 昇順）。 */
  listByGame(gameId: string): Promise<GameLog[]>;
  /** ユーザーの、指定した編集状態の牌譜数（下書き上限の判定に使う）。 */
  countByUserAndStatus(userId: string, status: KifuStatus): Promise<number>;
  /** ユーザーの、指定した公開範囲×編集状態の牌譜数（非公開上限= private×complete の判定）。 */
  countByUserVisibilityStatus(
    userId: string,
    visibility: Visibility,
    status: KifuStatus,
  ): Promise<number>;
  /** 公開フィード用の牌譜を新しい順に返す（visibility=public かつ status=complete。limit で上限）。 */
  listPublic(limit: number): Promise<GameLog[]>;
  /** 1件削除。 */
  deleteById(id: string): Promise<void>;
  /** 半荘配下の全局を削除（半荘削除のカスケード）。 */
  deleteByGame(gameId: string): Promise<void>;
  /** ユーザーの全牌譜を削除（アカウント削除のカスケード）。 */
  deleteByUser(userId: string): Promise<void>;
}
