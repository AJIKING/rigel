// 解析の非同期ジョブ化のルート契約（docs/plans/async-analysis.md・R2 + Queues 構成）。
// POST /analyze は同期検証 → 画像を一時ストアへ → ジョブ作成 → キュー投入 → 202 + jobId。
// GET /analyze/jobs/:id は所有者だけが状態を見られる（他人・不存在は 404）。

import { describe, expect, it } from "vitest";
import { GetAnalysisJob, StartAnalysisJob } from "../../application/start-analysis-job.usecase";
import type { AppContainer } from "../../composition-root";
import { JwtSessionService } from "../../infrastructure/auth/jwt-session-service";
import { fakeEnv } from "../../test-support/billing";
import {
  InMemoryAnalysisImageStore,
  InMemoryAnalysisJobRepository,
  InMemoryAnalysisQueue,
} from "../../test-support/in-memory-analysis";
import { createApp } from "./app";

const NOW = new Date("2026-08-01T09:00:00.000Z");
const session = new JwtSessionService({ secret: "test-secret" });

function makeApp(opts: { preflightOk?: boolean } = {}) {
  const jobs = new InMemoryAnalysisJobRepository();
  const images = new InMemoryAnalysisImageStore();
  const queue = new InMemoryAnalysisQueue();
  let n = 0;
  const container = {
    session,
    analyzeAndSaveKifu: {
      preflight: () =>
        Promise.resolve(
          opts.preflightOk === false
            ? ({ ok: false, reason: "quota_exceeded" } as const)
            : ({ ok: true } as const),
        ),
    },
    startAnalysisJob: new StartAnalysisJob({
      jobs,
      images,
      queue,
      analyze: {
        preflight: () =>
          Promise.resolve(
            opts.preflightOk === false
              ? ({ ok: false, reason: "quota_exceeded" } as const)
              : ({ ok: true } as const),
          ),
      },
      now: () => NOW,
      newId: () => `job-${++n}`,
    }),
    getAnalysisJob: new GetAnalysisJob(jobs),
  } as unknown as AppContainer;
  return { app: createApp({ container: () => container }), jobs, images, queue };
}

async function bearer(userId: string) {
  return { authorization: `Bearer ${await session.issue(userId)}` };
}

function analyzeForm() {
  const form = new FormData();
  form.set("river", new File([new Uint8Array(100)], "river.jpg", { type: "image/jpeg" }));
  form.set("cameraBottomSeat", "east");
  return form;
}

describe("POST /analyze の 1枚モード（handFromRiver）", () => {
  it("フォームの handFromRiver=true がキューのメッセージへ伝わる", async () => {
    const { app, queue } = makeApp();
    const form = analyzeForm();
    form.set("handFromRiver", "true");

    const res = await app.request(
      "/analyze",
      { method: "POST", headers: await bearer("u1"), body: form },
      fakeEnv,
    );

    expect(res.status).toBe(202);
    expect(queue.sent[0]).toMatchObject({ handFromRiver: true });
  });

  it("フラグ無しのメッセージには handFromRiver を載せない", async () => {
    const { app, queue } = makeApp();

    await app.request(
      "/analyze",
      { method: "POST", headers: await bearer("u1"), body: analyzeForm() },
      fakeEnv,
    );

    expect("handFromRiver" in (queue.sent[0] ?? {})).toBe(false);
  });
});

describe("POST /analyze（202 + jobId）", () => {
  it("検証を通れば 202 で jobId を返し、画像を一時保存してキューへ投入する", async () => {
    const { app, jobs, images, queue } = makeApp();

    const res = await app.request(
      "/analyze",
      { method: "POST", headers: await bearer("u1"), body: analyzeForm() },
      fakeEnv,
    );

    expect(res.status).toBe(202);
    const body = (await res.json()) as { ok: boolean; jobId: string };
    expect(body).toEqual({ ok: true, jobId: "job-1" });
    expect(jobs.jobs.get("job-1")?.status).toBe("processing");
    expect(await images.get("jobs/job-1/river")).not.toBeNull();
    expect(queue.sent).toHaveLength(1);
    expect(queue.sent[0]).toMatchObject({ jobId: "job-1", userId: "u1", cameraBottomSeat: "east" });
  });

  it("枠不足は従来どおり同期の 402（ジョブも画像も作らない）", async () => {
    const { app, jobs, images, queue } = makeApp({ preflightOk: false });

    const res = await app.request(
      "/analyze",
      { method: "POST", headers: await bearer("u1"), body: analyzeForm() },
      fakeEnv,
    );

    expect(res.status).toBe(402);
    expect(jobs.jobs.size).toBe(0);
    expect(images.size).toBe(0);
    expect(queue.sent).toHaveLength(0);
  });
});

describe("GET /analyze/jobs/:id", () => {
  it("トークン無しは 401", async () => {
    const { app } = makeApp();
    const res = await app.request("/analyze/jobs/job-1", {}, fakeEnv);
    expect(res.status).toBe(401);
  });

  it("他人のジョブ・不存在は 404（存在を漏らさない）", async () => {
    const { app, jobs } = makeApp();
    await jobs.create({ id: "job-1", userId: "owner", now: NOW });

    const other = await app.request(
      "/analyze/jobs/job-1",
      { headers: await bearer("attacker") },
      fakeEnv,
    );
    const missing = await app.request(
      "/analyze/jobs/missing",
      { headers: await bearer("owner") },
      fakeEnv,
    );

    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
  });

  it("所有者はジョブ状態を取得できる（userId は返さない）", async () => {
    const { app, jobs } = makeApp();
    await jobs.create({ id: "job-1", userId: "owner", now: NOW });

    const res = await app.request(
      "/analyze/jobs/job-1",
      { headers: await bearer("owner") },
      fakeEnv,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: "job-1", status: "processing", gameId: null, logId: null });
    expect("userId" in body).toBe(false);
  });
});
