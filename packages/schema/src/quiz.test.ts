// 特訓クイズ（60秒セッション）の結果スキーマ。
// クライアント採点の結果をサーバに記録する際の入口ゲート（量の上限つき）。

import { describe, expect, it } from "vitest";
import { QuizKindSchema, QuizResultSchema } from "./index";

describe("QuizKindSchema（クイズ種別）", () => {
  // score = 点数計算クイズ（[決定] 2026-07-26 追加）。
  // chinitsuUkeire = 清一色 牌効率（単色14枚から一番広くなる1枚を切る。[決定] 2026-07-26 追加。
  //   Plan: docs/plans/quiz-chinitsu-ukeire.md）。
  it.each([["chinitsu"], ["efficiency"], ["score"], ["chinitsuUkeire"]])(
    "%s を受理する",
    (kind) => {
      expect(QuizKindSchema.parse(kind)).toBe(kind);
    },
  );

  it.each([["speed"], [""], [null], [123]])("%o は拒否する", (kind) => {
    expect(QuizKindSchema.safeParse(kind).success).toBe(false);
  });
});

describe("QuizResultSchema（60秒セッション1回の結果）", () => {
  const valid = { kind: "chinitsu", total: 10, correct: 7, durationMs: 61_000 };

  it("正常な結果を受理する", () => {
    expect(QuizResultSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    { name: "total=0・correct=0（1問も答えず終了）", over: { total: 0, correct: 0 } },
    { name: "correct=total（全問正解）", over: { total: 5, correct: 5 } },
    { name: "durationMs=0", over: { durationMs: 0 } },
    { name: "durationMs=120000（上限ちょうど）", over: { durationMs: 120_000 } },
    { name: "total=100（上限ちょうど）", over: { total: 100, correct: 0 } },
  ])("境界値: $name を受理する", ({ over }) => {
    expect(QuizResultSchema.safeParse({ ...valid, ...over }).success).toBe(true);
  });

  it.each([
    { name: "correct > total（採点の矛盾）", over: { total: 3, correct: 4 } },
    { name: "total が上限 100 超え", over: { total: 101 } },
    { name: "durationMs が上限 120000 超え", over: { durationMs: 120_001 } },
    { name: "total が負", over: { total: -1 } },
    { name: "correct が負", over: { correct: -1 } },
    { name: "durationMs が負", over: { durationMs: -1 } },
    { name: "total が小数", over: { total: 1.5 } },
    { name: "kind が不正", over: { kind: "unknown" } },
  ])("不正: $name を拒否する", ({ over }) => {
    expect(QuizResultSchema.safeParse({ ...valid, ...over }).success).toBe(false);
  });
});
