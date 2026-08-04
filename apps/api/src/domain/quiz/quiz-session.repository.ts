// domain/quiz — 特訓クイズセッションリポジトリのポート。

// domain が依存してよいのは @rigel/schema のみ（開発ガイド05）。QuizRankingRow も背骨にある。
import type { QuizKind, QuizRankingRow } from "@rigel/schema";
import type { CompletedQuizSession, QuizSession } from "./quiz-session";

export interface QuizSessionRepository {
  insert(session: QuizSession): Promise<void>;
  findById(id: string): Promise<QuizSession | null>;
  /** 指定 JST 日の開始数（未完了含む = 開始時消費）。無料枠（FREE_QUIZ_PER_DAY）の判定に使う。 */
  countByUserAndDay(userId: string, day: string): Promise<number>;
  /** 結果を書く（二重送信は最後勝ちで上書き）。 */
  update(session: QuizSession): Promise<void>;
  /** 本人の完了済みセッションを新しい順に（since 指定時はそれ以降のみ・limit 件まで）。 */
  listCompletedByUser(
    userId: string,
    since: Date | null,
    limit: number,
  ): Promise<CompletedQuizSession[]>;
  /** ランキング集計（読みモデル）: 種目別・**verified のみ**・since 以降（null=全期間）を
   *  ユーザ単位に correct/total 合算し、表示用の handle/displayName ごと返す。
   *  並び・しきい値・上位打ち切りは @rigel/ui buildQuizRanking が担う。 */
  aggregateVerified(kind: QuizKind, since: Date | null): Promise<QuizRankingRow[]>;
}
