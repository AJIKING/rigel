// 特訓クイズの履歴グラフ整形（web/mobile のマイページ「特訓」で共用する純関数）。
// 日付の丸めは api の started_day と同じ流儀で JST（UTC+9 固定）。
// 欠損日は 0 セッションの点として埋める（折れ線が日付軸で飛ばないように）。

import type { QuizKind } from "@rigel/schema";

/** グラフの期間（7日/30日は now から遡る。all は最古のセッション〜now）。 */
export type QuizStatsPeriod = "7d" | "30d" | "all";

/** 集計に必要な最小のセッション形（client の QuizSessionDto がそのまま入る）。 */
export interface QuizSessionLike {
  kind: QuizKind;
  total: number;
  correct: number;
  durationMs: number;
  createdAt: string;
}

/** 1日ぶんの集計点。 */
export interface QuizDayPoint {
  /** JST の日付 'YYYY-MM-DD'。 */
  day: string;
  sessions: number;
  correct: number;
  total: number;
  /** 正答率 0-1（total 0 なら null＝0% と区別する）。 */
  accuracy: number | null;
  /** 1分あたり正解数のセッション平均（セッション無し・全て durationMs<=0 なら null）。 */
  correctPerMinute: number | null;
}

const DAY_MS = 86_400_000;
const JST_OFFSET_MS = 9 * 3_600_000;

/** all 期間の点数上限（1年ぶん。無限に伸ばさない）。 */
export const QUIZ_STATS_MAX_DAYS = 365;

/** エポックms → JST の日インデックス（日単位の通し番号）。 */
function jstDayIndex(ms: number): number {
  return Math.floor((ms + JST_OFFSET_MS) / DAY_MS);
}

/** 日インデックス → 'YYYY-MM-DD'。 */
function dayString(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

/**
 * セッション履歴を JST の日毎に集計する。
 * period 7d/30d は now を末尾に固定長（欠損日も 0 で埋める）。
 * all は最古のセッション日〜now（上限 QUIZ_STATS_MAX_DAYS 点で clamp。セッション無しは空配列）。
 * kind を指定するとその種目だけ集計する。
 */
export function quizDailyStats(
  sessions: QuizSessionLike[],
  period: QuizStatsPeriod,
  now: Date,
  kind?: QuizKind,
): QuizDayPoint[] {
  const filtered = kind === undefined ? sessions : sessions.filter((s) => s.kind === kind);
  const nowIdx = jstDayIndex(now.getTime());

  let startIdx: number;
  if (period === "7d") startIdx = nowIdx - 6;
  else if (period === "30d") startIdx = nowIdx - 29;
  else {
    const idxs = filtered
      .map((s) => jstDayIndex(Date.parse(s.createdAt)))
      .filter((i) => i <= nowIdx);
    if (idxs.length === 0) return [];
    startIdx = Math.max(Math.min(...idxs), nowIdx - (QUIZ_STATS_MAX_DAYS - 1));
  }

  // 日インデックス → その日のセッション（窓外は捨てる）。
  const byDay = new Map<number, QuizSessionLike[]>();
  for (const s of filtered) {
    const idx = jstDayIndex(Date.parse(s.createdAt));
    if (idx < startIdx || idx > nowIdx) continue;
    const bucket = byDay.get(idx);
    if (bucket) bucket.push(s);
    else byDay.set(idx, [s]);
  }

  const points: QuizDayPoint[] = [];
  for (let idx = startIdx; idx <= nowIdx; idx++) {
    const day = byDay.get(idx) ?? [];
    const correct = day.reduce((n, s) => n + s.correct, 0);
    const total = day.reduce((n, s) => n + s.total, 0);
    // 1分あたり正解数はセッション単位の率の平均（durationMs<=0 は0除算になるため除外）。
    const rates = day
      .filter((s) => s.durationMs > 0)
      .map((s) => s.correct / (s.durationMs / 60_000));
    points.push({
      day: dayString(idx),
      sessions: day.length,
      correct,
      total,
      accuracy: total > 0 ? correct / total : null,
      correctPerMinute: rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    });
  }
  return points;
}

/** サマリ（回数・ベストスコア・平均正答率=正解合計/出題合計）。kind 指定で種目別。 */
export function quizStatsSummary(
  sessions: QuizSessionLike[],
  kind?: QuizKind,
): { sessions: number; bestCorrect: number; avgAccuracy: number | null } {
  const filtered = kind === undefined ? sessions : sessions.filter((s) => s.kind === kind);
  const correct = filtered.reduce((n, s) => n + s.correct, 0);
  const total = filtered.reduce((n, s) => n + s.total, 0);
  return {
    sessions: filtered.length,
    bestCorrect: filtered.reduce((best, s) => Math.max(best, s.correct), 0),
    avgAccuracy: total > 0 ? correct / total : null,
  };
}

/** グラフ描画用の系列（web の SVG 折れ線と mobile が共用する座標前計算）。 */
export interface QuizChartSeries {
  /** 各点の y 値（correctPerMinute。データ無し日は 0 として折れ線を切らない）。 */
  values: number[];
  /** y 軸スケール上限（最大値。全点 0 でも 1 = 0除算防止）。 */
  max: number;
  /** 日付軸ラベル（最初/中央/最後の最大3個。'M/D' 表記・点 index 付き）。 */
  labels: { index: number; text: string }[];
}

/** 日毎集計からグラフ系列を組む（描画側は座標のスケーリングだけを行う）。 */
export function quizChartSeries(points: QuizDayPoint[]): QuizChartSeries {
  const values = points.map((p) => p.correctPerMinute ?? 0);
  const max = Math.max(1, ...values);
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const labels = points.length
    ? labelIndexes.map((index) => {
        const [, m, d] = points[index]!.day.split("-");
        return { index, text: `${Number(m)}/${Number(d)}` };
      })
    : [];
  return { values, max, labels };
}
