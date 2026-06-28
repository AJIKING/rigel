import type { Kifu } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { AnalysisInput, Analyzer } from "../domain/kifu/analyzer";
import { User, firstOfNextMonthUtc } from "../domain/user/user";
import { fakeImage } from "../test-support/image";
import {
  InMemoryAnalysisStore,
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { AnalyzeAndSaveKifu } from "./analyze-and-save-kifu.usecase";

const NOW = new Date("2026-06-28T00:00:00.000Z");

const dummyInput: AnalysisInput = {
  riverImage: fakeImage(),
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

function makeUsecase(opts: { user?: User; analyzer: Analyzer; games?: Game[] }) {
  const users = new InMemoryUserRepository(opts.user ? [opts.user] : []);
  const gameLogs = new InMemoryGameLogRepository();
  const games = new InMemoryGameRepository(opts.games ?? []);
  const store = new InMemoryAnalysisStore(games, gameLogs, users);
  let n = 0;
  const usecase = new AnalyzeAndSaveKifu({
    users,
    games,
    gameLogs,
    analyzer: opts.analyzer,
    store,
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
  return { usecase, users, gameLogs, games };
}

describe("AnalyzeAndSaveKifu", () => {
  it("成功すると新規半荘に局として保存され、カウントが +1 される", async () => {
    const user = freeUser(0);
    const { usecase, gameLogs, games } = makeUsecase({
      user,
      analyzer: new FakeAnalyzer(validKifu),
    });

    const result = await usecase.execute({ userId: "u1", input: dummyInput });

    expect(result.ok).toBe(true);
    expect(await games.listByUser("u1")).toHaveLength(1); // 新規半荘を作る
    expect(gameLogs.saved).toHaveLength(1);
    const log = gameLogs.saved[0];
    expect(log?.gameId).not.toBeNull();
    expect(log?.seq).toBe(1);
    expect(log?.kifu).toEqual(validKifu);
    expect(user.analysisCountThisMonth).toBe(1);
  });

  it("gameId 指定で既存半荘に追加すると seq が増える", async () => {
    const user = freeUser(0);
    const game: Game = { id: "g1", userId: "u1", title: "", createdAt: NOW };
    const { usecase, gameLogs, games } = makeUsecase({
      user,
      analyzer: new FakeAnalyzer(validKifu),
      games: [game],
    });
    await gameLogs.save({
      id: "pre",
      userId: "u1",
      gameId: "g1",
      seq: 1,
      kifu: validKifu,
      createdAt: NOW,
    });

    const result = await usecase.execute({ userId: "u1", input: dummyInput, gameId: "g1" });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.gameLog.seq).toBe(2);
    expect(await games.listByUser("u1")).toHaveLength(1); // 半荘は増えない
  });

  it("他人の半荘を指定したら game_not_found（解析しない）", async () => {
    const user = freeUser(0);
    const game: Game = { id: "g1", userId: "someone-else", title: "", createdAt: NOW };
    const analyzer = new FakeAnalyzer(validKifu);
    const { usecase, gameLogs } = makeUsecase({ user, analyzer, games: [game] });

    const result = await usecase.execute({ userId: "u1", input: dummyInput, gameId: "g1" });

    expect(result).toEqual({ ok: false, reason: "game_not_found" });
    expect(analyzer.calls).toBe(0);
    expect(gameLogs.saved).toHaveLength(0);
    expect(user.analysisCountThisMonth).toBe(0);
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
