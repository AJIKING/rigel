// 特訓ランキングの純ロジック（集計行 → 単一スコアボード＋自分の順位）。
// サーバ（api の GetQuizRanking）と画面（web/mobile）が同じ並べ方・スコア定義を共有する。
// Plan: docs/plans/quiz-open-and-ranking.md 4-2（[決定] 2026-08-04 / 2026-08-07 単一ボード化）。

import { describe, expect, it } from "vitest";
import {
  buildQuizRanking,
  quizRankingName,
  quizScoreLabel,
  quizScoreOf,
  QUIZ_RANKING_BOARD_LABEL,
  QUIZ_RANKING_PERIODS,
  QUIZ_RANKING_SCORE_NOTE,
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

describe("定数（[決定] 2026-08-04/2026-08-07 と実装既定値）", () => {
  it("期間は 週間/月間/全期間 の3つ・既定の先頭は週間", () => {
    expect(QUIZ_RANKING_PERIODS.map((p) => p.key)).toEqual(["weekly", "monthly", "all"]);
    expect(QUIZ_RANKING_PERIODS[0]!.label).toBe("週間");
  });

  it("上位表示数（実装既定値）とボード文言（「正解数」は結果画面の既存表記と統一）", () => {
    expect(QUIZ_RANKING_TOP_N).toBe(50);
    expect(QUIZ_RANKING_BOARD_LABEL).toBe("スコア");
    expect(QUIZ_RANKING_SCORE_NOTE).toBe("スコア = 正解数 × 正答率");
  });

  it("表示名は displayName → handle → フォールバック の順で解決する（web/mobile 共通規則）", () => {
    expect(quizRankingName({ displayName: "太郎", handle: "taro" })).toBe("太郎");
    expect(quizRankingName({ displayName: "", handle: "taro" })).toBe("taro");
    expect(quizRankingName({ displayName: "", handle: "" })).toBe("プレイヤー");
  });
});

describe("quizScoreOf / quizScoreLabel（スコア = 正答数 × 正答率）", () => {
  it("正答数に正答率を掛ける（= correct² / total）", () => {
    expect(quizScoreOf({ correct: 80, total: 100 })).toBe(64); // 80問 × 80%
    expect(quizScoreOf({ correct: 50, total: 50 })).toBe(50); // 全問正解は正答数そのまま
    expect(quizScoreOf({ correct: 100, total: 200 })).toBe(50); // 量が2倍でも 50% なら同じ
    expect(quizScoreOf({ correct: 0, total: 0 })).toBe(0); // 0除算防御
  });

  it("表示は小数1桁（四捨五入）", () => {
    expect(quizScoreLabel(64)).toBe("64.0");
    expect(quizScoreLabel(40.5)).toBe("40.5");
    expect(quizScoreLabel(71.96)).toBe("72.0"); // 丸め境界
    expect(quizScoreLabel(62.307)).toBe("62.3");
  });
});

describe("buildQuizRanking（単一スコアボード・自分の順位）", () => {
  const ROWS: QuizRankingRow[] = [
    row({ userId: "a", correct: 90, total: 100 }), // score 81
    row({ userId: "b", correct: 120, total: 200 }), // score 72（正解数は最多でも率で逆転される）
    row({ userId: "c", correct: 40, total: 40 }), // score 40（全問正解・少プレイ）
    row({ userId: "d", correct: 60, total: 80 }), // score 45
  ];

  it("スコア降順で並び、rank は 1 始まり・score が載る", () => {
    const r = buildQuizRanking(ROWS, null);
    expect(r.entries.map((e) => e.handle)).toEqual(["h-a", "h-b", "h-d", "h-c"]);
    expect(r.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    expect(r.entries[0]!.score).toBe(81);
    // userId は返さない（公開情報は handle/displayName のみ。ルール 7-3 整合）。
    expect(Object.keys(r.entries[0]!).sort()).toEqual([
      "accuracy",
      "correct",
      "displayName",
      "handle",
      "rank",
      "score",
      "total",
    ]);
  });

  it("viewerId を渡すと自分の集計と順位が付く（圏外でも出す）", () => {
    const r = buildQuizRanking(ROWS, "c");
    expect(r.me).toEqual({ rank: 4, correct: 40, total: 40, accuracy: 1, score: 40 });
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
    expect(r.entries).toHaveLength(QUIZ_RANKING_TOP_N);
    expect(r.me!.rank).toBe(QUIZ_RANKING_TOP_N + 6); // 圏外でも順位は出す
  });

  it("total=0 の行（理論上の防御）でも 0 除算にならない", () => {
    const r = buildQuizRanking([row({ userId: "z", correct: 0, total: 0 })], "z");
    expect(r.entries[0]!.score).toBe(0);
    expect(r.me!.accuracy).toBe(0);
  });
});

describe("同順位（1224式 [決定] 2026-08-04 オーナー・スコアは分数として厳密比較）", () => {
  it("スコアが厳密に等しい（10/20 と 5/5 はどちらも 5.0）は同順位を共有し、次は人数ぶん飛ぶ", () => {
    const rows = [
      row({ userId: "a", correct: 10, total: 20 }), // score 5・正答率 50%
      row({ userId: "b", correct: 5, total: 5 }), // score 5・正答率 100%（表示順はこちらが先）
      row({ userId: "c", correct: 4, total: 10 }), // score 1.6
    ];
    const r = buildQuizRanking(rows, "c");
    expect(r.entries.map((e) => [e.rank, e.handle])).toEqual([
      [1, "h-b"], // 同点内の表示順は正答率降順
      [1, "h-a"],
      [3, "h-c"], // 2 は飛ぶ（1224式）
    ]);
    expect(r.me!.rank).toBe(3);
  });

  it("浮動小数の丸めに頼らず交差積で同点判定する（整数演算）", () => {
    // 30²/90 = 10 と 10²/10 = 10（整数比較: 30²×10 === 10²×90）。
    const rows = [
      row({ userId: "a", correct: 30, total: 90 }),
      row({ userId: "b", correct: 10, total: 10 }),
    ];
    const r = buildQuizRanking(rows, null);
    expect(r.entries.map((e) => e.rank)).toEqual([1, 1]);
  });

  it("交差積が 2^53 を超える巨大な累積でも同点判定が壊れない（BigInt 比較）", () => {
    // どちらもスコア 15（30²/60 と (3×10⁷)²/(6×10¹³)）。交差積は 5.4×10¹⁶ > 2^53。
    const rows = [
      row({ userId: "a", correct: 30, total: 60 }),
      row({ userId: "b", correct: 30_000_000, total: 60_000_000_000_000 }),
    ];
    const r = buildQuizRanking(rows, null);
    expect(r.entries.map((e) => e.rank)).toEqual([1, 1]); // 同スコアは厳密に同点
  });
});
