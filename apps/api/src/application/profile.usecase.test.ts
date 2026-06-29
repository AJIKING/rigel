import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog } from "../domain/kifu/game-log";
import { User, firstOfNextMonthUtc } from "../domain/user/user";
import {
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { DeleteAccount, GetPublicProfile, UpdateProfile } from "./profile.usecase";

const NOW = new Date("2026-06-29T00:00:00.000Z");
function mkUser(id: string, handle: string | null, profilePublic = true): User {
  return new User({
    id,
    googleSub: `sub-${id}`,
    plan: "free",
    analysisCountThisMonth: 0,
    countResetAt: firstOfNextMonthUtc(NOW),
    handle,
    displayName: handle ?? "",
    profilePublic,
  });
}
const game = (id: string, userId: string): Game => ({ id, userId, title: id, createdAt: NOW });
const log = (id: string, userId: string, gameId: string, vis: "public" | "private"): GameLog => ({
  id,
  userId,
  gameId,
  seq: 1,
  kifu: validKifu,
  visibility: vis,
  createdAt: NOW,
});

describe("UpdateProfile", () => {
  it("ハンドル/表示名/公開を更新する", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", null)]);
    const r = await new UpdateProfile(users).execute({
      userId: "u1",
      handle: "rin_riichi",
      displayName: "りん",
      profilePublic: false,
    });
    expect(r).toEqual({ ok: true });
    const u = await users.findById("u1");
    expect(u?.handle).toBe("rin_riichi");
    expect(u?.displayName).toBe("りん");
    expect(u?.profilePublic).toBe(false);
  });

  it("不正なハンドルは invalid_handle", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", null)]);
    const r = await new UpdateProfile(users).execute({ userId: "u1", handle: "ab" }); // 短すぎ
    expect(r).toEqual({ ok: false, reason: "invalid_handle" });
  });

  it("他人が使用中のハンドルは handle_taken", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", null), mkUser("u2", "taken_id")]);
    const r = await new UpdateProfile(users).execute({ userId: "u1", handle: "taken_id" });
    expect(r).toEqual({ ok: false, reason: "handle_taken" });
  });

  it("空文字のハンドルは null にクリアする", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", "old_handle")]);
    await new UpdateProfile(users).execute({ userId: "u1", handle: "" });
    expect((await users.findById("u1"))?.handle).toBeNull();
  });
});

describe("GetPublicProfile", () => {
  function setup() {
    const users = new InMemoryUserRepository([mkUser("u1", "kuro_2p")]);
    const games = new InMemoryGameRepository([game("g1", "u1"), game("g2", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    return { users, games, gameLogs };
  }

  it("handle で公開プロフィールと公開半荘を返す", async () => {
    const { users, games, gameLogs } = setup();
    await gameLogs.save(log("l1", "u1", "g1", "public"));
    await gameLogs.save(log("l2", "u1", "g2", "private")); // 非公開半荘は出ない
    const p = await new GetPublicProfile(users, games, gameLogs).execute("kuro_2p");
    expect(p?.displayName).toBe("kuro_2p");
    expect(p?.games.map((g) => g.id)).toEqual(["g1"]);
  });

  it("id でも解決できる", async () => {
    const { users, games, gameLogs } = setup();
    await gameLogs.save(log("l1", "u1", "g1", "public"));
    const p = await new GetPublicProfile(users, games, gameLogs).execute("u1");
    expect(p?.id).toBe("u1");
  });

  it("非公開プロフィールは null", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", "hidden", false)]);
    const p = await new GetPublicProfile(
      users,
      new InMemoryGameRepository(),
      new InMemoryGameLogRepository(),
    ).execute("hidden");
    expect(p).toBeNull();
  });
});

describe("DeleteAccount", () => {
  it("自分の牌譜・半荘・ユーザーを削除する", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", "x"), mkUser("u2", "y")]);
    const games = new InMemoryGameRepository([game("g1", "u1"), game("g2", "u2")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1", "g1", "public"));
    await gameLogs.save(log("l2", "u2", "g2", "public"));

    const r = await new DeleteAccount(users, games, gameLogs).execute("u1");

    expect(r).toEqual({ ok: true });
    expect(await users.findById("u1")).toBeNull();
    expect(await users.findById("u2")).not.toBeNull(); // 他人は残る
    expect(gameLogs.saved.map((l) => l.id)).toEqual(["l2"]);
    expect(await games.findById("g1")).toBeNull();
  });
});
