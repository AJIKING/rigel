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
    await repo.create({ id: "job-1", userId: "u1", gameId: "g-job", now: NOW });
    const job = await repo.findForUser("job-1", "u1");

    expect(job).toMatchObject({
      id: "job-1",
      userId: "u1",
      status: "processing",
      gameId: "g-job", // 半荘先行作成（plan 8-3）: 作成時から紐づく
      logId: null,
      reason: null,
    });
    expect(job?.createdAt).toEqual(NOW);
    expect(job?.updatedAt).toEqual(NOW);
  });

  it("他人のジョブ・不存在のジョブは null（所有者ガード）", async () => {
    await repo.create({ id: "job-1", userId: "u1", gameId: "g-job", now: NOW });

    expect(await repo.findForUser("job-1", "attacker")).toBeNull();
    expect(await repo.findForUser("missing", "u1")).toBeNull();
  });

  it("何切るジョブ（gameId 無し）は null のまま作成・完了できる（結果は R2 の result.json）", async () => {
    await repo.create({ id: "job-p", userId: "u1", gameId: null, now: NOW });
    await repo.markDone("job-p", { gameId: null, logId: null, now: LATER });

    const job = await repo.findForUser("job-p", "u1");
    expect(job).toMatchObject({ status: "done", gameId: null, logId: null });
  });

  it("markDone で done になり gameId/logId と updatedAt が入る", async () => {
    await repo.create({ id: "job-1", userId: "u1", gameId: "g-job", now: NOW });
    await repo.markDone("job-1", { gameId: "g1", logId: "l1", now: LATER });

    const job = await repo.findForUser("job-1", "u1");
    expect(job).toMatchObject({ status: "done", gameId: "g1", logId: "l1", reason: null });
    expect(job?.updatedAt).toEqual(LATER);
  });

  it("listActiveByUser は processing/failed だけを新しい順に返す（done は返さない＝全履歴を舐めない）", async () => {
    await repo.create({ id: "job-done", userId: "u1", gameId: "g1", now: NOW });
    await repo.markDone("job-done", { gameId: "g1", logId: "l1", now: LATER });
    await repo.create({ id: "job-fail", userId: "u1", gameId: "g2", now: NOW });
    await repo.markFailed("job-fail", { reason: "analysis_failed", now: LATER });
    await repo.create({ id: "job-run", userId: "u1", gameId: "g3", now: LATER });
    await repo.create({ id: "job-other", userId: "u2", gameId: "g4", now: NOW }); // 他人

    const jobs = await repo.listActiveByUser("u1");
    expect(jobs.map((j) => j.id)).toEqual(["job-run", "job-fail"]);
  });

  it("deleteByGame はその半荘のジョブ行だけを消す（半荘削除の掃除。processing はキャンセル扱い）", async () => {
    await repo.create({ id: "job-1", userId: "u1", gameId: "g1", now: NOW });
    await repo.create({ id: "job-2", userId: "u1", gameId: "g1", now: LATER });
    await repo.create({ id: "job-3", userId: "u1", gameId: "g2", now: NOW }); // 別半荘は残る

    await repo.deleteByGame("g1");

    expect(await repo.findForUser("job-1", "u1")).toBeNull();
    expect(await repo.findForUser("job-2", "u1")).toBeNull();
    expect(await repo.findForUser("job-3", "u1")).not.toBeNull();
  });

  it("markFailed で failed になり reason が入る（gameId は保持・logId は null のまま）", async () => {
    await repo.create({ id: "job-1", userId: "u1", gameId: "g-job", now: NOW });
    await repo.markFailed("job-1", { reason: "analysis_failed", now: LATER });

    const job = await repo.findForUser("job-1", "u1");
    expect(job).toMatchObject({
      status: "failed",
      reason: "analysis_failed",
      gameId: "g-job",
      logId: null,
    });
  });
});
