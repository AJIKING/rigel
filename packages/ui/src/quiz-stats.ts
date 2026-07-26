// 特訓クイズの履歴グラフ整形（web/mobile のマイページ「特訓」で共用する純関数）。
// 日付の丸めは api の started_day と同じ JST（背骨 @rigel/schema の JST_OFFSET_MS を共有）。
// 欠損日は 0 セッションの点として埋める（折れ線が日付軸で飛ばないように）。

import { JST_OFFSET_MS, type QuizKind } from "@rigel/schema";

/** グラフの期間（7日/30日は now から遡る。all は最古のセッション〜now）。 */
export type QuizStatsPeriod = "7d" | "30d" | "all";

/** 期間の表示ラベル（mobile のグラフ説明文などで単独参照する用）。 */
export const QUIZ_STATS_PERIOD_LABELS: Record<QuizStatsPeriod, string> = {
  "7d": "7日",
  "30d": "30日",
  all: "全期間",
};

/** 期間切替チップの選択肢（表示順つき。web/mobile のマイページ「特訓」で共用）。 */
export const QUIZ_STATS_PERIODS: readonly { key: QuizStatsPeriod; label: string }[] = (
  ["7d", "30d", "all"] as const
).map((key) => ({ key, label: QUIZ_STATS_PERIOD_LABELS[key] }));

/** 種目絞り込みチップ（「全種目」+ 各種目の短縮名。web/mobile のマイページ「特訓」で共用。
 *  チップは短縮名。履歴行の種目名は QUIZ_KIND_LABELS（quiz-copy.ts）の正式名を使う。 */
export const QUIZ_KIND_FILTERS: readonly { key: "all" | QuizKind; label: string }[] = [
  { key: "all", label: "全種目" },
  { key: "chinitsu", label: "清一色" },
  { key: "efficiency", label: "牌効率" },
  { key: "score", label: "点数計算" },
  { key: "chinitsuUkeire", label: "清一色何切る" },
];

/** 履歴リストの表示上限（直近。web/mobile のマイページ「特訓」で共用）。 */
export const QUIZ_HISTORY_LIMIT = 20;

/** 開始ダイアログに出す直近記録の最大件数（web/mobile の特訓画面で共用）。 */
export const QUIZ_RECENT_LIMIT = 5;

/** ISO日時 → JST の 'YYYY/MM/DD HH:MM'（履歴行の日時。集計と同じ UTC+9 固定）。 */
export function jstDateTime(iso: string): string {
  const d = new Date(Date.parse(iso) + JST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(
    d.getUTCHours(),
  )}:${p(d.getUTCMinutes())}`;
}

/** 正答率 0-1 → '70%'（null は '—' = 出題0問を0%と区別）。 */
export function accuracyLabel(accuracy: number | null): string {
  return accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`;
}

/** ISO日時 → JST の 'M/D HH:mm'（開始ダイアログの直近記録行。年なし・月日は0埋めしない）。 */
export function jstShortDateTime(iso: string): string {
  const d = new Date(Date.parse(iso) + JST_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** 開始ダイアログの直近記録1行（「M/D HH:mm ・ 正解 X/Y問 ・ 正答率 Z%」。web/mobile で共用）。 */
export function quizRecentLine(s: QuizSessionLike): string {
  const accuracy = s.total > 0 ? s.correct / s.total : null;
  return `${jstShortDateTime(s.createdAt)} ・ 正解 ${s.correct}/${s.total}問 ・ 正答率 ${accuracyLabel(accuracy)}`;
}

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

/** y 軸の目盛り1本（値と表示テキスト）。 */
export interface QuizChartTick {
  value: number;
  text: string;
}

/** グラフ描画用の系列（web の SVG 折れ線と mobile が共用する座標前計算）。 */
export interface QuizChartSeries {
  /** 各点の y 値（correctPerMinute）。**記録の無い日は null**（0 と区別する）。 */
  values: (number | null)[];
  /** 折れ線として結ぶ点（記録のある点だけ・index 昇順。欠損日は跨いで繋ぐ）。 */
  line: { index: number; value: number }[];
  /** y 軸スケール上限（切りの良い値へ切り上げ。記録なしでも 1 = 0除算防止）。 */
  max: number;
  /** y 軸の水平グリッド（0 から max まで等間隔。軸だけで値が読めるように）。 */
  ticks: QuizChartTick[];
  /** 日付軸ラベル（最初/中央/最後の最大3個。'M/D' 表記・点 index 付き）。 */
  labels: { index: number; text: string }[];
  /** 全点ぶんの 'M/D'（ツールチップ・読み上げ用）。 */
  dayLabels: string[];
  /** 最新の記録がある点の index（終端マーカーと値ラベルの位置。記録なしは null）。 */
  lastIndex: number | null;
  /** 期間内に1日でも記録があるか（false ならグラフを出さず空状態にする）。 */
  hasData: boolean;
}

/** 浮動小数の刻み計算の誤差を落とす（0.1*3 = 0.30000000000000004 対策）。 */
function round10(v: number): number {
  return Number(v.toFixed(10));
}

/**
 * 0 起点で「切りの良い」目盛りを作る（刻みは 1/2/5×10^n から選び、区間は 2〜4 本）。
 * 生の最大値をそのまま上限にすると軸の数字が半端になり読めないため。
 */
function niceTicks(raw: number): { max: number; values: number[] } {
  if (!(raw > 0)) return { max: 1, values: [0, 1] };
  const unit = 10 ** Math.floor(Math.log10(raw / 3));
  const step = [1, 2, 5, 10].map((m) => m * unit).find((s) => raw / s <= 4) ?? 10 * unit;
  const count = Math.max(2, Math.ceil(round10(raw / step)));
  const values = Array.from({ length: count + 1 }, (_, i) => round10(i * step));
  return { max: values[count]!, values };
}

/** 目盛りの表示テキスト（整数はそのまま・小数は1桁）。 */
function tickText(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** 1分あたり正解数の表示（小数1桁・整数は小数点なし。null＝記録なしは '—' で 0 と区別）。 */
export function quizRateLabel(rate: number | null): string {
  return rate === null ? "—" : tickText(Math.round(rate * 10) / 10);
}

/** 'YYYY-MM-DD' → 'M/D'（0埋めしない軸ラベル表記）。 */
function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
}

/** 日毎集計からグラフ系列を組む（描画側は座標のスケーリングだけを行う）。 */
export function quizChartSeries(points: QuizDayPoint[]): QuizChartSeries {
  const values = points.map((p) => p.correctPerMinute);
  const line = values.flatMap((value, index) => (value === null ? [] : [{ index, value }]));
  const { max, values: tickValues } = niceTicks(Math.max(0, ...line.map((p) => p.value)));
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return {
    values,
    line,
    max,
    ticks: tickValues.map((value) => ({ value, text: tickText(value) })),
    labels: points.length
      ? labelIndexes.map((index) => ({ index, text: shortDay(points[index]!.day) }))
      : [],
    dayLabels: points.map((p) => shortDay(p.day)),
    lastIndex: line.length ? line[line.length - 1]!.index : null,
    hasData: line.length > 0,
  };
}
