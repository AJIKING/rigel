import { KifuSchema } from "@rigel/schema";
import { describe, expect, it, vi } from "vitest";
import type { Analyzer } from "../domain/kifu/analyzer";
import { User } from "../domain/user/user";
import { fakeImage } from "../test-support/image";
import {
  InMemoryAnalysisStore,
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { AnalyzeProblemDraft } from "./analyze-problem-draft.usecase";

const NOW = new Date("2026-07-14T00:00:00.000Z");

/** 解析結果のドラフト（KifuSchema 検証済みが Analyzer の契約）。 */
const draftKifu = KifuSchema.parse({
  schemaVersion: "1.0.0",
  capturedAt: NOW.toISOString(),
  cameraBottomSeat: "east",
  seats: {
    east: { hand: [{ tile: "5p" }] },
    south: {},
    west: {},
    north: {},
  },
});

function makeUser(plan: "free" | "next"): User {
  const user = User.create({
    id: "u1",
    googleSub: "sub-1",
    email: "u1@example.com",
    handle: "u1",
    now: NOW,
  });
  if (plan !== "free") user.changePlan(plan);
  return user;
}

function make(opts: { plan?: "free" | "next"; analyzer?: Analyzer } = {}) {
  const games = new InMemoryGameRepository();
  const gameLogs = new InMemoryGameLogRepository();
  const users = new InMemoryUserRepository([makeUser(opts.plan ?? "next")]);
  const analyze = vi.fn().mockResolvedValue({ kifu: draftKifu, geminiCalls: 2 });
  const analyzer = opts.analyzer ?? ({ analyze } as unknown as Analyzer);
  const uc = new AnalyzeProblemDraft({
    users,
    analyzer,
    store: new InMemoryAnalysisStore(games, gameLogs, users),
    now: () => NOW,
  });
  return { uc, users, gameLogs, analyze };
}

const input = { hands: { bottom: fakeImage("hand") }, cameraBottomSeat: "east" as const };

describe("AnalyzeProblemDraft（写真→何切るドラフト。保存はしない）", () => {
  it("解析成功でドラフト Kifu を返し、局・半荘の行は増えない", async () => {
    const { uc, gameLogs } = make();
    const result = await uc.execute({ userId: "u1", input });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kifu.seats.east.hand[0]?.tile).toBe("5p");
    expect(gameLogs.saved).toHaveLength(0); // ドラフトは保存しない
  });

  it("成功時のみ解析カウントが実呼び出し数ぶん増える", async () => {
    const { uc, users } = make();
    await uc.execute({ userId: "u1", input });
    expect((await users.findById("u1"))?.analysisCountThisMonth).toBe(2);
  });

  it("free（枠0）は quota_exceeded で、Analyzer を呼ばない（無駄な課金をしない）", async () => {
    const { uc, analyze } = make({ plan: "free" });
    const result = await uc.execute({ userId: "u1", input });
    expect(result).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(analyze).not.toHaveBeenCalled();
  });

  it("Analyzer が失敗（例外）したらカウントは増えない（成功時のみ加算）", async () => {
    const failing: Analyzer = {
      analyze: () => Promise.reject(new Error("gemini down")),
    };
    const { uc, users } = make({ analyzer: failing });
    await expect(uc.execute({ userId: "u1", input })).rejects.toThrow("gemini down");
    expect((await users.findById("u1"))?.analysisCountThisMonth).toBe(0);
  });

  it("存在しないユーザーは user_not_found", async () => {
    const { uc } = make();
    const result = await uc.execute({ userId: "ghost", input });
    expect(result).toEqual({ ok: false, reason: "user_not_found" });
  });
});
