// 何切るの写真AI再現の非同期ジョブ化のルート契約（async-analysis.md Task 8・[決定] 2026-08-02）。
// POST /problems/analyze は同期検証 → 画像を一時ストアへ → ジョブ作成 → キュー投入 → 202 + jobId。
// GET /problems/analyze/jobs/:id は所有者だけが状態を見られ、done なら結果ドラフトを同梱する。

import { describe, expect, it } from "vitest";
import {
  GetProblemAnalysisJob,
  StartProblemAnalysisJob,
} from "../../application/problem-analysis-job.usecase";
import { analysisResultKey } from "../../domain/analysis/analysis-transport";
import type { AppContainer } from "../../composition-root";
import { JwtSessionService } from "../../infrastructure/auth/jwt-session-service";
import { fakeEnv } from "../../test-support/billing";
import {
  InMemoryAnalysisImageStore,
  InMemoryAnalysisJobRepository,
  InMemoryAnalysisQueue,
} from "../../test-support/in-memory-analysis";
import { validKifu } from "../../test-support/kifu";
import { createApp } from "./app";

const NOW = new Date("2026-08-02T10:00:00.000Z");
const session = new JwtSessionService({ secret: "test-secret" });

function makeApp(opts: { preflightOk?: boolean } = {}) {
  const jobs = new InMemoryAnalysisJobRepository();
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
      images,
      queue,
      analyze: { preflight },
      now: () => NOW,
      newId: () => `job-${++n}`,
    }),
    getProblemAnalysisJob: new GetProblemAnalysisJob(jobs, images),
  } as unknown as AppContainer;
  return { app: createApp({ container: () => container }), jobs, images, queue };
}

async function bearer(userId: string) {
  return { authorization: `Bearer ${await session.issue(userId)}` };
}

function problemForm(withRiver = false) {
  const form = new FormData();
  form.set("hand", new File([new Uint8Array(100)], "hand.jpg", { type: "image/jpeg" }));
  if (withRiver) {
    form.set("river", new File([new Uint8Array(100)], "river.jpg", { type: "image/jpeg" }));
  }
  form.set("cameraBottomSeat", "south");
  return form;
}

describe("POST /problems/analyze（202 + jobId）", () => {
  it("検証を通れば 202 で jobId を返し、画像を一時保存して problem メッセージをキューへ投入する", async () => {
    const { app, jobs, images, queue } = makeApp();

    const res = await app.request(
      "/problems/analyze",
      { method: "POST", headers: await bearer("u1"), body: problemForm(true) },
      fakeEnv,
    );

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, jobId: "job-1" });
    expect((await jobs.findForUser("job-1", "u1"))?.gameId).toBeNull(); // 半荘は作らない
    expect(await images.get("jobs/job-1/hand")).not.toBeNull();
    expect(await images.get("jobs/job-1/river")).not.toBeNull();
    expect(queue.sent[0]).toMatchObject({
      kind: "problem",
      jobId: "job-1",
      handKey: "jobs/job-1/hand",
    });
  });

  it("枠切れは同期の 402（ジョブを作らない）", async () => {
    const { app, jobs, queue } = makeApp({ preflightOk: false });

    const res = await app.request(
      "/problems/analyze",
      { method: "POST", headers: await bearer("u1"), body: problemForm() },
      fakeEnv,
    );

    expect(res.status).toBe(402);
    expect(jobs.jobs.size).toBe(0);
    expect(queue.sent).toHaveLength(0);
  });
});

describe("GET /problems/analyze/jobs/:id", () => {
  it("done なら結果ドラフト（Kifu 形）を同梱して返す", async () => {
    const { app, jobs, images } = makeApp();
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
    await images.putJson(analysisResultKey("job-1"), validKifu);
    await jobs.markDone("job-1", { gameId: null, logId: null, now: NOW });

    const res = await app.request(
      "/problems/analyze/jobs/job-1",
      { headers: await bearer("u1") },
      fakeEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; draft: unknown };
    expect(body.status).toBe("done");
    expect(body.draft).toEqual(validKifu);
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

    const missing = await app.request(
      "/problems/analyze/jobs/missing",
      { headers: await bearer("owner") },
      fakeEnv,
    );
    expect(missing.status).toBe(404);
  });

  it("トークン無しは 401", async () => {
    const { app } = makeApp();
    const res = await app.request("/problems/analyze/jobs/job-1", {}, fakeEnv);
    expect(res.status).toBe(401);
  });
});
