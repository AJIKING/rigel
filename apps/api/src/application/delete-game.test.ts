import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog } from "../domain/kifu/game-log";
import {
  InMemoryFavoriteRepository,
  InMemoryGameLogRepository,
  InMemoryGameRepository,
} from "../test-support/in-memory";
import { InMemoryAnalysisJobRepository } from "../test-support/in-memory-analysis";
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

    const favorites = new InMemoryFavoriteRepository();
    const result = await new DeleteGame(
      games,
      gameLogs,
      favorites,
      new InMemoryAnalysisJobRepository(),
    ).execute({
      userId: "u1",
      gameId: "g1",
    });
    expect(result).toEqual({ ok: true });
    expect(await games.findById("g1")).toBeNull();
    expect(await gameLogs.listByGame("g1")).toHaveLength(0);
    expect(await gameLogs.listByGame("g2")).toHaveLength(1);
  });

  it("半荘に付いた他人のお気に入りも一緒に消す（対象が消えたのに★が残らない）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1"), game("g2", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    const favorites = new InMemoryFavoriteRepository();
    const at = new Date("2026-07-05T00:00:00.000Z");
    await favorites.add({ userId: "u2", targetType: "game", targetId: "g1", createdAt: at });
    await favorites.add({ userId: "u3", targetType: "game", targetId: "g1", createdAt: at });
    await favorites.add({ userId: "u2", targetType: "game", targetId: "g2", createdAt: at });

    await new DeleteGame(games, gameLogs, favorites, new InMemoryAnalysisJobRepository()).execute({
      userId: "u1",
      gameId: "g1",
    });
    expect(await favorites.countsByTargets("game", ["g1", "g2"])).toEqual({ g2: 1 });
  });

  it("半荘の解析ジョブ行も一緒に消す（ジョブ履歴を残さない。processing はキャンセル扱い）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1"), game("g2", "u1")]);
    const jobs = new InMemoryAnalysisJobRepository();
    const at = new Date("2026-08-02T00:00:00.000Z");
    await jobs.create({ id: "j1", userId: "u1", gameId: "g1", now: at });
    await jobs.markFailed("j1", { reason: "analysis_failed", now: at });
    await jobs.create({ id: "j2", userId: "u1", gameId: "g1", now: at }); // processing のまま
    await jobs.create({ id: "j3", userId: "u1", gameId: "g2", now: at }); // 別半荘は残る

    await new DeleteGame(
      games,
      new InMemoryGameLogRepository(),
      new InMemoryFavoriteRepository(),
      jobs,
    ).execute({
      userId: "u1",
      gameId: "g1",
    });

    expect(await jobs.findForUser("j1", "u1")).toBeNull();
    expect(await jobs.findForUser("j2", "u1")).toBeNull();
    expect(await jobs.findForUser("j3", "u1")).not.toBeNull();
  });

  it("他人の半荘は消せない（not_found として扱い、存在も漏らさない）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    const result = await new DeleteGame(
      games,
      gameLogs,
      new InMemoryFavoriteRepository(),
      new InMemoryAnalysisJobRepository(),
    ).execute({
      userId: "attacker",
      gameId: "g1",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(await games.findById("g1")).not.toBeNull();
  });

  it("存在しない半荘は not_found", async () => {
    const games = new InMemoryGameRepository([]);
    const gameLogs = new InMemoryGameLogRepository();
    const result = await new DeleteGame(
      games,
      gameLogs,
      new InMemoryFavoriteRepository(),
      new InMemoryAnalysisJobRepository(),
    ).execute({
      userId: "u1",
      gameId: "gx",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
