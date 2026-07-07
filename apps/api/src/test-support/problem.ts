// テスト用の何切る問題フィクスチャ（ProblemSchema を満たす最小入力）。

import { ProblemSchema, PROBLEM_SCHEMA_VERSION, type Problem, type Tile } from "@rigel/schema";

const HAND_13: Tile[] = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "1p",
  "2p",
  "3p",
  "4p",
];

/** 何切る（discard）問題の最小入力（未検証の生オブジェクト）。 */
export function minimalProblemInput(): Record<string, unknown> {
  return {
    schemaVersion: PROBLEM_SCHEMA_VERSION,
    kind: "discard",
    pov: "east",
    drawn: "5p",
    seats: {
      east: { hand: HAND_13.map((t) => ({ tile: t, confidence: 1 })) },
      south: {},
      west: {},
      north: {},
    },
    answer: { type: "discard", tile: "5p" },
  };
}

/** 検証済みの何切る問題データ。 */
export function makeProblemData(): Problem {
  return ProblemSchema.parse(minimalProblemInput());
}
