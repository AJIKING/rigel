import { describe, expect, it } from "vitest";
import {
  quizChartSeries,
  quizDailyStats,
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
  it("y 値は correctPerMinute（データ無し日は 0 で線を切らない）、max は最大値", () => {
    const points = quizDailyStats(
      [
        mk("2026-07-22T01:00:00.000Z", { correct: 12, durationMs: 60_000 }),
        mk("2026-07-24T01:00:00.000Z", { correct: 6, durationMs: 60_000 }),
      ],
      "7d",
      NOW,
    );
    const series = quizChartSeries(points);
    expect(series.values).toEqual([0, 0, 0, 0, 12, 0, 6]);
    expect(series.max).toBe(12);
  });

  it("全点 0 でも max は 1（0除算・全高バーを避ける）", () => {
    const series = quizChartSeries(quizDailyStats([], "7d", NOW));
    expect(series.values).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(series.max).toBe(1);
  });

  it("日付軸ラベルは 最初/中央/最後 の3個（M/D 表記）", () => {
    const series = quizChartSeries(quizDailyStats([], "7d", NOW));
    expect(series.labels).toEqual([
      { index: 0, text: "7/18" },
      { index: 3, text: "7/21" },
      { index: 6, text: "7/24" },
    ]);
  });

  it("点が1つならラベルは1個に重複除去する。空なら空", () => {
    const one = quizChartSeries(quizDailyStats([mk("2026-07-24T01:00:00.000Z")], "all", NOW));
    expect(one.labels).toEqual([{ index: 0, text: "7/24" }]);
    expect(quizChartSeries([])).toEqual({ values: [], max: 1, labels: [] });
  });
});
