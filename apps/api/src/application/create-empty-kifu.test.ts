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

  it("手動作成は最終巡目ぶんの河と13枚の手牌をプレースホルダで並べる", async () => {
    const { uc, gameLogs } = make({ games: [game("g1", "u1")] });
    const result = await uc.execute({
      userId: "u1",
      gameId: "g1",
      cameraBottomSeat: "east",
      meta: { junme: 3 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const log = await gameLogs.findById(result.logId);
      expect(log?.visibility).toBe("private");
      expect(log?.seq).toBe(1);
      // 各席の手牌は 1m から13枚。
      expect(log?.kifu.seats.east.hand).toHaveLength(13);
      expect(log?.kifu.seats.east.hand[0]?.tile).toBe("1m");
      // 各席の河は最終巡目ぶん（3枚）を 1m,2m,3m の順で並べる。
      expect(log?.kifu.seats.north.river.map((d) => d.tile)).toEqual(["1m", "2m", "3m"]);
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

  it("1半荘30局を超えると game_full（有料=下書き無制限でも局数で頭打ち）", async () => {
    const { uc, gameLogs } = make({ games: [game("g1", "u1")], plan: "pro" });
    for (let i = 0; i < 30; i++)
      await uc.execute({ userId: "u1", gameId: "g1", cameraBottomSeat: "east" });
    const result = await uc.execute({ userId: "u1", gameId: "g1", cameraBottomSeat: "east" });
    expect(result).toEqual({ ok: false, reason: "game_full" });
    expect(gameLogs.saved).toHaveLength(30);
  });

  it("無料の下書き上限は半荘数(5)で判定。新規半荘の6つ目は draft_limit", async () => {
    const { uc, gameLogs } = make({ games: [] });
    for (let i = 0; i < 5; i++) await uc.execute({ userId: "u1", cameraBottomSeat: "east" });
    const result = await uc.execute({ userId: "u1", cameraBottomSeat: "east" });
    expect(result).toEqual({ ok: false, reason: "draft_limit" });
    expect(gameLogs.saved).toHaveLength(5);
    expect(gameLogs.saved.every((l) => l.status === "draft")).toBe(true);
  });

  it("上限でも既存半荘への局追加は通る（半荘数が増えないため）", async () => {
    const { uc, gameLogs } = make({ games: [] });
    const first = await uc.execute({ userId: "u1", cameraBottomSeat: "east" });
    if (!first.ok) throw new Error("setup failed");
    for (let i = 0; i < 4; i++) await uc.execute({ userId: "u1", cameraBottomSeat: "east" });
    // 下書き半荘は5つ（上限）。既存半荘 first.gameId への局追加はできる。
    const result = await uc.execute({
      userId: "u1",
      gameId: first.gameId,
      cameraBottomSeat: "east",
    });
    expect(result.ok).toBe(true);
    expect(gameLogs.saved).toHaveLength(6);
  });

  it("既存半荘に局を足すと公開範囲を引き継ぐ（半荘単位の公開設定）", async () => {
    const { uc, gameLogs } = make({ games: [] });
    const first = await uc.execute({ userId: "u1", cameraBottomSeat: "east" });
    if (!first.ok) throw new Error("setup failed");
    // 半荘を公開に切り替えた状態を作る。
    const log0 = await gameLogs.findById(first.logId);
    await gameLogs.save({ ...log0!, visibility: "public" });

    const second = await uc.execute({
      userId: "u1",
      gameId: first.gameId,
      cameraBottomSeat: "east",
    });
    if (!second.ok) throw new Error("add failed");
    expect((await gameLogs.findById(second.logId))?.visibility).toBe("public");
  });
});
