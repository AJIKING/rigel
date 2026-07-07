// domain/problem — 回答リポジトリのポート。
// 1人1回（PK = problemId + userId）。API は集計（choiceKey ごとの件数）だけを外に出し、
// 誰が何と答えたかは返さない（プライバシー原則）。

import type { ProblemAction } from "@rigel/schema";

export interface ProblemAnswer {
  problemId: string;
  userId: string;
  /** 回答の直列化キー（@rigel/schema の choiceKey）。分布集計の単位。 */
  choiceKey: string;
  action: ProblemAction;
  createdAt: Date;
}

export interface ProblemAnswerRepository {
  /** 回答を保存する。同一 (problemId, userId) は上書き（再回答）。 */
  upsert(answer: ProblemAnswer): Promise<void>;
  /** choiceKey ごとの件数。 */
  countsByProblem(problemId: string): Promise<Record<string, number>>;
  /** 自分の回答（未回答は null）。 */
  findMine(problemId: string, userId: string): Promise<ProblemAnswer | null>;
  deleteByProblem(problemId: string): Promise<void>;
  /** 自分が付けた回答の削除（アカウント削除用）。 */
  deleteByUser(userId: string): Promise<void>;
  /** 指定ユーザーが所有する問題への回答をすべて削除（アカウント削除のカスケード用）。 */
  deleteByProblemOwner(ownerId: string): Promise<void>;
}
