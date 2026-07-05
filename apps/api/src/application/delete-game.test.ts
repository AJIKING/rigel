import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository, InMemoryGameRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { DeleteGame } from "./delete-game.usecase";

const game = (id: string, userId: string): Game => ({
  id,
  userId,
  title: id,
  createdAt: new Date("2026-07-05T00:00:00.000Z"),
});
const log = (id: string, userId: string, gameId: string): GameLog => ({
  id,
  userId,
  gameId,
  seq: 1,
  kifu: validKifu,
  visibility: "private",
  status: "complete",
  createdAt: new Date("2026-07-05T00:00:00.000Z"),
});

describe("DeleteGame（半荘の削除）", () => {
  it("所有者は半荘と配下の全局を削除できる", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1"), game("g2", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1", "g1"));
    await gameLogs.save(log("l2", "u1", "g1"));
    await gameLogs.save(log("l3", "u1", "g2")); // 別半荘は残る

    const result = await new DeleteGame(games, gameLogs).execute({ userId: "u1", gameId: "g1" });
    expect(result).toEqual({ ok: true });
    expect(await games.findById("g1")).toBeNull();
    expect(await gameLogs.listByGame("g1")).toHaveLength(0);
    expect(await gameLogs.listByGame("g2")).toHaveLength(1);
  });

  it("他人の半荘は消せない（not_found として扱い、存在も漏らさない）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    const result = await new DeleteGame(games, gameLogs).execute({
      userId: "attacker",
      gameId: "g1",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(await games.findById("g1")).not.toBeNull();
  });

  it("存在しない半荘は not_found", async () => {
    const games = new InMemoryGameRepository([]);
    const gameLogs = new InMemoryGameLogRepository();
    const result = await new DeleteGame(games, gameLogs).execute({ userId: "u1", gameId: "gx" });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
