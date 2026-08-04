import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog, Visibility } from "../domain/kifu/game-log";
import { User, firstOfNextMonthUtc } from "../domain/user/user";
import {
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { InMemoryAnalysisJobRepository } from "../test-support/in-memory-analysis";
import { validKifu } from "../test-support/kifu";
import { ListMyGamesWithCounts, ListPublicGames } from "./list-game-cards.usecase";

const NOW = new Date("2026-06-29T00:00:00.000Z");
function mkUser(id: string, handle: string | null): User {
  return new User({
    id,
    googleSub: `sub-${id}`,
    plan: "free",
    analysisCountThisMonth: 0,
    countResetAt: firstOfNextMonthUtc(NOW),
    handle,
    displayName: handle ?? "名無し",
  });
}

const game = (id: string, userId: string, day: string): Game => ({
  id,
  userId,
  title: id,
  createdAt: new Date(`2026-06-${day}T00:00:00.000Z`),
});
const log = (id: string, userId: string, gameId: string, vis: Visibility): GameLog => ({
  id,
  userId,
  gameId,
  seq: 1,
  kifu: validKifu,
  visibility: vis,
  status: "complete",
  createdAt: new Date("2026-06-29T00:00:00.000Z"),
});

describe("ListMyGamesWithCounts", () => {
  it("自分の半荘を新しい順に、局数と公開数つきで返す", async () => {
    const games = new InMemoryGameRepository([
      game("g1", "u1", "20"),
      game("g2", "u1", "27"),
      game("g3", "u2", "28"), // 他人
    ]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1", "g1", "public"));
    await gameLogs.save(log("l2", "u1", "g1", "private"));
    await gameLogs.save(log("l3", "u1", "g2", "private"));

    const result = await new ListMyGamesWithCounts(
      games,
      gameLogs,
      new InMemoryAnalysisJobRepository(),
    ).execute("u1");
    if (!result.ok) throw new Error("ok のはず");

    expect(result.items.map((c) => c.id)).toEqual(["g2", "g1"]); // 新しい順
    expect(result.nextCursor).toBeNull();
    const g1 = result.items.find((c) => c.id === "g1")!;
    expect(g1.kyokuCount).toBe(2);
    expect(g1.publicCount).toBe(1);
  });

  it("下書きの局数（draftCount）を返す（一覧で下書き/編集済を出すため）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "20")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save({ ...log("l1", "u1", "g1", "private"), status: "draft" });
    await gameLogs.save({ ...log("l2", "u1", "g1", "private"), status: "draft" });
    await gameLogs.save(log("l3", "u1", "g1", "private")); // complete

    const result = await new ListMyGamesWithCounts(
      games,
      gameLogs,
      new InMemoryAnalysisJobRepository(),
    ).execute("u1");
    if (!result.ok) throw new Error("ok のはず");
    expect(result.items[0]?.draftCount).toBe(2);
  });

  it("30件を超えると nextCursor を返し、次ページに重複なく続く", async () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({
      ...game(`m${String(i).padStart(2, "0")}`, "u1", "01"),
      createdAt: new Date(Date.parse("2026-06-01T00:00:00.000Z") + i * 1000),
    }));
    const usecase = new ListMyGamesWithCounts(
      new InMemoryGameRepository(rows),
      new InMemoryGameLogRepository(),
      new InMemoryAnalysisJobRepository(),
    );

    const page1 = await usecase.execute("u1");
    if (!page1.ok) throw new Error("ok のはず");
    expect(page1.items).toHaveLength(30);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await usecase.execute("u1", page1.nextCursor!);
    if (!page2.ok) throw new Error("ok のはず");
    expect(page2.items.map((c) => c.id)).toEqual(["m00"]);
    expect(page2.nextCursor).toBeNull();
  });

  it("不正カーソルは invalid", async () => {
    const result = await new ListMyGamesWithCounts(
      new InMemoryGameRepository(),
      new InMemoryGameLogRepository(),
      new InMemoryAnalysisJobRepository(),
    ).execute("u1", "junk");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("ListPublicGames", () => {
  it("公開局を含む半荘を全ユーザーから新着順に、公開局数と著者つきで返す", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "20"), game("g2", "u2", "27")]);
    const users = new InMemoryUserRepository([mkUser("u1", "kuro"), mkUser("u2", "tsuru")]);
    const gameLogs = new InMemoryGameLogRepository();
    // g2 の公開局が新しい（createdAt 同一なので保存順＝listPublic の安定順に依存しないよう日付差で確認）。
    await gameLogs.save({ ...log("l1", "u1", "g1", "public"), createdAt: new Date("2026-06-20") });
    await gameLogs.save({ ...log("l2", "u2", "g2", "public"), createdAt: new Date("2026-06-27") });
    await gameLogs.save({ ...log("l3", "u1", "g1", "private"), createdAt: new Date("2026-06-21") });

    const result = await new ListPublicGames(games, gameLogs, users).execute();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cards = result.items;

    expect(cards.map((c) => c.id)).toEqual(["g2", "g1"]); // 新着順
    expect(result.nextCursor).toBeNull(); // 1ページに収まる
    const g1 = cards.find((c) => c.id === "g1")!;
    expect(g1.kyokuCount).toBe(1); // 公開局のみ数える（private は除外）
    expect(g1.ownerId).toBe("u1");
    expect(g1.ownerHandle).toBe("kuro");
    expect(g1.ownerName).toBe("kuro");
  });

  it("著者名は常に出す（プロフィール非公開機能は廃止）", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "20")]);
    const users = new InMemoryUserRepository([mkUser("u1", "kuro")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1", "g1", "public"));

    const result = await new ListPublicGames(games, gameLogs, users).execute();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const g1 = result.items.find((c) => c.id === "g1")!;
    expect(g1.ownerId).toBe("u1");
    expect(g1.ownerHandle).toBe("kuro");
    expect(g1.ownerName).toBe("kuro");
  });

  it("公開局が無ければ空", async () => {
    const games = new InMemoryGameRepository([game("g1", "u1", "20")]);
    const users = new InMemoryUserRepository([mkUser("u1", "kuro")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1", "g1", "private"));
    const result = await new ListPublicGames(games, gameLogs, users).execute();
    expect(result).toEqual({ ok: true, items: [], nextCursor: null });
  });

  it("カーソルでページを辿れる（最新公開局の時刻順・同時刻は gameId タイブレーク・重複/欠落なし）", async () => {
    // 31半荘（ページサイズ30+1）。g31 が最新。g02/g03 は同時刻（タイブレーク検証）。
    const ids = Array.from({ length: 31 }, (_, i) => `g${String(i + 1).padStart(2, "0")}`);
    const games = new InMemoryGameRepository(ids.map((id) => game(id, "u1", "20")));
    const users = new InMemoryUserRepository([mkUser("u1", "kuro")]);
    const gameLogs = new InMemoryGameLogRepository();
    const base = Date.parse("2026-08-01T00:00:00.000Z");
    for (let i = 1; i <= 31; i++) {
      const id = ids[i - 1]!;
      const at = new Date(i === 2 || i === 3 ? base + 2 * 60_000 : base + i * 60_000);
      await gameLogs.save({ ...log(`l-${id}`, "u1", id, "public"), createdAt: at });
    }

    const uc = new ListPublicGames(games, gameLogs, users);
    const page1 = await uc.execute();
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    expect(page1.items).toHaveLength(30);
    expect(page1.items[0]!.id).toBe("g31");
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await uc.execute(page1.nextCursor!);
    expect(page2.ok).toBe(true);
    if (!page2.ok) return;
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    const all = [...page1.items, ...page2.items].map((c) => c.id);
    expect(new Set(all).size).toBe(31); // 重複も欠落もない
    // 同時刻の g02/g03 は gameId DESC（g03 が先）。
    expect(all.indexOf("g03")).toBeLessThan(all.indexOf("g02"));
  });

  it("不正カーソルは invalid（400）", async () => {
    const uc = new ListPublicGames(
      new InMemoryGameRepository([]),
      new InMemoryGameLogRepository(),
      new InMemoryUserRepository([]),
    );
    expect(await uc.execute("bad")).toEqual({ ok: false, reason: "invalid" });
  });
});
