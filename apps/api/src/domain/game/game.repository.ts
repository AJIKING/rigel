// domain/game — Game リポジトリのポート。実体は infrastructure 層（Drizzle/D1）。

import type { ListCursor } from "@rigel/schema";
import type { Game } from "./game";

export interface GameRepository {
  /** ユーザーの半荘一覧（新しい順・全件）。**一覧画面では使わない**（削除カスケード等の
   *  内部処理用。画面は listByUserPage）。 */
  listByUser(userId: string): Promise<Game[]>;
  /** ユーザーの半荘1ページ（createdAt DESC・同時刻は id DESC。カーソルより古いもののみ。
   *  呼び出し側が pageSize+1 を渡す。Plan: docs/plans/list-pagination.md）。 */
  listByUserPage(userId: string, limit: number, cursor: ListCursor | null): Promise<Game[]>;
  findById(id: string): Promise<Game | null>;
  save(game: Game): Promise<void>;
  /** 半荘を1件削除（配下の局は GameLogRepository.deleteByGame で先に消す）。 */
  deleteById(id: string): Promise<void>;
  /** ユーザーの全半荘を削除（アカウント削除のカスケード）。 */
  deleteByUser(userId: string): Promise<void>;
}
