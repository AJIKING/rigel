import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import { InMemoryGameRepository } from "../test-support/in-memory";
import { UpdateGame } from "./update-game.usecase";

const game = (id: string, userId: string, title: string): Game => ({
  id,
  userId,
  title,
  createdAt: new Date("2026-07-05T00:00:00.000Z"),
});

describe("UpdateGame（半荘名の変更）", () => {
  it("所有者はタイトルを変更できる（前後空白は除去）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "旧タイトル")]);
    const result = await new UpdateGame(games).execute({
      userId: "u1",
      gameId: "g1",
      title: "  友人戦 6/28  ",
    });
    expect(result).toEqual({ ok: true });
    expect((await games.findById("g1"))?.title).toBe("友人戦 6/28");
  });

  it("他人の半荘は変更できない（not_found・存在も漏らさない）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "旧")]);
    const result = await new UpdateGame(games).execute({
      userId: "attacker",
      gameId: "g1",
      title: "乗っ取り",
    });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect((await games.findById("g1"))?.title).toBe("旧");
  });

  it("80字を超えるタイトルは拒否する", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "旧")]);
    const result = await new UpdateGame(games).execute({
      userId: "u1",
      gameId: "g1",
      title: "あ".repeat(81),
    });
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect((await games.findById("g1"))?.title).toBe("旧");
  });

  it("存在しない半荘は not_found", async () => {
    const games = new InMemoryGameRepository([]);
    const result = await new UpdateGame(games).execute({ userId: "u1", gameId: "gx", title: "a" });
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});
