import { describe, expect, it } from "vitest";
import { QUIZ_KIND_LABELS } from "./quiz-copy";
import {
  QUIZ_HISTORY_LIMIT,
  QUIZ_KIND_FILTERS,
  QUIZ_RECENT_LIMIT,
  QUIZ_STATS_PERIOD_LABELS,
  QUIZ_STATS_PERIODS,
  accuracyLabel,
  jstDateTime,
  jstShortDateTime,
  quizChartSeries,
  quizDailyStats,
  quizRateLabel,
  quizRecentLine,
  quizStatsSummary,
  type QuizDayPoint,
  type QuizSessionLike,
  type QuizStatsPeriod,
} from "./quiz-stats";

// now = JST 2026-07-24 12:00（= UTC 03:00）。7d 窓は JST 2026-07-18〜2026-07-24。
const NOW = new Date("2026-07-24T03:00:00.000Z");

/** セッションを1件作る（既定: 清一色・10問7正解・60秒）。 */
function mk(createdAt: string, over: Partial<QuizSessionLike> = {}): QuizSessionLike {
  return { kind: "chinitsu", total: 10, correct: 7, durationMs: 60_000, createdAt, ...over };
}

/** 指定日の点を取り出す（無ければ失敗させる）。 */
function pointOf(points: QuizDayPoint[], day: string): QuizDayPoint {
  const found = points.find((p) => p.day === day);
  expect(found, `日 ${day} の点が存在する`).toBeDefined();
  return found!;
}

describe("quizDailyStats（期間の窓と欠損日埋め）", () => {
  it.each<{ name: string; period: QuizStatsPeriod; length: number; first: string; last: string }>([
    {
      name: "7d は now(JST) を末尾に7点",
      period: "7d",
      length: 7,
      first: "2026-07-18",
      last: "2026-07-24",
    },
    {
      name: "30d は now(JST) を末尾に30点",
      period: "30d",
      length: 30,
      first: "2026-06-25",
      last: "2026-07-24",
    },
  ])("空配列でも $name（全点 0 セッションで埋める）", ({ period, length, first, last }) => {
    const points = quizDailyStats([], period, NOW);
    expect(points).toHaveLength(length);
    expect(points[0]!.day).toBe(first);
    expect(points[points.length - 1]!.day).toBe(last);
    for (const p of points) {
      expect(p).toEqual({
        day: p.day,
        sessions: 0,
        correct: 0,
        total: 0,
        accuracy: null,
        correctPerMinute: null,
      });
    }
  });

  it("all はセッションが無ければ空配列（最古の日が定まらない）", () => {
    expect(quizDailyStats([], "all", NOW)).toEqual([]);
  });

  it("all は最古のセッション日〜now(JST) を日毎に返す（欠損日も埋める）", () => {
    const points = quizDailyStats([mk("2026-07-20T00:00:00.000Z")], "all", NOW);
    expect(points.map((p) => p.day)).toEqual([
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
      "2026-07-23",
      "2026-07-24",
    ]);
  });

  it("all は 365 点で clamp する（それより古いセッションは窓外＝集計に入らない）", () => {
    const points = quizDailyStats([mk("2025-05-01T00:00:00.000Z")], "all", NOW);
    expect(points).toHaveLength(365);
    expect(points[0]!.day).toBe("2025-07-25"); // now - 364日
    expect(points[points.length - 1]!.day).toBe("2026-07-24");
    expect(points.every((p) => p.sessions === 0)).toBe(true);
  });

  it.each<{ name: string; createdAt: string; day: string }>([
    // JST 丸め: UTC 15:00 は JST では翌日 0:00。
    {
      name: "UTC 15:00 は JST の翌日に入る",
      createdAt: "2026-07-23T15:00:00.000Z",
      day: "2026-07-24",
    },
    {
      name: "UTC 14:59:59.999 は JST の同日",
      createdAt: "2026-07-23T14:59:59.999Z",
      day: "2026-07-23",
    },
    { name: "UTC 0:00 は JST の同日", createdAt: "2026-07-20T00:00:00.000Z", day: "2026-07-20" },
  ])("$name（createdAt=$createdAt → $day）", ({ createdAt, day }) => {
    const points = quizDailyStats([mk(createdAt)], "7d", NOW);
    expect(pointOf(points, day).sessions).toBe(1);
    expect(points.reduce((n, p) => n + p.sessions, 0)).toBe(1); // 他の日に漏れない
  });

  it("同日の複数セッションを合算する（正答率は正解合計/出題合計）", () => {
    const points = quizDailyStats(
      [
        mk("2026-07-22T01:00:00.000Z", { correct: 7, total: 10 }),
        mk("2026-07-22T02:00:00.000Z", { correct: 5, total: 10 }),
      ],
      "7d",
      NOW,
    );
    const p = pointOf(points, "2026-07-22");
    expect(p.sessions).toBe(2);
    expect(p.correct).toBe(12);
    expect(p.total).toBe(20);
    expect(p.accuracy).toBeCloseTo(0.6, 10);
  });

  it("correctPerMinute はセッションごとの「正解数/分」の平均（12/60秒 と 6/60秒 → 9）", () => {
    const points = quizDailyStats(
      [
        mk("2026-07-22T01:00:00.000Z", { correct: 12, total: 15, durationMs: 60_000 }),
        mk("2026-07-22T02:00:00.000Z", { correct: 6, total: 8, durationMs: 60_000 }),
      ],
      "7d",
      NOW,
    );
    expect(pointOf(points, "2026-07-22").correctPerMinute).toBeCloseTo(9, 10);
  });

  it("durationMs が 0 以下のセッションは correctPerMinute の平均から除く（0除算しない）", () => {
    const points = quizDailyStats(
      [
        mk("2026-07-22T01:00:00.000Z", { correct: 5, durationMs: 0 }),
        mk("2026-07-22T02:00:00.000Z", { correct: 6, durationMs: 60_000 }),
      ],
      "7d",
      NOW,
    );
    expect(pointOf(points, "2026-07-22").correctPerMinute).toBeCloseTo(6, 10);
  });

  it("total 0 の日でも accuracy は null（0% と区別する）。correctPerMinute は 0 になる", () => {
    const points = quizDailyStats(
      [mk("2026-07-22T01:00:00.000Z", { correct: 0, total: 0 })],
      "7d",
      NOW,
    );
    const p = pointOf(points, "2026-07-22");
    expect(p.sessions).toBe(1);
    expect(p.accuracy).toBeNull();
    expect(p.correctPerMinute).toBe(0);
  });

  it("kind を指定すると他種目のセッションを数えない", () => {
    const sessions = [
      mk("2026-07-22T01:00:00.000Z", { kind: "chinitsu" }),
      mk("2026-07-22T02:00:00.000Z", { kind: "efficiency" }),
    ];
    const points = quizDailyStats(sessions, "7d", NOW, "chinitsu");
    expect(pointOf(points, "2026-07-22").sessions).toBe(1);
  });

  it("7d の窓外（8日前）のセッションは集計に入らない", () => {
    const points = quizDailyStats([mk("2026-07-16T00:00:00.000Z")], "7d", NOW);
    expect(points.reduce((n, p) => n + p.sessions, 0)).toBe(0);
  });
});

describe("quizStatsSummary（サマリ: 回数・ベストスコア・平均正答率）", () => {
  const SESSIONS = [
    mk("2026-07-20T00:00:00.000Z", { kind: "chinitsu", correct: 7, total: 10 }),
    mk("2026-07-21T00:00:00.000Z", { kind: "chinitsu", correct: 5, total: 10 }),
    mk("2026-07-22T00:00:00.000Z", { kind: "efficiency", correct: 9, total: 10 }),
  ];

  it.each<{
    name: string;
    kind?: "chinitsu" | "efficiency";
    expected: { sessions: number; bestCorrect: number; avgAccuracy: number | null };
  }>([
    { name: "全種目", expected: { sessions: 3, bestCorrect: 9, avgAccuracy: 0.7 } },
    {
      name: "kind=chinitsu",
      kind: "chinitsu",
      expected: { sessions: 2, bestCorrect: 7, avgAccuracy: 0.6 },
    },
    {
      name: "kind=efficiency",
      kind: "efficiency",
      expected: { sessions: 1, bestCorrect: 9, avgAccuracy: 0.9 },
    },
  ])("$name のサマリ（平均正答率は正解合計/出題合計）", ({ kind, expected }) => {
    const s = quizStatsSummary(SESSIONS, kind);
    expect(s.sessions).toBe(expected.sessions);
    expect(s.bestCorrect).toBe(expected.bestCorrect);
    expect(s.avgAccuracy).toBeCloseTo(expected.avgAccuracy!, 10);
  });

  it("空配列は sessions 0 / bestCorrect 0 / avgAccuracy null", () => {
    expect(quizStatsSummary([])).toEqual({ sessions: 0, bestCorrect: 0, avgAccuracy: null });
  });

  it("出題合計が 0 なら avgAccuracy は null（0% と区別する）", () => {
    const s = quizStatsSummary([mk("2026-07-20T00:00:00.000Z", { correct: 0, total: 0 })]);
    expect(s).toEqual({ sessions: 1, bestCorrect: 0, avgAccuracy: null });
  });
});

describe("quizChartSeries（折れ線/バー描画用の系列。web SVG と mobile が共用）", () => {
  /** 記録あり2日（7/22=12・7/24=6）の 7d 窓。 */
  function twoDays() {
    return quizDailyStats(
      [
        mk("2026-07-22T01:00:00.000Z", { correct: 12, durationMs: 60_000 }),
        mk("2026-07-24T01:00:00.000Z", { correct: 6, durationMs: 60_000 }),
      ],
      "7d",
      NOW,
    );
  }

  it("記録の無い日は null（0 と区別する。0埋めすると『やらなかった日』が『成績0』に見える）", () => {
    const series = quizChartSeries(twoDays());
    expect(series.values).toEqual([null, null, null, null, 12, null, 6]);
    expect(series.hasData).toBe(true);
  });

  it("line は記録のある点だけを index 昇順で結ぶ（欠損日を跨いで繋ぐ）", () => {
    expect(quizChartSeries(twoDays()).line).toEqual([
      { index: 4, value: 12 },
      { index: 6, value: 6 },
    ]);
  });

  it("max は切りの良い上限へ切り上げ、ticks は 0 から等間隔（軸で値が読める）", () => {
    const series = quizChartSeries(twoDays());
    expect(series.max).toBe(15);
    expect(series.ticks).toEqual([
      { value: 0, text: "0" },
      { value: 5, text: "5" },
      { value: 10, text: "10" },
      { value: 15, text: "15" },
    ]);
  });

  it("小数の刻みは 1 桁で表示する（0.5 刻み）", () => {
    const points = quizDailyStats(
      [mk("2026-07-24T01:00:00.000Z", { correct: 1, durationMs: 60_000 })],
      "7d",
      NOW,
    );
    const series = quizChartSeries(points);
    expect(series.ticks.map((t) => t.text)).toEqual(["0", "0.5", "1"]);
  });

  it("記録が1件も無ければ hasData=false・line 空・max は 1（0除算回避）", () => {
    const series = quizChartSeries(quizDailyStats([], "7d", NOW));
    expect(series.values).toEqual([null, null, null, null, null, null, null]);
    expect(series.hasData).toBe(false);
    expect(series.line).toEqual([]);
    expect(series.max).toBe(1);
    expect(series.lastIndex).toBeNull();
  });

  it("lastIndex は最新の記録がある点（終端マーカーと値ラベルの位置）", () => {
    expect(quizChartSeries(twoDays()).lastIndex).toBe(6);
  });

  it("日付軸ラベルは 最初/中央/最後 の3個（M/D 表記）。dayLabels は全点ぶん（ツールチップ用）", () => {
    const series = quizChartSeries(quizDailyStats([], "7d", NOW));
    expect(series.labels).toEqual([
      { index: 0, text: "7/18" },
      { index: 3, text: "7/21" },
      { index: 6, text: "7/24" },
    ]);
    expect(series.dayLabels).toEqual(["7/18", "7/19", "7/20", "7/21", "7/22", "7/23", "7/24"]);
  });

  it("点が1つならラベルは1個に重複除去する。空なら空の系列", () => {
    const one = quizChartSeries(quizDailyStats([mk("2026-07-24T01:00:00.000Z")], "all", NOW));
    expect(one.labels).toEqual([{ index: 0, text: "7/24" }]);
    expect(quizChartSeries([])).toEqual({
      values: [],
      line: [],
      max: 1,
      ticks: [
        { value: 0, text: "0" },
        { value: 1, text: "1" },
      ],
      labels: [],
      dayLabels: [],
      lastIndex: null,
      hasData: false,
    });
  });
});

describe("quizRateLabel（1分あたり正解数の表示。グラフの値ラベル/ツールチップで共用）", () => {
  it("小数1桁に丸め、整数は小数点を出さない", () => {
    expect(quizRateLabel(12)).toBe("12");
    expect(quizRateLabel(12.34)).toBe("12.3");
    expect(quizRateLabel(12.35)).toBe("12.4");
  });

  it("記録なし（null）は '—'（0 と区別する）", () => {
    expect(quizRateLabel(null)).toBe("—");
    expect(quizRateLabel(0)).toBe("0");
  });
});

describe("jstDateTime（履歴行の日時表示。集計と同じ UTC+9 固定）", () => {
  it.each<{ name: string; iso: string; expected: string }>([
    {
      name: "UTC 01:00 は JST 10:00",
      iso: "2026-07-22T01:00:00.000Z",
      expected: "2026/07/22 10:00",
    },
    {
      name: "UTC 15:00 は JST の翌日 0:00（日跨ぎ）",
      iso: "2026-07-23T15:00:00.000Z",
      expected: "2026/07/24 00:00",
    },
    {
      name: "月日・時分は 2 桁 0 埋め",
      iso: "2026-01-02T18:04:00.000Z",
      expected: "2026/01/03 03:04",
    },
  ])("$name（$iso → $expected）", ({ iso, expected }) => {
    expect(jstDateTime(iso)).toBe(expected);
  });
});

describe("accuracyLabel（正答率 0-1 の % 表示）", () => {
  it.each<{ name: string; accuracy: number | null; expected: string }>([
    { name: "0.7 は '70%'", accuracy: 0.7, expected: "70%" },
    { name: "0.005 は '1%'（整数に四捨五入）", accuracy: 0.005, expected: "1%" },
    { name: "0 は '0%'", accuracy: 0, expected: "0%" },
    { name: "null は '—'（出題0問を 0% と区別）", accuracy: null, expected: "—" },
  ])("$name", ({ accuracy, expected }) => {
    expect(accuracyLabel(accuracy)).toBe(expected);
  });
});

describe("jstShortDateTime（開始ダイアログの直近記録行。年なし M/D HH:mm・UTC+9 固定）", () => {
  it.each<{ name: string; iso: string; expected: string }>([
    { name: "UTC 03:05 は JST 12:05", iso: "2026-07-24T03:05:00.000Z", expected: "7/24 12:05" },
    {
      name: "UTC 15:00 は JST の翌日 0:00（日跨ぎ）",
      iso: "2026-07-23T15:00:00.000Z",
      expected: "7/24 00:00",
    },
    {
      name: "月日は 0 埋めしない・時分は 2 桁 0 埋め",
      iso: "2026-01-02T18:04:00.000Z",
      expected: "1/3 03:04",
    },
  ])("$name（$iso → $expected）", ({ iso, expected }) => {
    expect(jstShortDateTime(iso)).toBe(expected);
  });
});

describe("quizRecentLine（開始ダイアログの直近記録1行。web/mobile で共用）", () => {
  it.each<{ name: string; session: QuizSessionLike; expected: string }>([
    {
      name: "日時・正解 X/Y問・正答率 Z% を「 ・ 」区切りで1行に",
      session: mk("2026-07-24T03:05:00.000Z", { correct: 7, total: 10 }),
      expected: "7/24 12:05 ・ 正解 7/10問 ・ 正答率 70%",
    },
    {
      name: "出題 0 問の正答率は '—'（0% と区別）",
      session: mk("2026-07-24T03:05:00.000Z", { correct: 0, total: 0 }),
      expected: "7/24 12:05 ・ 正解 0/0問 ・ 正答率 —",
    },
  ])("$name", ({ session, expected }) => {
    expect(quizRecentLine(session)).toBe(expected);
  });
});

describe("マイページ「特訓」の共有定義（履歴上限・期間・種目チップ）", () => {
  it("開始ダイアログの直近記録は最大5件", () => {
    expect(QUIZ_RECENT_LIMIT).toBe(5);
  });

  it("履歴リストの表示上限は直近20件", () => {
    expect(QUIZ_HISTORY_LIMIT).toBe(20);
  });

  it("期間チップは 7日/30日/全期間 の順で、ラベル表（QUIZ_STATS_PERIOD_LABELS）と一致する", () => {
    expect(QUIZ_STATS_PERIODS).toEqual([
      { key: "7d", label: "7日" },
      { key: "30d", label: "30日" },
      { key: "all", label: "全期間" },
    ]);
    for (const p of QUIZ_STATS_PERIODS) {
      expect(QUIZ_STATS_PERIOD_LABELS[p.key]).toBe(p.label);
    }
  });

  // チップは種目の表示名から導出する（別に短縮名を持つと表記がずれる）。
  // 並びは種目カードと同じ（背骨 QuizKindSchema.options）。
  it("種目チップは「全種目」+ 種目名で、QUIZ_KIND_LABELS の全種目を並び順どおり網羅する", () => {
    expect(QUIZ_KIND_FILTERS).toEqual([
      { key: "all", label: "全種目" },
      { key: "score", label: "点数計算" },
      { key: "efficiency", label: "牌効率" },
      { key: "chinitsu", label: "清一色 何待ち" },
      { key: "chinitsuUkeire", label: "清一色 牌効率" },
    ]);
    // 種目が増えたらチップも増やす（正式名 QUIZ_KIND_LABELS との網羅整合）。
    expect(QUIZ_KIND_FILTERS.map((k) => k.key)).toEqual(["all", ...Object.keys(QUIZ_KIND_LABELS)]);
  });
});
