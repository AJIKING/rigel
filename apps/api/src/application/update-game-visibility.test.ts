import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog, Visibility } from "../domain/kifu/game-log";
import { User, firstOfNextMonthUtc, type Plan } from "../domain/user/user";
import {
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { UpdateGameVisibility } from "./update-game-visibility.usecase";

const NOW = new Date("2026-07-05T00:00:00.000Z");
const game = (id: string, userId: string): Game => ({ id, userId, title: id, createdAt: NOW });
const log = (id: string, gameId: string, vis: Visibility): GameLog => ({
  id,
  userId: "u1",
  gameId,
  seq: 1,
  kifu: validKifu,
  visibility: vis,
  status: "complete",
  createdAt: NOW,
});
function user(plan: Plan): User {
  return new User({
    id: "u1",
    googleSub: "g1",
    plan,
    analysisCountThisMonth: 0,
    countResetAt: firstOfNextMonthUtc(NOW),
  });
}

function make(games: Game[], logs: GameLog[], plan: Plan = "free") {
  const gamesRepo = new InMemoryGameRepository(games);
  const gameLogs = new InMemoryGameLogRepository();
  for (const l of logs) void gameLogs.save(l);
  const users = new InMemoryUserRepository([user(plan)]);
  return { uc: new UpdateGameVisibility(gamesRepo, gameLogs, users), gameLogs };
}

describe("UpdateGameVisibility（半荘の公開範囲を全局に反映）", () => {
  it("所有者は半荘配下の全局の公開範囲を一括で変更できる", async () => {
    const { uc, gameLogs } = make(
      [game("g1", "u1")],
      [log("l1", "g1", "private"), log("l2", "g1", "private")],
    );
    const result = await uc.execute({ userId: "u1", gameId: "g1", visibility: "public" });
    expect(result).toEqual({ ok: true });
    const logs = await gameLogs.listByGame("g1");
    expect(logs.every((l) => l.visibility === "public")).toBe(true);
  });

  it("他人の半荘は変更できない（not_found）", async () => {
    const { uc, gameLogs } = make([game("g1", "u1")], [log("l1", "g1", "private")]);
    const result = await uc.execute({
      userId: "attacker",
      gameId: "g1",
      visibility: "public",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect((await gameLogs.listByGame("g1"))[0]?.visibility).toBe("private");
  });

  it("無料: 非公開半荘が上限(5)のとき、公開半荘の private 化は private_limit", async () => {
    const games = [game("gx", "u1"), ...Array.from({ length: 5 }, (_, i) => game(`g${i}`, "u1"))];
    const logs = [
      log("lx", "gx", "public"),
      ...Array.from({ length: 5 }, (_, i) => log(`l${i}`, `g${i}`, "private")),
    ];
    const { uc, gameLogs } = make(games, logs);
    const result = await uc.execute({ userId: "u1", gameId: "gx", visibility: "private" });
    expect(result).toEqual({ ok: false, reason: "private_limit" });
    expect((await gameLogs.listByGame("gx"))[0]?.visibility).toBe("public"); // 変わらない
  });

  it("有料は非公開を無制限に作れる（public → private も通る）", async () => {
    const games = [game("gx", "u1"), ...Array.from({ length: 6 }, (_, i) => game(`g${i}`, "u1"))];
    const logs = [
      log("lx", "gx", "public"),
      ...Array.from({ length: 6 }, (_, i) => log(`l${i}`, `g${i}`, "private")),
    ];
    const { uc } = make(games, logs, "pro");
    const result = await uc.execute({ userId: "u1", gameId: "gx", visibility: "private" });
    expect(result).toEqual({ ok: true });
  });
});
