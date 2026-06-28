import { describe, expect, it } from "vitest";
import type { GameLog, Visibility } from "../domain/kifu/game-log";
import { User, firstOfNextMonthUtc } from "../domain/user/user";
import { InMemoryGameLogRepository, InMemoryUserRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { SetKifuVisibility } from "./set-kifu-visibility.usecase";

const NOW = new Date("2026-06-28T00:00:00.000Z");

function user(plan: "free" | "next" | "pro"): User {
  return new User({
    id: "u1",
    googleSub: "g1",
    plan,
    analysisCountThisMonth: 0,
    countResetAt: firstOfNextMonthUtc(NOW),
  });
}

function log(id: string, userId: string, visibility: Visibility): GameLog {
  return { id, userId, gameId: null, seq: 1, kifu: validKifu, visibility, createdAt: NOW };
}

describe("SetKifuVisibility", () => {
  it("所有者は公開範囲を切り替えられる", async () => {
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1", "private"));
    const users = new InMemoryUserRepository([user("free")]);

    const result = await new SetKifuVisibility(gameLogs, users).execute({
      userId: "u1",
      logId: "l1",
      visibility: "public",
    });

    expect(result).toEqual({ ok: true });
    expect((await gameLogs.findById("l1"))?.visibility).toBe("public");
  });

  it("他人の牌譜は変更できない（not_found）", async () => {
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "owner", "private"));
    const users = new InMemoryUserRepository([user("free")]);

    const result = await new SetKifuVisibility(gameLogs, users).execute({
      userId: "u1",
      logId: "l1",
      visibility: "public",
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("無料は非公開上限(4)を超える private 化を拒否する", async () => {
    const gameLogs = new InMemoryGameLogRepository();
    for (let i = 0; i < 4; i++) await gameLogs.save(log(`p${i}`, "u1", "private"));
    await gameLogs.save(log("pub", "u1", "public")); // これを private にしたい
    const users = new InMemoryUserRepository([user("free")]);

    const result = await new SetKifuVisibility(gameLogs, users).execute({
      userId: "u1",
      logId: "pub",
      visibility: "private",
    });

    expect(result).toEqual({ ok: false, reason: "private_limit" });
    expect((await gameLogs.findById("pub"))?.visibility).toBe("public"); // 変わらない
  });

  it("有料は非公開を無制限に作れる", async () => {
    const gameLogs = new InMemoryGameLogRepository();
    for (let i = 0; i < 9; i++) await gameLogs.save(log(`p${i}`, "u1", "private"));
    await gameLogs.save(log("pub", "u1", "public"));
    const users = new InMemoryUserRepository([user("pro")]);

    const result = await new SetKifuVisibility(gameLogs, users).execute({
      userId: "u1",
      logId: "pub",
      visibility: "private",
    });

    expect(result).toEqual({ ok: true });
  });
});
