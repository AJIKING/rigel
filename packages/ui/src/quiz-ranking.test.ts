// 特訓ランキングの純ロジック（集計行 → 2ボード＋自分の順位）。
// サーバ（api の GetQuizRanking）と画面（web/mobile）が同じ並べ方・しきい値を共有する。
// Plan: docs/plans/quiz-open-and-ranking.md 4-2（[決定] 2026-08-04）。

import { describe, expect, it } from "vitest";
import {
  buildQuizRanking,
  quizRankingName,
  QUIZ_RANKING_MIN_TOTAL,
  QUIZ_RANKING_PERIODS,
  QUIZ_RANKING_TOP_N,
  type QuizRankingRow,
} from "./quiz-ranking";

function row(over: Partial<QuizRankingRow> & { userId: string }): QuizRankingRow {
  return {
    handle: `h-${over.userId}`,
    displayName: `User ${over.userId}`,
    correct: 0,
    total: 0,
    ...over,
  };
}

describe("定数（[決定] 2026-08-04 と実装既定値）", () => {
  it("期間は 週間/月間/全期間 の3つ・既定の先頭は週間", () => {
    expect(QUIZ_RANKING_PERIODS.map((p) => p.key)).toEqual(["weekly", "monthly", "all"]);
    expect(QUIZ_RANKING_PERIODS[0]!.label).toBe("週間");
  });
  it("正答率ボードの最低解答数と上位表示数（実装既定値）", () => {
    expect(QUIZ_RANKING_MIN_TOTAL).toBe(50);
    expect(QUIZ_RANKING_TOP_N).toBe(50);
  });

  it("表示名は displayName → handle → フォールバック の順で解決する（web/mobile 共通規則）", () => {
    expect(quizRankingName({ displayName: "太郎", handle: "taro" })).toBe("太郎");
    expect(quizRankingName({ displayName: "", handle: "taro" })).toBe("taro");
    expect(quizRankingName({ displayName: "", handle: "" })).toBe("プレイヤー");
  });
});

describe("buildQuizRanking（正解数ボード・正答率ボード・自分の順位）", () => {
  const ROWS: QuizRankingRow[] = [
    row({ userId: "a", correct: 90, total: 100 }), // 正答率 90%
    row({ userId: "b", correct: 120, total: 200 }), // 正解数トップ・正答率 60%
    row({ userId: "c", correct: 40, total: 40 }), // 100% だが最低解答数未満
    row({ userId: "d", correct: 60, total: 80 }), // 75%
  ];

  it("正解数ボードは correct 降順・同数は正答率降順で並び、rank は 1 始まり", () => {
    const r = buildQuizRanking(ROWS, null);
    expect(r.correct.map((e) => e.handle)).toEqual(["h-b", "h-a", "h-d", "h-c"]);
    expect(r.correct.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    // userId は返さない（公開情報は handle/displayName のみ。ルール 7-3 整合）。
    expect(Object.keys(r.correct[0]!).sort()).toEqual([
      "accuracy",
      "correct",
      "displayName",
      "handle",
      "rank",
      "total",
    ]);
  });

  it("正答率ボードは最低解答数（total >= 50）を満たす人だけを accuracy 降順で並べる", () => {
    const r = buildQuizRanking(ROWS, null);
    // c（40問全問正解）はしきい値未満なので載らない。
    expect(r.accuracy.map((e) => e.handle)).toEqual(["h-a", "h-d", "h-b"]);
    expect(r.accuracy[0]!.accuracy).toBeCloseTo(0.9);
  });

  it("viewerId を渡すと自分の集計と両ボードでの順位が付く（しきい値未満の正答率順位は null）", () => {
    const r = buildQuizRanking(ROWS, "c");
    expect(r.me).toEqual({
      correctRank: 4,
      accuracyRank: null, // total 40 < 50
      correct: 40,
      total: 40,
      accuracy: 1,
    });
  });

  it("viewer が期間内に記録を持たなければ me は null", () => {
    expect(buildQuizRanking(ROWS, "nobody").me).toBeNull();
    expect(buildQuizRanking(ROWS, null).me).toBeNull();
  });

  it("ボードは上位 QUIZ_RANKING_TOP_N 件で打ち切る（自分の順位は全体から計算）", () => {
    const many = Array.from({ length: QUIZ_RANKING_TOP_N + 10 }, (_, i) =>
      row({ userId: `u${i}`, correct: 1000 - i, total: 1000 }),
    );
    const r = buildQuizRanking(many, `u${QUIZ_RANKING_TOP_N + 5}`);
    expect(r.correct).toHaveLength(QUIZ_RANKING_TOP_N);
    expect(r.me!.correctRank).toBe(QUIZ_RANKING_TOP_N + 6); // 圏外でも順位は出す
  });

  it("total=0 の行（理論上の防御）でも 0 除算にならない", () => {
    const r = buildQuizRanking([row({ userId: "z", correct: 0, total: 0 })], "z");
    expect(r.correct[0]!.accuracy).toBe(0);
    expect(r.me!.accuracy).toBe(0);
  });
});

describe("同順位（1224式 [決定] 2026-08-04 オーナー）", () => {
  it("正解数ボード: 同じ正解数は同順位を共有し、次の順位は人数ぶん飛ぶ", () => {
    const rows = [
      row({ userId: "a", correct: 100, total: 200 }), // 100問・50%
      row({ userId: "b", correct: 100, total: 120 }), // 100問・83%（表示順は正答率が上のこちらが先）
      row({ userId: "c", correct: 90, total: 100 }),
    ];
    const r = buildQuizRanking(rows, "c");
    expect(r.correct.map((e) => [e.rank, e.handle])).toEqual([
      [1, "h-b"],
      [1, "h-a"], // 同点=同順位（表示順は正答率降順のまま）
      [3, "h-c"], // 2 は飛ぶ（1224式）
    ]);
    expect(r.me!.correctRank).toBe(3);
  });

  it("正答率ボード: 分数として等しい正答率（90/100 と 45/50）は同順位（浮動小数の誤差に頼らない）", () => {
    const rows = [
      row({ userId: "a", correct: 90, total: 100 }), // 90%
      row({ userId: "b", correct: 45, total: 50 }), // 90%（同率。correct 降順で a が先）
      row({ userId: "c", correct: 80, total: 100 }), // 80%
    ];
    const r = buildQuizRanking(rows, "b");
    expect(r.accuracy.map((e) => [e.rank, e.handle])).toEqual([
      [1, "h-a"],
      [1, "h-b"],
      [3, "h-c"],
    ]);
    expect(r.me!.accuracyRank).toBe(1);
  });
});
