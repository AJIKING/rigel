// DrizzleQuizSessionRepository の契約テスト（sql.js = 実 SQLite + 実 migration）。
// 履歴は「本人の・完了済みのみ」— 他人の成績が混ざらないことを本物のクエリで固定する。

import { describe, expect, it } from "vitest";
import { User } from "../../domain/user/user";
import type { QuizSession } from "../../domain/quiz/quiz-session";
import { makeTestDb } from "../../test-support/sqlite";
import { DrizzleUserRepository } from "../user/drizzle-user.repository";
import { DrizzleQuizSessionRepository } from "./drizzle-quiz-session.repository";

const NOW = new Date("2026-07-24T03:00:00.000Z");

function session(over: Partial<QuizSession> & { id: string }): QuizSession {
  return {
    userId: "u1",
    kind: "chinitsu",
    startedDay: "2026-07-24",
    total: null,
    correct: null,
    durationMs: null,
    createdAt: NOW,
    ...over,
  };
}

async function makeRepo() {
  const db = makeTestDb();
  const users = new DrizzleUserRepository(db);
  for (const id of ["u1", "u2"]) {
    await users.save(User.create({ id, googleSub: `sub-${id}`, now: NOW }));
  }
  return new DrizzleQuizSessionRepository(db);
}

describe("DrizzleQuizSessionRepository（実 SQLite）", () => {
  it("insert / findById の往復（結果 null の未完了行）", async () => {
    const repo = await makeRepo();
    await repo.insert(session({ id: "q1" }));
    expect(await repo.findById("q1")).toEqual(session({ id: "q1" }));
    expect(await repo.findById("missing")).toBeNull();
  });

  it("countByUserAndDay は本人・当日の開始数（未完了含む）だけを数える", async () => {
    const repo = await makeRepo();
    await repo.insert(session({ id: "q1" }));
    await repo.insert(session({ id: "q2", total: 5, correct: 3, durationMs: 60_000 }));
    await repo.insert(session({ id: "q3", startedDay: "2026-07-25" })); // 別日
    await repo.insert(session({ id: "q4", userId: "u2" })); // 他人
    expect(await repo.countByUserAndDay("u1", "2026-07-24")).toBe(2);
  });

  it("update で結果を書ける（最後勝ち）", async () => {
    const repo = await makeRepo();
    await repo.insert(session({ id: "q1" }));
    await repo.update(session({ id: "q1", total: 10, correct: 7, durationMs: 61_000 }));
    await repo.update(session({ id: "q1", total: 12, correct: 9, durationMs: 62_000 }));
    expect(await repo.findById("q1")).toMatchObject({ total: 12, correct: 9, durationMs: 62_000 });
  });

  it("listCompletedByUser は本人の完了済みだけを新しい順に返す（未完了・他人を除く）", async () => {
    const repo = await makeRepo();
    const t = (h: number) => new Date(Date.UTC(2026, 6, 24, h));
    await repo.insert(
      session({ id: "old", total: 5, correct: 1, durationMs: 60_000, createdAt: t(1) }),
    );
    await repo.insert(
      session({ id: "new", total: 8, correct: 4, durationMs: 61_000, createdAt: t(5) }),
    );
    await repo.insert(session({ id: "abandoned", createdAt: t(3) })); // 未完了
    await repo.insert(
      session({
        id: "other",
        userId: "u2",
        total: 9,
        correct: 9,
        durationMs: 60_000,
        createdAt: t(4),
      }),
    );

    const got = await repo.listCompletedByUser("u1", null, 500);
    expect(got.map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("since 以降だけ・limit 件までに絞る", async () => {
    const repo = await makeRepo();
    const t = (h: number) => new Date(Date.UTC(2026, 6, 24, h));
    for (const [id, h] of [
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ] as const) {
      await repo.insert(session({ id, total: 1, correct: 1, durationMs: 60_000, createdAt: t(h) }));
    }
    expect((await repo.listCompletedByUser("u1", t(2), 500)).map((s) => s.id)).toEqual(["c", "b"]);
    expect((await repo.listCompletedByUser("u1", null, 2)).map((s) => s.id)).toEqual(["c", "b"]);
  });
});
