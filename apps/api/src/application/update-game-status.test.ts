import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog, KifuStatus, Visibility } from "../domain/kifu/game-log";
import { User, firstOfNextMonthUtc, type Plan } from "../domain/user/user";
import {
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { UpdateGameStatus } from "./update-game-status.usecase";

const NOW = new Date("2026-07-06T00:00:00.000Z");
const game = (id: string): Game => ({ id, userId: "u1", title: id, createdAt: NOW });
const log = (
  id: string,
  gameId: string,
  status: KifuStatus,
  vis: Visibility = "private",
): GameLog => ({
  id,
  userId: "u1",
  gameId,
  seq: 1,
  kifu: validKifu,
  visibility: vis,
  status,
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
  return { uc: new UpdateGameStatus(gamesRepo, gameLogs, users), gameLogs };
}

describe("UpdateGameStatus（半荘の下書き/編集済を全局に反映）", () => {
  it("所有者は半荘配下の全局の状態を一括で変更できる", async () => {
    const { uc, gameLogs } = make(
      [game("g1")],
      [log("l1", "g1", "draft"), log("l2", "g1", "draft")],
    );
    const result = await uc.execute({ userId: "u1", gameId: "g1", status: "complete" });
    expect(result).toEqual({ ok: true });
    const logs = await gameLogs.listByGame("g1");
    expect(logs.every((l) => l.status === "complete")).toBe(true);
  });

  it("他人の半荘は変更できない（not_found）", async () => {
    const { uc } = make([game("g1")], [log("l1", "g1", "draft")]);
    const result = await uc.execute({ userId: "attacker", gameId: "g1", status: "complete" });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("無料: 下書き半荘が上限(5)のとき、別半荘の下書き化は draft_limit", async () => {
    const games = [game("gx"), ...Array.from({ length: 5 }, (_, i) => game(`g${i}`))];
    const logs = [
      log("lx", "gx", "complete"),
      ...Array.from({ length: 5 }, (_, i) => log(`l${i}`, `g${i}`, "draft")),
    ];
    const { uc } = make(games, logs);
    const result = await uc.execute({ userId: "u1", gameId: "gx", status: "draft" });
    expect(result).toEqual({ ok: false, reason: "draft_limit" });
  });

  it("無料: 非公開半荘が上限(5)のとき、非公開半荘の編集済化は private_limit", async () => {
    const games = [game("gx"), ...Array.from({ length: 5 }, (_, i) => game(`g${i}`))];
    const logs = [
      log("lx", "gx", "draft", "private"),
      ...Array.from({ length: 5 }, (_, i) => log(`l${i}`, `g${i}`, "complete", "private")),
    ];
    const { uc } = make(games, logs);
    const result = await uc.execute({ userId: "u1", gameId: "gx", status: "complete" });
    expect(result).toEqual({ ok: false, reason: "private_limit" });
  });

  it("公開半荘の編集済化は非公開上限に関係なく通る", async () => {
    const games = [game("gx"), ...Array.from({ length: 5 }, (_, i) => game(`g${i}`))];
    const logs = [
      log("lx", "gx", "draft", "public"),
      ...Array.from({ length: 5 }, (_, i) => log(`l${i}`, `g${i}`, "complete", "private")),
    ];
    const { uc } = make(games, logs);
    const result = await uc.execute({ userId: "u1", gameId: "gx", status: "complete" });
    expect(result).toEqual({ ok: true });
  });
});
