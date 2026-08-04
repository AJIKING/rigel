// domain/kifu — GameLog リポジトリのポート。実体は infrastructure 層（Drizzle/D1）。

import type { ListCursor } from "@rigel/schema";
import type { GameLog, KifuStatus, Visibility } from "./game-log";

/** 公開フィードの読みモデル（1行=公開局を持つ1半荘）。Kifu 本体を読まない。 */
export interface PublicGameGroup {
  gameId: string;
  /** 最新公開局の時刻（フィードの並び・ページングのカーソル基準）。 */
  latestAt: Date;
  /** 最新公開局の id（カードを開いたときの表示先）。 */
  latestLogId: string;
  /** 公開（かつ編集済）局数。 */
  publicCount: number;
}

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
  /**
   * 公開フィードの半荘ページ（public かつ complete の局を持つ半荘を「最新公開局の時刻」降順で。
   * カーソルより古いもののみ・呼び出し側が pageSize+1 を渡す。**Kifu 本体を読まない**。
   * 旧 listPublicSummaries（直近N局の窓から半荘を組み立てる方式）は、窓に埋もれた古い半荘へ
   * 永久に到達できない構造穴があったため、半荘を直接ページングするこの形に置き換えた
   * （Plan: docs/plans/list-pagination.md 3-4）。
   */
  listPublicGameGroups(
    limit: number,
    cursor: ListCursor | null,
    /** 指定時はそのユーザーの公開半荘のみ（公開ユーザーページ用）。 */
    userId?: string,
  ): Promise<PublicGameGroup[]>;
  /** 1件削除。 */
  deleteById(id: string): Promise<void>;
  /** 半荘配下の全局を削除（半荘削除のカスケード）。 */
  deleteByGame(gameId: string): Promise<void>;
  /** ユーザーの全牌譜を削除（アカウント削除のカスケード）。 */
  deleteByUser(userId: string): Promise<void>;
}
