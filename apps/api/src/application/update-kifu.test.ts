import { describe, expect, it } from "vitest";
import type { GameLog } from "../domain/kifu/game-log";
import { User, firstOfNextMonthUtc, type Plan } from "../domain/user/user";
import { InMemoryGameLogRepository, InMemoryUserRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { UpdateKifu } from "./update-kifu.usecase";

const NOW = new Date("2026-06-28T00:00:00.000Z");
function user(plan: Plan): User {
  return new User({
    id: "u1",
    googleSub: "g1",
    plan,
    analysisCountThisMonth: 0,
    countResetAt: firstOfNextMonthUtc(NOW),
  });
}
const log = (id: string, userId: string, over: Partial<GameLog> = {}): GameLog => ({
  id,
  userId,
  gameId: "g1",
  seq: 1,
  kifu: validKifu,
  visibility: "private",
  status: "complete",
  createdAt: NOW,
  ...over,
});

function make(logs: GameLog[], plan: Plan = "free") {
  const gameLogs = new InMemoryGameLogRepository();
  for (const l of logs) void gameLogs.save(l);
  const uc = new UpdateKifu(gameLogs, new InMemoryUserRepository([user(plan)]));
  return { uc, gameLogs };
}

const edited = { ...validKifu, readingNotes: "直した" };

describe("UpdateKifu", () => {
  it("所有者は牌譜を上書き保存できる（status 省略は現状維持）", async () => {
    const { uc, gameLogs } = make([log("l1", "u1")]);
    const result = await uc.execute({ userId: "u1", logId: "l1", kifu: edited });
    expect(result).toEqual({ ok: true });
    const saved = await gameLogs.findById("l1");
    expect(saved?.kifu.readingNotes).toBe("直した");
    expect(saved?.status).toBe("complete");
  });

  it("status を渡すと保存する（complete→draft）", async () => {
    const { uc, gameLogs } = make([log("l1", "u1")]);
    await uc.execute({ userId: "u1", logId: "l1", kifu: edited, status: "draft" });
    expect((await gameLogs.findById("l1"))?.status).toBe("draft");
  });

  it("他人の牌譜は not_found（伏せる）", async () => {
    const { uc, gameLogs } = make([log("l1", "owner")]);
    const result = await uc.execute({ userId: "intruder", logId: "l1", kifu: edited });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect((await gameLogs.findById("l1"))?.kifu.readingNotes).toBe(validKifu.readingNotes);
  });

  it("存在しない牌譜は not_found", async () => {
    const { uc } = make([]);
    const result = await uc.execute({ userId: "u1", logId: "missing", kifu: edited });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("無料: 下書き半荘が上限(5)のとき、別半荘の complete→draft は draft_limit", async () => {
    // 上限は半荘数で数える。下書きを含む半荘が5つある状態で、6つ目の半荘を下書き化しようとする。
    const drafts = Array.from({ length: 5 }, (_, i) =>
      log(`d${i}`, "u1", { gameId: `gd${i}`, status: "draft" }),
    );
    const { uc } = make([log("l1", "u1", { gameId: "gx", status: "complete" }), ...drafts]);
    const result = await uc.execute({ userId: "u1", logId: "l1", kifu: edited, status: "draft" });
    expect(result).toEqual({ ok: false, reason: "draft_limit" });
  });

  it("無料: 上限でも同じ半荘内の complete→draft は通る（半荘数が増えないため）", async () => {
    // gd0 は既に下書きを含む半荘。その中の complete 局を draft にしても半荘数は変わらない。
    const drafts = Array.from({ length: 5 }, (_, i) =>
      log(`d${i}`, "u1", { gameId: `gd${i}`, status: "draft" }),
    );
    const { uc } = make([log("l1", "u1", { gameId: "gd0", status: "complete" }), ...drafts]);
    const result = await uc.execute({ userId: "u1", logId: "l1", kifu: edited, status: "draft" });
    expect(result).toEqual({ ok: true });
  });

  it("無料: 非公開半荘が上限(5)のとき、別半荘の draft→complete(private) は private_limit", async () => {
    const privs = Array.from({ length: 5 }, (_, i) =>
      log(`p${i}`, "u1", { gameId: `gp${i}`, visibility: "private", status: "complete" }),
    );
    const { uc } = make([
      log("l1", "u1", { gameId: "gx", visibility: "private", status: "draft" }),
      ...privs,
    ]);
    const result = await uc.execute({
      userId: "u1",
      logId: "l1",
      kifu: edited,
      status: "complete",
    });
    expect(result).toEqual({ ok: false, reason: "private_limit" });
  });

  it("有料は下書き無制限（complete→draft でも通る）", async () => {
    const drafts = Array.from({ length: 8 }, (_, i) => log(`d${i}`, "u1", { status: "draft" }));
    const { uc } = make([log("l1", "u1", { status: "complete" }), ...drafts], "pro");
    const result = await uc.execute({ userId: "u1", logId: "l1", kifu: edited, status: "draft" });
    expect(result).toEqual({ ok: true });
  });
});
