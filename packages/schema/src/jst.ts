// ============================================================
// JST(UTC+9) の日付ヘルパ（背骨の一部）
// ------------------------------------------------------------
// 特訓クイズの無料枠キー（api の quiz_sessions.started_day）と、マイページ「特訓」の
// 日毎集計・日時表示（@rigel/ui の quiz-stats）が同じ丸めを共有する。
// かつて apps/api/src/domain/quiz/quiz-session.ts と packages/ui/src/quiz-stats.ts で
// 独立実装（コメント同期）だったものをここに一元化した（2026-07-26 リファクタ。挙動不変）。
// ============================================================

/** JST(UTC+9) のオフセット。日本にサマータイムは無いので固定値でよい。 */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC 時刻を JST の日付 'YYYY-MM-DD' にする（特訓の無料枠の回復境界 = JST 0時）。 */
export function jstDayOf(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** now を含む JST 週（月曜 0:00 JST 起点）の開始時刻（UTC の Date）。
 *  特訓ランキングの「週間」の集計窓（Plan: docs/plans/quiz-open-and-ranking.md 4-2）。 */
export function jstStartOfWeek(now: Date): Date {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  // getUTCDay: 0=日…6=土。月曜起点なので日曜は6日戻す。
  const sinceMonday = (jst.getUTCDay() + 6) % 7;
  const day = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - sinceMonday);
  return new Date(day - JST_OFFSET_MS);
}

/** now を含む JST 月（1日 0:00 JST 起点）の開始時刻（UTC の Date）。
 *  特訓ランキングの「月間」の集計窓。 */
export function jstStartOfMonth(now: Date): Date {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - JST_OFFSET_MS);
}
