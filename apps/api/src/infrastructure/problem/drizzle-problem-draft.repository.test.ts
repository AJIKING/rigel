// 解析下書き（problem_drafts）の実 Drizzle 検証（photo-retention.md）。
// 所有者ガードと kifu JSON の往復（読み出し時の KifuSchema 再検証）を sql.js で回帰する。

import { drizzle } from "drizzle-orm/sql-js";
import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";
import { validKifu } from "../../test-support/kifu";
import type { Db } from "../db/client";
import { DrizzleProblemDraftRepository } from "./drizzle-problem-draft.repository";

const SQL = await initSqlJs();
const NOW = new Date("2026-08-03T09:00:00.000Z");
const LATER = new Date("2026-08-03T09:05:00.000Z");

function makeRepo() {
  const sqlite = new SQL.Database();
  sqlite.run(`CREATE TABLE problem_drafts (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    job_id text NOT NULL,
    kifu text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`);
  return new DrizzleProblemDraftRepository(drizzle(sqlite) as unknown as Db);
}

describe("DrizzleProblemDraftRepository", () => {
  let repo: DrizzleProblemDraftRepository;
  beforeEach(() => {
    repo = makeRepo();
  });

  it("create → findForUser / findByJobForUser が往復する（kifu は null で始まる）", async () => {
    await repo.create({ id: "d-1", userId: "u1", jobId: "job-1", now: NOW });

    const byId = await repo.findForUser("d-1", "u1");
    expect(byId).toMatchObject({ id: "d-1", jobId: "job-1", kifu: null });
    expect((await repo.findByJobForUser("job-1", "u1"))?.id).toBe("d-1");
  });

  it("他人の下書きは見えない（所有者ガード）", async () => {
    await repo.create({ id: "d-1", userId: "u1", jobId: "job-1", now: NOW });
    expect(await repo.findForUser("d-1", "attacker")).toBeNull();
    expect(await repo.findByJobForUser("job-1", "attacker")).toBeNull();
  });

  it("setKifu で結果が入り、KifuSchema 検証済みで読み出せる", async () => {
    await repo.create({ id: "d-1", userId: "u1", jobId: "job-1", now: NOW });
    await repo.setKifu("d-1", { kifu: validKifu, now: LATER });

    const draft = await repo.findForUser("d-1", "u1");
    expect(draft?.kifu).toEqual(validKifu);
    expect(draft?.updatedAt).toEqual(LATER);
  });

  it("listByUser は自分の分だけ新しい順・delete で消える", async () => {
    await repo.create({ id: "d-old", userId: "u1", jobId: "j1", now: NOW });
    await repo.create({ id: "d-new", userId: "u1", jobId: "j2", now: LATER });
    await repo.create({ id: "d-other", userId: "u2", jobId: "j3", now: NOW });

    expect((await repo.listByUser("u1")).map((d) => d.id)).toEqual(["d-new", "d-old"]);

    await repo.delete("d-old");
    expect((await repo.listByUser("u1")).map((d) => d.id)).toEqual(["d-new"]);
  });
});
