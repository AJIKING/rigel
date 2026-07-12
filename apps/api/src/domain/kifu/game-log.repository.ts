// domain/kifu — GameLog リポジトリのポート。実体は infrastructure 層（Drizzle/D1）。

import type { GameLog, KifuStatus, Visibility, GameLogSummary } from "./game-log";

export interface GameLogRepository {
  save(gameLog: GameLog): Promise<void>;
  findById(id: string): Promise<GameLog | null>;
  /** ユーザーの牌譜一覧（新しい順）。閲覧は無料でも可能。 */
  listByUser(userId: string): Promise<GameLog[]>;
  /** 半荘内の局一覧（seq 昇順）。 */
  listByGame(gameId: string): Promise<GameLog[]>;
  /** ユーザーの、指定した編集状態の局を含む「半荘数」（下書き上限は半荘単位で判定）。
   *  excludeGameId はその半荘を数えない（既にカウント済みの半荘内の操作を上限で阻まない）。 */
  countGamesByUserAndStatus(
    userId: string,
    status: KifuStatus,
    excludeGameId?: string,
  ): Promise<number>;
  /** ユーザーの、指定した公開範囲×編集状態の局を含む「半荘数」（非公開上限= private×complete）。 */
  countGamesByUserVisibilityStatus(
    userId: string,
    visibility: Visibility,
    status: KifuStatus,
    excludeGameId?: string,
  ): Promise<number>;
  /** 公開フィード用の牌譜を新しい順に返す（visibility=public かつ status=complete。limit で上限）。 */
  listPublic(limit: number): Promise<GameLog[]>;
  /**
   * 公開フィード用の要約（public かつ complete の局）。**Kifu 本体を読まない**。
   * 一覧のコストが「保存された牌譜のサイズ」に比例して膨らむのを避けるための読み取りモデル
   *（一覧に必要なのは所属半荘・著者・時刻だけ）。
   */
  listPublicSummaries(limit: number): Promise<GameLogSummary[]>;
  /** 1件削除。 */
  deleteById(id: string): Promise<void>;
  /** 半荘配下の全局を削除（半荘削除のカスケード）。 */
  deleteByGame(gameId: string): Promise<void>;
  /** ユーザーの全牌譜を削除（アカウント削除のカスケード）。 */
  deleteByUser(userId: string): Promise<void>;
}
