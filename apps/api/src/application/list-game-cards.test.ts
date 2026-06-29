import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog, Visibility } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository, InMemoryGameRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { ListMyGamesWithCounts, ListPublicGames } from "./list-game-cards.usecase";

const game = (id: string, userId: string, day: string): Game => ({
  id,
  userId,
  title: id,
  createdAt: new Date(`2026-06-${day}T00:00:00.000Z`),
});
const log = (id: string, userId: string, gameId: string, vis: Visibility): GameLog => ({
  id,
  userId,
  gameId,
  seq: 1,
  kifu: validKifu,
  visibility: vis,
  createdAt: new Date("2026-06-29T00:00:00.000Z"),
});

describe("ListMyGamesWithCounts", () => {
  it("自分の半荘を新しい順に、局数と公開数つきで返す", async () => {
    const games = new InMemoryGameRepository([
      game("g1", "u1", "20"),
      game("g2", "u1", "27"),
      game("g3", "u2", "28"), // 他人
    ]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1", "g1", "public"));
    await gameLogs.save(log("l2", "u1", "g1", "private"));
    await gameLogs.save(log("l3", "u1", "g2", "private"));

    const cards = await new ListMyGamesWithCounts(games, gameLogs).execute("u1");

    expect(cards.map((c) => c.id)).toEqual(["g2", "g1"]); // 新しい順
    const g1 = cards.find((c) => c.id === "g1")!;
    expect(g1.kyokuCount).toBe(2);
    expect(g1.publicCount).toBe(1);
  });
});

describe("ListPublicGames", () => {
  it("公開局を含む半荘を全ユーザーから新着順に、公開局数つきで返す", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "20"), game("g2", "u2", "27")]);
    const gameLogs = new InMemoryGameLogRepository();
    // g2 の公開局が新しい（createdAt 同一なので保存順＝listPublic の安定順に依存しないよう日付差で確認）。
    await gameLogs.save({ ...log("l1", "u1", "g1", "public"), createdAt: new Date("2026-06-20") });
    await gameLogs.save({ ...log("l2", "u2", "g2", "public"), createdAt: new Date("2026-06-27") });
    await gameLogs.save({ ...log("l3", "u1", "g1", "private"), createdAt: new Date("2026-06-21") });

    const cards = await new ListPublicGames(games, gameLogs).execute();

    expect(cards.map((c) => c.id)).toEqual(["g2", "g1"]); // 新着順
    const g1 = cards.find((c) => c.id === "g1")!;
    expect(g1.kyokuCount).toBe(1); // 公開局のみ数える（private は除外）
    expect(g1.ownerId).toBe("u1");
  });

  it("公開局が無ければ空", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "20")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1", "g1", "private"));
    const cards = await new ListPublicGames(games, gameLogs).execute();
    expect(cards).toEqual([]);
  });
});
