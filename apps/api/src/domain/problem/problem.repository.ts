// domain/problem — 何切る問題リポジトリのポート。

import type { ProblemPost } from "./problem";

export interface ProblemRepository {
  listByUser(userId: string): Promise<ProblemPost[]>;
  /** 公開済みの問題を新着順に。 */
  listPublished(limit: number): Promise<ProblemPost[]>;
  findById(id: string): Promise<ProblemPost | null>;
  /** 保存上限（draft+published 合算）の判定に使う。 */
  countByUser(userId: string): Promise<number>;
  save(post: ProblemPost): Promise<void>;
  deleteById(id: string): Promise<void>;
  deleteByUser(userId: string): Promise<void>;
}
