import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository, InMemoryGameRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { GetGameWithLogs } from "./get-game-with-logs.usecase";
import { ListGames } from "./list-games.usecase";

const NOW = new Date("2026-06-28T00:00:00.000Z");
const game = (id: string, userId: string): Game => ({ id, userId, title: "", createdAt: NOW });
const log = (id: string, gameId: string, seq: number): GameLog => ({
  id,
  userId: "u1",
  gameId,
  seq,
  kifu: validKifu,
  createdAt: NOW,
});

describe("ListGames", () => {
  it("ログインユーザーの半荘だけ返す", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1"), game("g2", "u2")]);
    const result = await new ListGames(games).execute("u1");
    expect(result.map((g) => g.id)).toEqual(["g1"]);
  });
});

describe("GetGameWithLogs", () => {
  it("半荘とその局を seq 順で返す", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const logs = new InMemoryGameLogRepository();
    await logs.save(log("l2", "g1", 2));
    await logs.save(log("l1", "g1", 1));
    await logs.save(log("other", "g2", 1));

    const detail = await new GetGameWithLogs(games, logs).execute("g1");
    expect(detail?.game.id).toBe("g1");
    expect(detail?.logs.map((l) => l.id)).toEqual(["l1", "l2"]);
  });

  it("存在しない半荘は null", async () => {
    const detail = await new GetGameWithLogs(
      new InMemoryGameRepository(),
      new InMemoryGameLogRepository(),
    ).execute("nope");
    expect(detail).toBeNull();
  });
});
