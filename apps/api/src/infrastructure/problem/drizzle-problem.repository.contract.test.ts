// DrizzleProblemRepository の契約テスト（sql.js = 実 SQLite + 実 migration）。
// カーソルページング（一覧ページネーション。Plan: docs/plans/list-pagination.md）の
// 境界＝同時刻タイブレーク・ステータス絞り込み・所有者スコープを本物のクエリで固定する
// （in-memory フェイクだけでは Drizzle のカラム型マッピング差を検出できない）。

import { describe, expect, it } from "vitest";
import type { ProblemPost, ProblemStatus } from "../../domain/problem/problem";
import { User } from "../../domain/user/user";
import { makeProblemData } from "../../test-support/problem";
import { makeTestDb } from "../../test-support/sqlite";
import { DrizzleUserRepository } from "../user/drizzle-user.repository";
import { DrizzleProblemRepository } from "./drizzle-problem.repository";

const NOW = new Date("2026-08-04T00:00:00.000Z");

async function makeRepo() {
  const db = makeTestDb();
  const users = new DrizzleUserRepository(db);
  for (const id of ["u1", "u2"]) {
    await users.save(User.create({ id, googleSub: `sub-${id}`, now: NOW }));
  }
  return new DrizzleProblemRepository(db);
}

function post(
  id: string,
  userId: string,
  status: ProblemStatus,
  createdAt: Date = NOW,
): ProblemPost {
  return {
    id,
    userId,
    title: `問題${id}`,
    problem: makeProblemData(),
    status,
    photoDraftId: null,
    createdAt,
  };
}

describe("DrizzleProblemRepository（実 SQLite）", () => {
  it("listByUserPage は本人の問題（draft 含む）だけを、カーソル（同時刻は id DESC）で重複なく返す", async () => {
    const repo = await makeRepo();
    // 同時刻3件（id DESC → p3, p2, p1）＋古い1件＋他人の1件（混ざらない）。
    await repo.save(post("p1", "u1", "draft"));
    await repo.save(post("p2", "u1", "published"));
    await repo.save(post("p3", "u1", "draft"));
    await repo.save(post("older", "u1", "published", new Date(NOW.getTime() - 60_000)));
    await repo.save(post("x1", "u2", "published"));

    const page1 = await repo.listByUserPage("u1", 2, null);
    expect(page1.map((p) => p.id)).toEqual(["p3", "p2"]);

    const last = page1[page1.length - 1]!;
    const page2 = await repo.listByUserPage("u1", 10, {
      ms: last.createdAt.getTime(),
      id: last.id,
    });
    expect(page2.map((p) => p.id)).toEqual(["p1", "older"]);
  });

  it("listPublished は published だけを、カーソルで重複なく返す（draft は出さない）", async () => {
    const repo = await makeRepo();
    await repo.save(post("p1", "u1", "published"));
    await repo.save(post("p2", "u2", "published"));
    await repo.save(post("hidden", "u1", "draft"));
    await repo.save(post("older", "u2", "published", new Date(NOW.getTime() - 60_000)));

    const page1 = await repo.listPublished(2, null);
    expect(page1.map((p) => p.id)).toEqual(["p2", "p1"]);

    const last = page1[page1.length - 1]!;
    const page2 = await repo.listPublished(10, { ms: last.createdAt.getTime(), id: last.id });
    expect(page2.map((p) => p.id)).toEqual(["older"]);
  });
});
