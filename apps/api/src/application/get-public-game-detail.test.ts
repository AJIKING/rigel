import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog, Visibility } from "../domain/kifu/game-log";
import { User, firstOfNextMonthUtc } from "../domain/user/user";
import {
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { GetPublicGameDetail } from "./get-public-game-detail.usecase";

const NOW = new Date("2026-06-29T00:00:00.000Z");
const game = (id: string, userId: string): Game => ({ id, userId, title: "卓", createdAt: NOW });
const log = (id: string, gameId: string, seq: number, vis: Visibility): GameLog => ({
  id,
  userId: "u1",
  gameId,
  seq,
  kifu: validKifu,
  visibility: vis,
  createdAt: NOW,
});
function owner(): User {
  return new User({
    id: "u1",
    googleSub: "g1",
    plan: "free",
    analysisCountThisMonth: 0,
    countResetAt: firstOfNextMonthUtc(NOW),
    handle: "kuro_2p",
    displayName: "kuro",
  });
}

describe("GetPublicGameDetail", () => {
  it("公開局のみと所有者の表示情報を返す", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "g1", 1, "public"));
    await gameLogs.save(log("l2", "g1", 2, "private")); // 非公開は除外
    await gameLogs.save(log("l3", "g1", 3, "public"));
    const users = new InMemoryUserRepository([owner()]);

    const detail = await new GetPublicGameDetail(games, gameLogs, users).execute("g1");

    expect(detail?.owner.handle).toBe("kuro_2p");
    expect(detail?.logs.map((l) => l.id)).toEqual(["l1", "l3"]);
  });

  it("公開局が無ければ null", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "g1", 1, "private"));
    const detail = await new GetPublicGameDetail(
      games,
      gameLogs,
      new InMemoryUserRepository([owner()]),
    ).execute("g1");
    expect(detail).toBeNull();
  });

  it("半荘が無ければ null", async () => {
    const detail = await new GetPublicGameDetail(
      new InMemoryGameRepository(),
      new InMemoryGameLogRepository(),
      new InMemoryUserRepository(),
    ).execute("missing");
    expect(detail).toBeNull();
  });
});
