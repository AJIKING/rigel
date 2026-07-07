// 何切る画面テストの共有フィクスチャ・スタブ（mobile の problem-test-helpers と同じ役割）。
// テスト専用（本番バンドルには含まれない）。

import { ProblemSchema, PROBLEM_SCHEMA_VERSION, type Tile } from "@rigel/schema";
import { vi } from "vitest";
import { type ProblemPost } from "../../lib/api";

export const HAND_13: Tile[] = [
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

/** 何切る（discard）問題の ProblemPost。answer/explanation 等は overrides で調整。 */
export function makeDiscardPost(overrides: Partial<ProblemPost> = {}): ProblemPost {
  return {
    id: "p1",
    userId: "owner",
    title: "何を切る？",
    status: "published",
    createdAt: "2026-07-07T00:00:00.000Z",
    problem: ProblemSchema.parse({
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
      answer: { type: "discard", tile: "1m", riichi: true },
      explanation: "ピンズの伸びを見て字牌側から整理する。",
    }),
    ...overrides,
  };
}

/** 鳴き判断（call）問題の ProblemPost（南家が 5p を切った直後・答えはスルー）。 */
export function makeCallPost(overrides: Partial<ProblemPost> = {}): ProblemPost {
  return makeDiscardPost({
    id: "p2",
    problem: ProblemSchema.parse({
      schemaVersion: PROBLEM_SCHEMA_VERSION,
      kind: "call",
      pov: "east",
      targetSeat: "south",
      seats: {
        east: { hand: HAND_13.map((t) => ({ tile: t, confidence: 1 })) },
        south: { river: [{ order: 1, tile: "5p", confidence: 1 }] },
        west: {},
        north: {},
      },
      answer: { type: "pass" },
      explanation: "門前を崩さない。",
    }),
    ...overrides,
  });
}

/** /api/me をスタブしてログイン状態を差し込む（AuthProvider が起動時に読む）。
 *  plan=null で未ログイン。afterEach で vi.unstubAllGlobals() を呼ぶこと。 */
export function stubMe(plan: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ user: plan ? { id: "u1", plan } : null }),
    })),
  );
}
