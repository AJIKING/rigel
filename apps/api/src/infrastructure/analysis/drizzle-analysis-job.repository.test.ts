// 解析ジョブ（analysis_jobs）の実 Drizzle 検証（docs/plans/async-analysis.md Task 2）。
// 所有者ガード（他人のジョブは見えない）と状態遷移の実クエリを sql.js（D1 と同じ
// SQLite 方言）で回帰する。

import { drizzle } from "drizzle-orm/sql-js";
import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { DrizzleAnalysisJobRepository } from "./drizzle-analysis-job.repository";

const SQL = await initSqlJs();

const NOW = new Date("2026-08-01T09:00:00.000Z");
const LATER = new Date("2026-08-01T09:03:00.000Z");

/** migrations/ の analysis_jobs と同じ形のテーブルを持つ in-memory DB を作る。 */
function makeRepo() {
  const sqlite = new SQL.Database();
  sqlite.run(`CREATE TABLE analysis_jobs (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    status text NOT NULL DEFAULT 'processing',
    game_id text,
    log_id text,
    reason text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`);
  return new DrizzleAnalysisJobRepository(drizzle(sqlite) as unknown as Db);
}

describe("DrizzleAnalysisJobRepository", () => {
  let repo: DrizzleAnalysisJobRepository;
  beforeEach(() => {
    repo = makeRepo();
  });

  it("create したジョブは processing で取得できる", async () => {
    await repo.create({ id: "job-1", userId: "u1", now: NOW });
    const job = await repo.findForUser("job-1", "u1");

    expect(job).toMatchObject({
      id: "job-1",
      userId: "u1",
      status: "processing",
      gameId: null,
      logId: null,
      reason: null,
    });
    expect(job?.createdAt).toEqual(NOW);
    expect(job?.updatedAt).toEqual(NOW);
  });

  it("他人のジョブ・不存在のジョブは null（所有者ガード）", async () => {
    await repo.create({ id: "job-1", userId: "u1", now: NOW });

    expect(await repo.findForUser("job-1", "attacker")).toBeNull();
    expect(await repo.findForUser("missing", "u1")).toBeNull();
  });

  it("markDone で done になり gameId/logId と updatedAt が入る", async () => {
    await repo.create({ id: "job-1", userId: "u1", now: NOW });
    await repo.markDone("job-1", { gameId: "g1", logId: "l1", now: LATER });

    const job = await repo.findForUser("job-1", "u1");
    expect(job).toMatchObject({ status: "done", gameId: "g1", logId: "l1", reason: null });
    expect(job?.updatedAt).toEqual(LATER);
  });

  it("markFailed で failed になり reason が入る（gameId/logId は null のまま）", async () => {
    await repo.create({ id: "job-1", userId: "u1", now: NOW });
    await repo.markFailed("job-1", { reason: "analysis_failed", now: LATER });

    const job = await repo.findForUser("job-1", "u1");
    expect(job).toMatchObject({
      status: "failed",
      reason: "analysis_failed",
      gameId: null,
      logId: null,
    });
  });
});
