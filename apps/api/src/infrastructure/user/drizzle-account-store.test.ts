// DrizzleAccountStore の契約テスト（sql.js = 実 SQLite + 実 migration）。
// 退会（deleteAll）が本人のデータを網羅的に消すことを本物のクエリで固定する。
// 特に quiz_sessions は users への FK を持つため、消し漏れは D1（FK 強制）で
// 退会そのものを失敗させる（信頼ゲート監査 2026-07-25 の指摘）。

import { describe, expect, it } from "vitest";
import { User } from "../../domain/user/user";
import { makeProblemData } from "../../test-support/problem";
import { makeTestDb } from "../../test-support/sqlite";
import { DrizzleAnalysisJobRepository } from "../analysis/drizzle-analysis-job.repository";
import { DrizzleFavoriteRepository } from "../favorite/drizzle-favorite.repository";
import { DrizzleGameRepository } from "../game/drizzle-game.repository";
import { DrizzleProblemRepository } from "../problem/drizzle-problem.repository";
import { DrizzleQuizSessionRepository } from "../quiz/drizzle-quiz-session.repository";
import { DrizzleAccountStore } from "./drizzle-account-store";
import { DrizzleUserRepository } from "./drizzle-user.repository";

const NOW = new Date("2026-07-25T03:00:00.000Z");

describe("DrizzleAccountStore（実 SQLite）", () => {
  it("deleteAll: 特訓セッションを持つユーザーの退会で quiz_sessions も消え、本人の行が残らない", async () => {
    const db = makeTestDb();
    const users = new DrizzleUserRepository(db);
    const quiz = new DrizzleQuizSessionRepository(db);
    for (const id of ["u1", "u2"]) {
      await users.save(User.create({ id, googleSub: `sub-${id}`, now: NOW }));
    }
    // u1 は未完了・完了済みの両方を持つ。u2 の成績は残ること（他人を消さない）。
    await quiz.insert({
      id: "q1",
      userId: "u1",
      kind: "chinitsu",
      startedDay: "2026-07-25",
      total: null,
      correct: null,
      durationMs: null,
      createdAt: NOW,
    });
    await quiz.insert({
      id: "q2",
      userId: "u1",
      kind: "efficiency",
      startedDay: "2026-07-25",
      total: 8,
      correct: 5,
      durationMs: 60_000,
      createdAt: NOW,
    });
    await quiz.insert({
      id: "q3",
      userId: "u2",
      kind: "chinitsu",
      startedDay: "2026-07-25",
      total: 3,
      correct: 3,
      durationMs: 60_000,
      createdAt: NOW,
    });

    const store = new DrizzleAccountStore(db);
    await store.deleteAll("u1");

    expect(await users.findById("u1")).toBeNull();
    expect(await quiz.findById("q1")).toBeNull();
    expect(await quiz.findById("q2")).toBeNull();
    // 他人（u2）のアカウントと成績は無傷。
    expect(await users.findById("u2")).not.toBeNull();
    expect(await quiz.findById("q3")).not.toBeNull();
  });

  it("deleteAll: 解析ジョブ（analysis_jobs）も消える（users への FK の消し漏れで退会を落とさない）", async () => {
    const db = makeTestDb();
    const users = new DrizzleUserRepository(db);
    const jobs = new DrizzleAnalysisJobRepository(db);
    for (const id of ["u1", "u2"]) {
      await users.save(User.create({ id, googleSub: `sub-${id}`, now: NOW }));
    }
    await jobs.create({ id: "j1", userId: "u1", now: NOW });
    await jobs.create({ id: "j2", userId: "u2", now: NOW });

    const store = new DrizzleAccountStore(db);
    await store.deleteAll("u1");

    expect(await users.findById("u1")).toBeNull();
    expect(await jobs.findForUser("j1", "u1")).toBeNull();
    // 他人（u2）のジョブは無傷。
    expect(await jobs.findForUser("j2", "u2")).not.toBeNull();
  });

  it("deleteAll: 自分が付けたお気に入りも、自分の投稿に他人が付けたお気に入りも消える", async () => {
    const db = makeTestDb();
    const users = new DrizzleUserRepository(db);
    const games = new DrizzleGameRepository(db);
    const problems = new DrizzleProblemRepository(db);
    const favorites = new DrizzleFavoriteRepository(db);
    for (const id of ["u1", "u2"]) {
      await users.save(User.create({ id, googleSub: `sub-${id}`, now: NOW }));
    }
    await games.save({ id: "g1", userId: "u1", title: "u1 の半荘", createdAt: NOW });
    await games.save({ id: "g2", userId: "u2", title: "u2 の半荘", createdAt: NOW });
    await problems.save({
      id: "p1",
      userId: "u1",
      title: "u1 の問題",
      problem: makeProblemData(),
      status: "published",
      createdAt: NOW,
    });

    // u1 が付けた分（他人のものへも）と、u1 の投稿に u2 が付けた分。
    await favorites.add({ userId: "u1", targetType: "game", targetId: "g2", createdAt: NOW });
    await favorites.add({ userId: "u2", targetType: "game", targetId: "g1", createdAt: NOW });
    await favorites.add({ userId: "u2", targetType: "problem", targetId: "p1", createdAt: NOW });
    // u2 が u2 自身の半荘に付けた分は残る（他人のデータを巻き込まない）。
    await favorites.add({ userId: "u2", targetType: "game", targetId: "g2", createdAt: NOW });

    await new DrizzleAccountStore(db).deleteAll("u1");

    expect(await favorites.listByUser("u1")).toEqual([]);
    // u1 の投稿（g1・p1）に付いていた他人の★は、対象ごと消えるので残らない。
    expect(await favorites.countsByTargets("game", ["g1", "g2"])).toEqual({ g2: 1 });
    expect(await favorites.countsByTargets("problem", ["p1"])).toEqual({});
  });
});
