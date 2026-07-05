import { RULE_PRESETS } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog } from "../domain/kifu/game-log";
import { InMemoryGameLogRepository, InMemoryGameRepository } from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { UpdateGameRules } from "./update-game-rules.usecase";

const game = (id: string, userId: string): Game => ({
  id,
  userId,
  title: id,
  createdAt: new Date("2026-07-05T00:00:00.000Z"),
});
const log = (id: string, gameId: string): GameLog => ({
  id,
  userId: "u1",
  gameId,
  seq: 1,
  kifu: validKifu,
  visibility: "private",
  status: "complete",
  createdAt: new Date("2026-07-05T00:00:00.000Z"),
});

describe("UpdateGameRules（半荘のルールを全局に反映）", () => {
  it("所有者は半荘配下の全局に同じルールを書き込む", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "g1"));
    await gameLogs.save(log("l2", "g1"));

    const result = await new UpdateGameRules(games, gameLogs).execute({
      userId: "u1",
      gameId: "g1",
      rules: RULE_PRESETS.tenhou,
    });
    expect(result).toEqual({ ok: true });
    const logs = await gameLogs.listByGame("g1");
    expect(logs.every((l) => l.kifu.rules.ryukyoku === true)).toBe(true); // 天鳳=途中流局あり
  });

  it("他人の半荘は変更できない（not_found）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "g1"));
    const result = await new UpdateGameRules(games, gameLogs).execute({
      userId: "attacker",
      gameId: "g1",
      rules: RULE_PRESETS.tenhou,
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
