import type { Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { AnalysisInput, Analyzer } from "../domain/kifu/analyzer";
import { User, firstOfNextMonthUtc } from "../domain/user/user";
import { InMemoryGameLogRepository, InMemoryUserRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { AnalyzeAndSaveKifu } from "./analyze-and-save-kifu.usecase";

const NOW = new Date("2026-06-28T00:00:00.000Z");

const dummyInput: AnalysisInput = {
  riverImage: { data: new ArrayBuffer(0), mimeType: "image/jpeg" },
  cameraBottomSeat: "east",
};

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
