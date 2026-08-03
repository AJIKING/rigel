import { describe, expect, it } from "vitest";
import { KIFU_LIMITS } from "@rigel/schema";
import type { Game } from "../domain/game/game";
import type { GameLog } from "../domain/kifu/game-log";
import { User, firstOfNextMonthUtc } from "../domain/user/user";
import {
  InMemoryAccountStore,
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryProblemAnswerRepository,
  InMemoryProblemRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { InMemoryAnalysisImageStore } from "../test-support/in-memory-analysis";
import { validKifu } from "../test-support/kifu";
import { makeProblemData } from "../test-support/problem";
import { DeleteAccount, GetPublicProfile, UpdateProfile } from "./profile.usecase";

const NOW = new Date("2026-06-29T00:00:00.000Z");
function mkUser(id: string, handle: string | null, plan: "free" | "next" | "pro" = "free"): User {
  return new User({
    id,
    googleSub: `sub-${id}`,
    plan,
    analysisCountThisMonth: 0,
    countResetAt: firstOfNextMonthUtc(NOW),
    handle,
    displayName: handle ?? "",
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
  status: "complete",
  createdAt: NOW,
});

describe("UpdateProfile", () => {
  it("ハンドル/表示名を更新する", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", null)]);
    const r = await new UpdateProfile(users).execute({
      userId: "u1",
      handle: "rin_riichi",
      displayName: "りん",
    });
    expect(r).toEqual({ ok: true });
    const u = await users.findById("u1");
    expect(u?.handle).toBe("rin_riichi");
    expect(u?.displayName).toBe("りん");
  });

  it("不正なハンドルは invalid_handle", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", null)]);
    const r = await new UpdateProfile(users).execute({ userId: "u1", handle: "ab" }); // 短すぎ
    expect(r).toEqual({ ok: false, reason: "invalid_handle" });
  });

  it("表示名が長すぎるときは invalid_display_name（公開プロフィール・OGP に載るため上限を強制）", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", null)]);
    const long = "あ".repeat(KIFU_LIMITS.displayName + 1);
    const r = await new UpdateProfile(users).execute({ userId: "u1", displayName: long });
    expect(r).toEqual({ ok: false, reason: "invalid_display_name" });
    expect((await users.findById("u1"))?.displayName).not.toBe(long);
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

  it("存在しないユーザーは null", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", "kuro_2p")]);
    const p = await new GetPublicProfile(
      users,
      new InMemoryGameRepository(),
      new InMemoryGameLogRepository(),
    ).execute("nobody");
    expect(p).toBeNull();
  });
});

describe("DeleteAccount", () => {
  function problemDeps() {
    const problems = new InMemoryProblemRepository();
    const answers = new InMemoryProblemAnswerRepository(problems);
    return { problems, answers };
  }

  it("自分の牌譜・半荘・何切る（回答含む）・ユーザーを削除する", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", "x"), mkUser("u2", "y")]);
    const games = new InMemoryGameRepository([game("g1", "u1"), game("g2", "u2")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1", "g1", "public"));
    await gameLogs.save(log("l2", "u2", "g2", "public"));
    // 何切る: u1 の問題 p1（u2 が回答）と、u2 の問題 p2（u1 が回答）。
    const { problems, answers } = problemDeps();
    const problemOf = (id: string, userId: string) => ({
      id,
      userId,
      title: "",
      problem: makeProblemData(),
      status: "published" as const,
      createdAt: NOW,
    });
    await problems.save(problemOf("p1", "u1"));
    await problems.save(problemOf("p2", "u2"));
    const answerOf = (problemId: string, userId: string) => ({
      problemId,
      userId,
      choiceKey: "pass",
      action: { type: "pass" } as const,
      createdAt: NOW,
    });
    await answers.upsert(answerOf("p1", "u2"));
    await answers.upsert(answerOf("p2", "u1"));

    const r = await new DeleteAccount(
      users,
      new InMemoryAccountStore(users, games, gameLogs, problems, answers),
    ).execute("u1");

    expect(r).toEqual({ ok: true });
    expect(await users.findById("u1")).toBeNull();
    expect(await users.findById("u2")).not.toBeNull(); // 他人は残る
    expect(gameLogs.saved.map((l) => l.id)).toEqual(["l2"]);
    expect(await games.findById("g1")).toBeNull();
    // 何切る: 自分の問題＋その問題への他人の回答＋自分が他所へ付けた回答が消える。
    expect(await problems.findById("p1")).toBeNull();
    expect(await problems.findById("p2")).not.toBeNull(); // 他人の問題は残る
    expect(await answers.countsByProblem("p1")).toEqual({});
    expect(await answers.countsByProblem("p2")).toEqual({});
  });

  it("退会で自分の半荘の元写真（R2）も消す（他人の写真は残る。photo-retention.md）", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", "x"), mkUser("u2", "y")]);
    const games = new InMemoryGameRepository([game("g1", "u1"), game("g2", "u2")]);
    const { problems, answers } = problemDeps();
    const images = new InMemoryAnalysisImageStore();
    await images.put("games/g1/j1/river", { data: new ArrayBuffer(4), mimeType: "image/jpeg" });
    await images.put("games/g2/j2/river", { data: new ArrayBuffer(4), mimeType: "image/jpeg" });

    const r = await new DeleteAccount(
      users,
      new InMemoryAccountStore(users, games, new InMemoryGameLogRepository(), problems, answers),
      null,
      { games, images },
    ).execute("u1");

    expect(r).toEqual({ ok: true });
    expect(await images.listKeys("games/g1/")).toEqual([]);
    expect(await images.listKeys("games/g2/")).toHaveLength(1); // 他人の写真は残る
  });

  it("Apple の refresh token があれば退会時に失効させる（失効失敗でも削除は続行）", async () => {
    const appleUser = new User({
      id: "u1",
      googleSub: null,
      appleSub: "apple-1",
      appleRefreshToken: "rt-1",
      plan: "free",
      analysisCountThisMonth: 0,
      countResetAt: firstOfNextMonthUtc(NOW),
    });
    const revoked: string[] = [];
    const appleAuth = {
      exchangeCode: () => Promise.resolve(null),
      revokeToken: (t: string) => {
        revoked.push(t);
        return Promise.reject(new Error("apple down")); // 失敗しても削除は止めない
      },
    };
    const users = new InMemoryUserRepository([appleUser]);
    const { problems, answers } = problemDeps();
    const r = await new DeleteAccount(
      users,
      new InMemoryAccountStore(
        users,
        new InMemoryGameRepository(),
        new InMemoryGameLogRepository(),
        problems,
        answers,
      ),
      appleAuth,
    ).execute("u1");

    expect(r).toEqual({ ok: true });
    expect(revoked).toEqual(["rt-1"]);
    expect(await users.findById("u1")).toBeNull();
  });

  it("有料プラン契約中は削除できない（解約が先。データは消さない）", async () => {
    const users = new InMemoryUserRepository([mkUser("u1", "x", "pro")]);
    const games = new InMemoryGameRepository([game("g1", "u1")]);
    const gameLogs = new InMemoryGameLogRepository();
    await gameLogs.save(log("l1", "u1", "g1", "public"));
    const { problems, answers } = problemDeps();

    const r = await new DeleteAccount(
      users,
      new InMemoryAccountStore(users, games, gameLogs, problems, answers),
    ).execute("u1");

    expect(r).toEqual({ ok: false, reason: "paid_plan" });
    expect(await users.findById("u1")).not.toBeNull(); // ユーザーもデータも残る
    expect(await games.findById("g1")).not.toBeNull();
  });
});
