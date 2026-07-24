// ============================================================
// domain/quiz — 特訓クイズのセッション（60秒タイムアタック1回）
// ------------------------------------------------------------
// 無料プランは「1日3回・開始時に1回消費・JST 0時回復」をサーバで強制する
// （Plan: docs/plans/quiz-training.md [決定] 2026-07-25）。
// 回数制限のキーは JST の日付文字列（started_day）。
// 結果（total/correct/durationMs）は null = 未完了（開始しただけ・途中離脱）。
// ============================================================

import type { QuizKind, QuizResult } from "@rigel/schema";

/** JST(UTC+9) のオフセット。日本にサマータイムは無いので固定値でよい。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC 時刻を JST の日付 'YYYY-MM-DD' にする（無料枠の回復境界 = JST 0時）。 */
export function jstDayOf(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

export interface QuizSession {
  id: string;
  userId: string;
  kind: QuizKind;
  /** 開始日（JST 'YYYY-MM-DD'）。無料枠 1日3回のカウントキー。 */
  startedDay: string;
  /** 出題数。null = 未完了（開始時消費のため行は先にできる）。 */
  total: number | null;
  correct: number | null;
  durationMs: number | null;
  createdAt: Date;
}

/** 完了済み（結果が書かれた）セッション。履歴 API はこれだけを返す。 */
export interface CompletedQuizSession extends QuizSession {
  total: number;
  correct: number;
  durationMs: number;
}

/** セッションに検証済みの結果を書いた新しい値を返す（二重送信は最後勝ち）。 */
export function withResult(session: QuizSession, result: QuizResult): QuizSession {
  return {
    ...session,
    total: result.total,
    correct: result.correct,
    durationMs: result.durationMs,
  };
}
