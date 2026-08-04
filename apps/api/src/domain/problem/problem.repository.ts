// domain/problem — 何切る問題リポジトリのポート。

import type { ListCursor } from "@rigel/schema";
import type { ProblemPost } from "./problem";

export interface ProblemRepository {
  /** 自分の問題一覧（新しい順・全件）。**一覧画面では使わない**（退会掃除等の内部処理用。
   *  画面は listByUserPage）。 */
  listByUser(userId: string): Promise<ProblemPost[]>;
  /** 自分の問題1ページ（createdAt DESC・同時刻は id DESC。カーソルより古いもののみ）。 */
  listByUserPage(userId: string, limit: number, cursor: ListCursor | null): Promise<ProblemPost[]>;
  /** 公開済みを新着順で（カーソルより古いもののみ。null=先頭から）。呼び出し側が
   *  pageSize+1 を渡して次ページ有無を判定する（Plan: docs/plans/list-pagination.md）。 */
  listPublished(limit: number, cursor: ListCursor | null): Promise<ProblemPost[]>;
  findById(id: string): Promise<ProblemPost | null>;
  /** 保存上限（draft+published 合算）の判定に使う。 */
  countByUser(userId: string): Promise<number>;
  save(post: ProblemPost): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteByUser(userId: string): Promise<void>;
}
