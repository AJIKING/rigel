import { describe, expect, it } from "vitest";
import type { GameLog } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { UpdateKifu } from "./update-kifu.usecase";

const NOW = new Date("2026-06-28T00:00:00.000Z");
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

function make(logs: GameLog[]) {
  const gameLogs = new InMemoryGameLogRepository();
  for (const l of logs) void gameLogs.save(l);
  return { uc: new UpdateKifu(gameLogs), gameLogs };
}

const edited = { ...validKifu, readingNotes: "直した" };

describe("UpdateKifu", () => {
  it("所有者は牌譜を上書き保存できる（seq 省略は現状維持・status は変えない）", async () => {
    const { uc, gameLogs } = make([log("l1", "u1", { status: "draft" })]);
    const result = await uc.execute({ userId: "u1", logId: "l1", kifu: edited });
    expect(result).toEqual({ ok: true });
    const saved = await gameLogs.findById("l1");
    expect(saved?.kifu.readingNotes).toBe("直した");
    expect(saved?.seq).toBe(1);
    expect(saved?.status).toBe("draft"); // 下書き/編集済は半荘単位（ここでは触らない）
  });

  it("seq を渡すと局順を変更できる（東一局→南三局=7 など自由な局に）", async () => {
    const { uc, gameLogs } = make([log("l1", "u1")]);
    const result = await uc.execute({ userId: "u1", logId: "l1", kifu: edited, seq: 7 });
    expect(result).toEqual({ ok: true });
    expect((await gameLogs.findById("l1"))?.seq).toBe(7);
  });

  it("seq の範囲外（0 以下・17 以上・小数）は invalid_seq", async () => {
    const { uc } = make([log("l1", "u1")]);
    for (const seq of [0, 17, 1.5]) {
      const result = await uc.execute({ userId: "u1", logId: "l1", kifu: edited, seq });
      expect(result).toEqual({ ok: false, reason: "invalid_seq" });
    }
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
});
