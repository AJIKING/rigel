// DrizzleAccountStore の契約テスト（sql.js = 実 SQLite + 実 migration）。
// 退会（deleteAll）が本人のデータを網羅的に消すことを本物のクエリで固定する。
// 特に quiz_sessions は users への FK を持つため、消し漏れは D1（FK 強制）で
// 退会そのものを失敗させる（信頼ゲート監査 2026-07-25 の指摘）。

import { describe, expect, it } from "vitest";
import { User } from "../../domain/user/user";
import { makeTestDb } from "../../test-support/sqlite";
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
});
