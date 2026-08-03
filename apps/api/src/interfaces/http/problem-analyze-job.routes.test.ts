// 何切るの写真AI再現の非同期ジョブ化のルート契約（photo-retention.md・[決定] 2026-08-03）。
// POST /problems/analyze は下書きを先行作成し 202 + jobId + draftId。
// GET /problems/analyze/jobs/:id は所有者だけが状態を見られ、done なら結果ドラフトを同梱する。
// 下書き（/problems/drafts）は一覧・詳細・破棄とも所有者のみ。

import { describe, expect, it } from "vitest";
import {
  GetProblemAnalysisJob,
  StartProblemAnalysisJob,
} from "../../application/problem-analysis-job.usecase";
import {
  DeleteProblemDraft,
  GetProblemDraft,
  ListProblemDrafts,
} from "../../application/problem-drafts.usecase";
import type { AppContainer } from "../../composition-root";
import { JwtSessionService } from "../../infrastructure/auth/jwt-session-service";
import { fakeEnv } from "../../test-support/billing";
import {
  InMemoryAnalysisImageStore,
  InMemoryAnalysisJobRepository,
  InMemoryAnalysisQueue,
  InMemoryProblemDraftRepository,
} from "../../test-support/in-memory-analysis";
import { validKifu } from "../../test-support/kifu";
import { createApp } from "./app";

const NOW = new Date("2026-08-03T10:00:00.000Z");
const session = new JwtSessionService({ secret: "test-secret" });

function makeApp(opts: { preflightOk?: boolean } = {}) {
  const jobs = new InMemoryAnalysisJobRepository();
  const drafts = new InMemoryProblemDraftRepository();
  const images = new InMemoryAnalysisImageStore();
  const queue = new InMemoryAnalysisQueue();
  let n = 0;
  const preflight = () =>
    Promise.resolve(
      opts.preflightOk === false
        ? ({ ok: false, reason: "quota_exceeded" } as const)
        : ({ ok: true } as const),
    );
  const container = {
    session,
    analyzeProblemDraft: { preflight },
    startProblemAnalysisJob: new StartProblemAnalysisJob({
      jobs,
      drafts,
      images,
      queue,
      analyze: { preflight },
      now: () => NOW,
      newId: () => `id-${++n}`,
    }),
    getProblemAnalysisJob: new GetProblemAnalysisJob(jobs, drafts),
    listProblemDrafts: new ListProblemDrafts(drafts, jobs, () => NOW),
    getProblemDraft: new GetProblemDraft(drafts, jobs, () => NOW),
    deleteProblemDraft: new DeleteProblemDraft(drafts, images),
  } as unknown as AppContainer;
  return { app: createApp({ container: () => container }), jobs, drafts, images, queue };
}

async function bearer(userId: string) {
  return { authorization: `Bearer ${await session.issue(userId)}` };
}

function problemForm() {
  const form = new FormData();
  form.set("hand", new File([new Uint8Array(100)], "hand.jpg", { type: "image/jpeg" }));
  form.set("cameraBottomSeat", "south");
  return form;
}

describe("POST /problems/analyze（202 + jobId + draftId）", () => {
  it("下書きを先行作成し、写真を恒久キーへ入れて 202 で jobId と draftId を返す", async () => {
    const { app, jobs, drafts, images, queue } = makeApp();

    const res = await app.request(
      "/problems/analyze",
      { method: "POST", headers: await bearer("u1"), body: problemForm() },
      fakeEnv,
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, jobId: "id-2", draftId: "id-1" });
    expect(await drafts.findForUser("id-1", "u1")).not.toBeNull();
    expect((await jobs.findForUser("id-2", "u1"))?.gameId).toBeNull();
    expect(await images.get("problems/id-1/id-2/hand")).not.toBeNull();
    expect(queue.sent[0]).toMatchObject({ kind: "problem", jobId: "id-2", draftId: "id-1" });
  });

  it("枠切れは同期の 402（下書きもジョブも作らない）", async () => {
    const { app, jobs, drafts } = makeApp({ preflightOk: false });

    const res = await app.request(
      "/problems/analyze",
      { method: "POST", headers: await bearer("u1"), body: problemForm() },
      fakeEnv,
    );

    expect(res.status).toBe(402);
    expect(jobs.jobs.size).toBe(0);
    expect(drafts.drafts.size).toBe(0);
  });
});

describe("GET /problems/analyze/jobs/:id", () => {
  it("done なら下書きの結果ドラフト（Kifu 形）と draftId を同梱して返す", async () => {
    const { app, jobs, drafts } = makeApp();
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
    await drafts.create({ id: "d-1", userId: "u1", jobId: "job-1", now: NOW });
    await drafts.setKifu("d-1", { kifu: validKifu, now: NOW });
    await jobs.markDone("job-1", { gameId: null, logId: null, now: NOW });

    const res = await app.request(
      "/problems/analyze/jobs/job-1",
      { headers: await bearer("u1") },
      fakeEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; draft: unknown; draftId: string };
    expect(body.status).toBe("done");
    expect(body.draft).toEqual(validKifu);
    expect(body.draftId).toBe("d-1");
  });

  it("他人のジョブ・不存在は 404（存在を漏らさない）", async () => {
    const { app, jobs } = makeApp();
    await jobs.create({ id: "job-1", userId: "owner", gameId: null, now: NOW });

    const asAttacker = await app.request(
      "/problems/analyze/jobs/job-1",
      { headers: await bearer("attacker") },
      fakeEnv,
    );
    expect(asAttacker.status).toBe(404);
  });
});

describe("/problems/drafts（解析下書き）", () => {
  async function seedDraft(ctx: ReturnType<typeof makeApp>, ready = true) {
    await ctx.jobs.create({ id: "job-1", userId: "owner", gameId: null, now: NOW });
    await ctx.drafts.create({ id: "d-1", userId: "owner", jobId: "job-1", now: NOW });
    await ctx.images.put("problems/d-1/job-1/hand", {
      data: new ArrayBuffer(4),
      mimeType: "image/jpeg",
    });
    if (ready) {
      await ctx.drafts.setKifu("d-1", { kifu: validKifu, now: NOW });
      await ctx.jobs.markDone("job-1", { gameId: null, logId: null, now: NOW });
    }
  }

  it("一覧は所有者の下書きをステータス付きで返す（ready / processing）", async () => {
    const ctx = makeApp();
    await seedDraft(ctx);

    const res = await ctx.app.request(
      "/problems/drafts",
      { headers: await bearer("owner") },
      fakeEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { drafts: { id: string; status: string }[] };
    expect(body.drafts).toEqual([
      { id: "d-1", status: "ready", createdAt: NOW.toISOString() },
    ]);
  });

  it("詳細は ready なら Kifu を同梱。他人は 404", async () => {
    const ctx = makeApp();
    await seedDraft(ctx);

    const res = await ctx.app.request(
      "/problems/drafts/d-1",
      { headers: await bearer("owner") },
      fakeEnv,
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { draft: unknown }).draft).toEqual(validKifu);

    const other = await ctx.app.request(
      "/problems/drafts/d-1",
      { headers: await bearer("attacker") },
      fakeEnv,
    );
    expect(other.status).toBe(404);
  });

  it("破棄は写真（R2）ごと消す。他人は 404 で消えない", async () => {
    const ctx = makeApp();
    await seedDraft(ctx, false);

    const other = await ctx.app.request(
      "/problems/drafts/d-1",
      { method: "DELETE", headers: await bearer("attacker") },
      fakeEnv,
    );
    expect(other.status).toBe(404);

    const res = await ctx.app.request(
      "/problems/drafts/d-1",
      { method: "DELETE", headers: await bearer("owner") },
      fakeEnv,
    );
    expect(res.status).toBe(200);
    expect(await ctx.drafts.findForUser("d-1", "owner")).toBeNull();
    expect(await ctx.images.listKeys("problems/d-1/")).toEqual([]);
  });
});
