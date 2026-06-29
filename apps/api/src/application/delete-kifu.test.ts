import { describe, expect, it } from "vitest";
import type { GameLog } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { DeleteKifu } from "./delete-kifu.usecase";

const NOW = new Date("2026-06-29T00:00:00.000Z");
const log = (id: string, userId: string): GameLog => ({
  id,
  userId,
  gameId: "g1",
  seq: 1,
  kifu: validKifu,
  visibility: "private",
  createdAt: NOW,
});

describe("DeleteKifu", () => {
  it("所有者は局を削除できる", async () => {
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1"));
    const result = await new DeleteKifu(gameLogs).execute({ userId: "u1", logId: "l1" });
    expect(result).toEqual({ ok: true });
    expect(await gameLogs.findById("l1")).toBeNull();
  });

  it("他人の局は削除できない（not_found）", async () => {
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "owner"));
    const result = await new DeleteKifu(gameLogs).execute({ userId: "u1", logId: "l1" });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(await gameLogs.findById("l1")).not.toBeNull();
  });
});
