// 何切る問題のテスト用フィクスチャ（*.test.tsx から共用。本番コードからは import しない）。
import { ProblemSchema, PROBLEM_SCHEMA_VERSION, type Problem } from "@rigel/schema";
import type { ProblemPost } from "../lib/api";

/** 13枚の手牌（すべて別種＝テストでラベルが一意になる）。 */
export const HAND_13 = [
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
  "1s",
] as const;

/** 何切る（discard）問題の最小フィクスチャ。overrides で上書き。 */
export function makeProblem(overrides: Record<string, unknown> = {}): Problem {
  return ProblemSchema.parse({
    schemaVersion: PROBLEM_SCHEMA_VERSION,
    kind: "discard",
    pov: "east",
    drawn: "5p",
    seats: {
      east: { hand: HAND_13.map((tile) => ({ tile, confidence: 1 })) },
      south: {},
      west: {},
      north: {},
    },
    meta: { dealer: "east", roundWind: "east", junme: 6 },
    explanation: "テスト解説",
    ...overrides,
  });
}

/** 南家に設定する手牌13枚（pov の手牌・ツモ牌と重複しない別種＝ラベルが一意）。 */
export const OPP_HAND_13 = [
  "4p",
  "6p",
  "7p",
  "8p",
  "9p",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
] as const;

/** 他家（南家）に手牌を設定した discard 問題（出題オプション ON 相当）。 */
export function makeOpponentHandsProblem(): Problem {
  return makeProblem({
    seats: {
      east: { hand: HAND_13.map((tile) => ({ tile, confidence: 1 })) },
      south: { hand: OPP_HAND_13.map((tile) => ({ tile, confidence: 1 })) },
      west: {},
      north: {},
    },
  });
}

/** 鳴き判断（call）問題のフィクスチャ（南家が切った發を鳴くか）。 */
export function makeCallProblem(overrides: Record<string, unknown> = {}): Problem {
  return makeProblem({
    kind: "call",
    drawn: null,
    targetSeat: "south",
    seats: {
      east: { hand: HAND_13.map((tile) => ({ tile, confidence: 1 })) },
      south: { river: [{ order: 1, tile: "6z", riichi: false, confidence: 1 }] },
      west: {},
      north: {},
    },
    ...overrides,
  });
}

/** API が返す ProblemPost のフィクスチャ。 */
export function makePost(overrides: Partial<ProblemPost> = {}): ProblemPost {
  return {
    id: "p1",
    userId: "u1",
    title: "テスト問題",
    problem: makeProblem(),
    status: "published",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}
