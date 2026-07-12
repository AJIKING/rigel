import { PlayersSchema } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository, InMemoryGameRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { UpdateGamePlayers } from "./update-game-players.usecase";

const game = (id: string, userId: string): Game => ({
  id,
  userId,
  title: id,
  createdAt: new Date("2026-07-12T00:00:00.000Z"),
});
const log = (id: string, gameId: string): GameLog => ({
  id,
  userId: "u1",
  gameId,
  seq: 1,
  kifu: validKifu,
  visibility: "private",
  status: "complete",
  createdAt: new Date("2026-07-12T00:00:00.000Z"),
});

const players = PlayersSchema.parse({
  east: { name: "多井", points: 120.3 },
  south: { name: "園田", points: -45.7 },
  west: {},
  north: {},
});

describe("UpdateGamePlayers（半荘の選手情報を全局に反映）", () => {
  it("所有者は半荘配下の全局に同じ選手情報を書き込む", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "g1"));
    await gameLogs.save(log("l2", "g1"));

    const result = await new UpdateGamePlayers(games, gameLogs).execute({
      userId: "u1",
      gameId: "g1",
      players,
    });
    expect(result).toEqual({ ok: true });
    const logs = await gameLogs.listByGame("g1");
    expect(logs.every((l) => l.kifu.players?.east.name === "多井")).toBe(true);
    expect(logs.every((l) => l.kifu.players?.south.points === -45.7)).toBe(true);
  });

  it("null で選手情報を消せる（記録しない対局へ戻す）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save({ ...log("l1", "g1"), kifu: { ...validKifu, players } });

    const result = await new UpdateGamePlayers(games, gameLogs).execute({
      userId: "u1",
      gameId: "g1",
      players: null,
    });
    expect(result).toEqual({ ok: true });
    const logs = await gameLogs.listByGame("g1");
    expect(logs[0]?.kifu.players).toBeNull();
  });

  it("他人の半荘は変更できない（not_found）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "g1"));
    const result = await new UpdateGamePlayers(games, gameLogs).execute({
      userId: "attacker",
      gameId: "g1",
      players,
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
