// domain/quiz — 特訓クイズセッションリポジトリのポート。

import type { CompletedQuizSession, QuizSession } from "./quiz-session";

export interface QuizSessionRepository {
  insert(session: QuizSession): Promise<void>;
  findById(id: string): Promise<QuizSession | null>;
  /** 指定 JST 日の開始数（未完了含む = 開始時消費）。無料枠 1日3回の判定に使う。 */
  countByUserAndDay(userId: string, day: string): Promise<number>;
  /** 結果を書く（二重送信は最後勝ちで上書き）。 */
  update(session: QuizSession): Promise<void>;
  /** 本人の完了済みセッションを新しい順に（since 指定時はそれ以降のみ・limit 件まで）。 */
  listCompletedByUser(
    userId: string,
    since: Date | null,
    limit: number,
  ): Promise<CompletedQuizSession[]>;
}
