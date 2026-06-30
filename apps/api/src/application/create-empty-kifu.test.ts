import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import { User, firstOfNextMonthUtc } from "../domain/user/user";
import {
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { CreateEmptyKifu } from "./create-empty-kifu.usecase";

const NOW = new Date("2026-06-29T00:00:00.000Z");
const game = (id: string, userId: string): Game => ({ id, userId, title: "", createdAt: NOW });
function user(plan: "free" | "next" | "pro"): User {
  return new User({
    id: "u1",
    googleSub: "g1",
    plan,
    analysisCountThisMonth: 0,
    countResetAt: firstOfNextMonthUtc(NOW),
  });
}

function make(opts: { games: Game[]; plan?: "free" | "next" | "pro" }) {
  const games = new InMemoryGameRepository(opts.games);
  const gameLogs = new InMemoryGameLogRepository();
  const users = new InMemoryUserRepository([user(opts.plan ?? "free")]);
  let n = 0;
  const uc = new CreateEmptyKifu({
    games,
    gameLogs,
    users,
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
  return { uc, gameLogs, games };
}

describe("CreateEmptyKifu", () => {
  it("gameId 無しなら新しい半荘を作って初局(seq=1)を入れ、gameId を返す", async () => {
    const { uc, gameLogs, games } = make({ games: [] });
    const result = await uc.execute({ userId: "u1", cameraBottomSeat: "south" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.gameId).toBeTruthy();
      expect(await games.findById(result.gameId)).toBeTruthy();
      const log = await gameLogs.findById(result.logId);
      expect(log?.gameId).toBe(result.gameId);
      expect(log?.seq).toBe(1);
      expect(log?.kifu.cameraBottomSeat).toBe("south");
    }
  });

  it("空の局を追加して logId を返す", async () => {
    const { uc, gameLogs } = make({ games: [game("g1", "u1")] });
    const result = await uc.execute({ userId: "u1", gameId: "g1", cameraBottomSeat: "east" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const log = await gameLogs.findById(result.logId);
      expect(log?.visibility).toBe("private");
      expect(log?.kifu.seats.east.hand).toEqual([]);
      expect(log?.seq).toBe(1);
    }
  });

  it("局メタ(本場/供託/ドラ/最終巡目)を渡すと Kifu に焼き込む（記録のみ）", async () => {
    const { uc, gameLogs } = make({ games: [game("g1", "u1")] });
    const result = await uc.execute({
      userId: "u1",
      gameId: "g1",
      cameraBottomSeat: "east",
      meta: { honba: 2, kyotaku: 1, dora: "3p", junme: 9 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const log = await gameLogs.findById(result.logId);
      expect(log?.kifu.meta).toMatchObject({ honba: 2, kyotaku: 1, dora: "3p", junme: 9 });
    }
  });

  it("局メタ省略時は既定(0/0/null/1)で作る", async () => {
    const { uc, gameLogs } = make({ games: [game("g1", "u1")] });
    const result = await uc.execute({ userId: "u1", gameId: "g1", cameraBottomSeat: "east" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const log = await gameLogs.findById(result.logId);
      expect(log?.kifu.meta).toMatchObject({ honba: 0, kyotaku: 0, dora: null, junme: 1 });
    }
  });

  it("他人の半荘には追加できない（game_not_found）", async () => {
    const { uc } = make({ games: [game("g1", "someone")] });
    const result = await uc.execute({ userId: "u1", gameId: "g1", cameraBottomSeat: "east" });
    expect(result).toEqual({ ok: false, reason: "game_not_found" });
  });

  it("無料の非公開上限(4)を超えると private_limit", async () => {
    const { uc, gameLogs } = make({ games: [game("g1", "u1")] });
    for (let i = 0; i < 4; i++)
      await uc.execute({ userId: "u1", gameId: "g1", cameraBottomSeat: "east" });
    const result = await uc.execute({ userId: "u1", gameId: "g1", cameraBottomSeat: "east" });
    expect(result).toEqual({ ok: false, reason: "private_limit" });
    expect(gameLogs.saved).toHaveLength(4);
  });
});
