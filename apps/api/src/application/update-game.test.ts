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

  // 対局日（createdAt）の変更（[決定] 2026-07-29 オーナー: 半荘画面から日付を直せるように。
  // 写真からの作成日=対局日とは限らないため、所有者が後から補正できる。一覧の並びにも使われる）。
  it("対局日（createdAt）を変更できる（YYYY-MM-DD）。タイトルは維持", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "友人戦")]);
    const result = await new UpdateGame(games).execute({
      userId: "u1",
      gameId: "g1",
      createdAt: "2026-06-28",
    });
    expect(result).toEqual({ ok: true });
    const saved = await games.findById("g1");
    expect(saved?.createdAt.toISOString()).toBe("2026-06-28T00:00:00.000Z");
    expect(saved?.title).toBe("友人戦");
  });

  it("タイトルと対局日を同時に変更できる", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "旧")]);
    const result = await new UpdateGame(games).execute({
      userId: "u1",
      gameId: "g1",
      title: "新",
      createdAt: "2026-01-02",
    });
    expect(result).toEqual({ ok: true });
    const saved = await games.findById("g1");
    expect(saved?.title).toBe("新");
    expect(saved?.createdAt.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("不正な日付・範囲外の日付は拒否する（invalid）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "旧")]);
    const run = (createdAt: string) =>
      new UpdateGame(games).execute({ userId: "u1", gameId: "g1", createdAt });
    expect(await run("not-a-date")).toEqual({ ok: false, reason: "invalid" });
    expect(await run("1999-12-31")).toEqual({ ok: false, reason: "invalid" }); // 2000年より前
    expect(await run("2999-01-01")).toEqual({ ok: false, reason: "invalid" }); // 未来すぎる
    expect((await games.findById("g1"))?.createdAt.toISOString()).toBe("2026-07-05T00:00:00.000Z");
  });

  it("タイトルも対局日も無い更新は invalid", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "旧")]);
    const result = await new UpdateGame(games).execute({ userId: "u1", gameId: "g1" });
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});
