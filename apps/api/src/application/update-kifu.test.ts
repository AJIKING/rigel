import { describe, expect, it } from "vitest";
import type { GameLog } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { UpdateKifu } from "./update-kifu.usecase";

const NOW = new Date("2026-06-28T00:00:00.000Z");
const log = (id: string, userId: string): GameLog => ({
  id,
  userId,
  gameId: "g1",
  seq: 1,
  kifu: validKifu,
  createdAt: NOW,
});

const edited = { ...validKifu, readingNotes: "直した" };

describe("UpdateKifu", () => {
  it("所有者は牌譜を上書き保存できる", async () => {
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1"));

    const result = await new UpdateKifu(gameLogs).execute({
      userId: "u1",
      logId: "l1",
      kifu: edited,
    });

    expect(result).toEqual({ ok: true });
    expect((await gameLogs.findById("l1"))?.kifu.readingNotes).toBe("直した");
  });

  it("他人の牌譜は not_found（伏せる）", async () => {
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "owner"));

    const result = await new UpdateKifu(gameLogs).execute({
      userId: "intruder",
      logId: "l1",
      kifu: edited,
    });

    expect(result).toEqual({ ok: false, reason: "not_found" });
    // 変更されていない
    expect((await gameLogs.findById("l1"))?.kifu.readingNotes).toBe(validKifu.readingNotes);
  });

  it("存在しない牌譜は not_found", async () => {
    const result = await new UpdateKifu(new InMemoryGameLogRepository()).execute({
      userId: "u1",
      logId: "missing",
      kifu: edited,
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
