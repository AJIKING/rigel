import type { Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { AnalysisInput, Analyzer } from "../domain/kifu/analyzer";
import type { GameLog } from "../domain/kifu/game-log";
import type { GameLogRepository } from "../domain/kifu/game-log.repository";
import type { UserRepository } from "../domain/user/user.repository";
import { User, firstOfNextMonthUtc } from "../domain/user/user";
import { validKifu } from "../test-support/kifu";
import { AnalyzeAndSaveKifu } from "./analyze-and-save-kifu.usecase";

const NOW = new Date("2026-06-28T00:00:00.000Z");

const dummyInput: AnalysisInput = {
  riverImage: { data: new ArrayBuffer(0), mimeType: "image/jpeg" },
  handImages: [],
  cameraBottomSeat: "east",
};

class InMemoryUserRepository implements UserRepository {
  private byId = new Map<string, User>();
  constructor(seed: User[] = []) {
    for (const u of seed) this.byId.set(u.id, u);
  }
  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
  findByGoogleSub(googleSub: string): Promise<User | null> {
    for (const u of this.byId.values()) if (u.googleSub === googleSub) return Promise.resolve(u);
    return Promise.resolve(null);
  }
  save(user: User): Promise<void> {
    this.byId.set(user.id, user);
    return Promise.resolve();
  }
}

class InMemoryGameLogRepository implements GameLogRepository {
  readonly saved: GameLog[] = [];
  save(gameLog: GameLog): Promise<void> {
    this.saved.push(gameLog);
    return Promise.resolve();
  }
  findById(id: string): Promise<GameLog | null> {
    return Promise.resolve(this.saved.find((g) => g.id === id) ?? null);
  }
  listByUser(userId: string): Promise<GameLog[]> {
    return Promise.resolve(this.saved.filter((g) => g.userId === userId));
  }
}

class FakeAnalyzer implements Analyzer {
  calls = 0;
  constructor(private readonly result: Kifu) {}
  analyze(_input: AnalysisInput): Promise<Kifu> {
    this.calls += 1;
    return Promise.resolve(this.result);
  }
}

class FailingAnalyzer implements Analyzer {
  calls = 0;
  analyze(_input: AnalysisInput): Promise<Kifu> {
    this.calls += 1;
    return Promise.reject(new Error("analyze failed"));
  }
}

function freeUser(count: number): User {
  return new User({
    id: "u1",
    googleSub: "g1",
    plan: "free",
    analysisCountThisMonth: count,
    countResetAt: firstOfNextMonthUtc(NOW),
  });
}

function makeUsecase(opts: { user?: User; analyzer: Analyzer }) {
  const users = new InMemoryUserRepository(opts.user ? [opts.user] : []);
  const gameLogs = new InMemoryGameLogRepository();
  const usecase = new AnalyzeAndSaveKifu({
    users,
    gameLogs,
    analyzer: opts.analyzer,
    now: () => NOW,
    newId: () => "kifu-1",
  });
  return { usecase, users, gameLogs };
}

describe("AnalyzeAndSaveKifu", () => {
  it("成功すると牌譜が保存され、カウントが +1 される", async () => {
    const user = freeUser(0);
    const { usecase, gameLogs } = makeUsecase({ user, analyzer: new FakeAnalyzer(validKifu) });

    const result = await usecase.execute({ userId: "u1", input: dummyInput });

    expect(result.ok).toBe(true);
    expect(gameLogs.saved).toHaveLength(1);
    expect(gameLogs.saved[0]?.kifu).toEqual(validKifu);
    expect(user.analysisCountThisMonth).toBe(1);
  });

  it("無料枠を使い切っていると解析させず、保存もカウントもしない", async () => {
    const user = freeUser(10); // 上限
    const analyzer = new FakeAnalyzer(validKifu);
    const { usecase, gameLogs } = makeUsecase({ user, analyzer });

    const result = await usecase.execute({ userId: "u1", input: dummyInput });

    expect(result).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(analyzer.calls).toBe(0); // 解析を呼ばない（コストもかけない）
    expect(gameLogs.saved).toHaveLength(0);
    expect(user.analysisCountThisMonth).toBe(10);
  });

  it("解析が失敗したらカウントを進めず保存もしない（成功時のみ加算）", async () => {
    const user = freeUser(3);
    const { usecase, gameLogs } = makeUsecase({ user, analyzer: new FailingAnalyzer() });

    await expect(usecase.execute({ userId: "u1", input: dummyInput })).rejects.toThrow(
      "analyze failed",
    );

    expect(gameLogs.saved).toHaveLength(0);
    expect(user.analysisCountThisMonth).toBe(3);
  });

  it("ユーザーが存在しなければ user_not_found", async () => {
    const { usecase } = makeUsecase({ analyzer: new FakeAnalyzer(validKifu) });
    const result = await usecase.execute({ userId: "missing", input: dummyInput });
    expect(result).toEqual({ ok: false, reason: "user_not_found" });
  });
});
