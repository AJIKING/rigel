// ============================================================
// domain/quiz — 特訓クイズのセッション（60秒タイムアタック1回）
// ------------------------------------------------------------
// 無料プランは「1日 FREE_QUIZ_PER_DAY 回・開始時に1回消費・JST 0時回復」をサーバで強制する
// （Plan: docs/plans/quiz-training.md [決定] 2026-07-25）。
// 回数制限のキーは JST の日付文字列（started_day）。丸めは背骨（@rigel/schema の
// jstDayOf）に一元化（ui の quiz-stats と同じ丸めを共有する）。
// 結果（total/correct/durationMs）は null = 未完了（開始しただけ・途中離脱）。
// 2026-08-04 追加: seed（サーバ発行の出題シード）・verified（シードリプレイ再採点で確定）・
// records（見直しレコード。有料のみ保存）。Plan: docs/plans/quiz-open-and-ranking.md Phase 3/4。
// ============================================================

import type { QuizAnswerRecord, QuizKind, QuizResult } from "@rigel/schema";

export interface QuizSession {
  id: string;
  userId: string;
  kind: QuizKind;
  /** 開始日（JST 'YYYY-MM-DD'）。無料枠（1日 FREE_QUIZ_PER_DAY 回）のカウントキー。 */
  startedDay: string;
  /** サーバ発行の出題シード（シードリプレイ検証の入力。機能追加前の旧行のみ null）。 */
  seed: number | null;
  /** 出題数。null = 未完了（開始時消費のため行は先にできる）。 */
  total: number | null;
  correct: number | null;
  durationMs: number | null;
  /** サーバ再採点＋実時間チェックを通った行か（ランキング集計はこれのみ対象）。 */
  verified: boolean;
  /** 見直しレコード（サーバ再生成のスナップショット）。有料プランの完了時のみ保存・他は null。 */
  records: QuizAnswerRecord[] | null;
  createdAt: Date;
}

/** 完了済み（結果が書かれた）セッション。履歴 API はこれだけを返す。 */
export interface CompletedQuizSession extends QuizSession {
  total: number;
  correct: number;
  durationMs: number;
}

/** クライアント申告の結果だけを書いた新しい値を返す（旧クライアント互換の経路。
 *  リプレイ検証を通っていないので unverified・records なし。二重送信は最後勝ち）。 */
export function withResult(session: QuizSession, result: QuizResult): QuizSession {
  return {
    ...session,
    total: result.total,
    correct: result.correct,
    durationMs: result.durationMs,
    verified: false,
    records: null,
  };
}

/** サーバ再採点の結果を書いた新しい値を返す（total/correct はサーバ採点値。申告値は使わない）。 */
export function withVerifiedResult(
  session: QuizSession,
  params: {
    records: QuizAnswerRecord[];
    durationMs: number;
    /** 実時間チェック（開始→完了のサーバ実時刻 ≥ セッション秒数）を通ったか。 */
    timeOk: boolean;
    /** records を保存するか（有料プランのみ true）。 */
    keepRecords: boolean;
  },
): QuizSession {
  return {
    ...session,
    total: params.records.length,
    correct: params.records.reduce((n, r) => n + (r.ok ? 1 : 0), 0),
    durationMs: params.durationMs,
    verified: params.timeOk,
    records: params.keepRecords ? params.records : null,
  };
}
