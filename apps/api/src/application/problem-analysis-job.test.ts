// 何切るの写真AI再現の非同期ジョブ（photo-retention.md・[決定] 2026-08-03）。
// 送信時に解析下書き（problem_drafts）を先行作成し、写真を problems/{draftId}/{jobId}/ へ
// 恒久保存。解析完了で下書きに結果（Kifu）が入り、画面を閉じても消えない。
// 信頼ゲート: 結果は書く前も読む後も Zod 検証 / 課金は成功時のみ /
// 終端書き込み失敗は再送に乗せない（二重課金防止）。

import { describe, expect, it, vi } from "vitest";
import type { AnalysisInput } from "../domain/kifu/analyzer";
import {
  InMemoryAnalysisImageStore,
  InMemoryAnalysisJobRepository,
  InMemoryAnalysisQueue,
  InMemoryProblemDraftRepository,
} from "../test-support/in-memory-analysis";
import { validKifu } from "../test-support/kifu";
import type { AnalyzeProblemDraftResult } from "./analyze-problem-draft.usecase";
import {
  GetProblemAnalysisJob,
  RunProblemAnalysisJob,
  StartProblemAnalysisJob,
} from "./problem-analysis-job.usecase";
import { MAX_ANALYSIS_ATTEMPTS } from "./run-analysis-job.usecase";

const NOW = new Date("2026-08-03T10:00:00.000Z");
const IMG = { data: new ArrayBuffer(4), mimeType: "image/jpeg" };

function makeStart(over: { queueFails?: boolean; preflightNg?: boolean } = {}) {
  const jobs = new InMemoryAnalysisJobRepository();
  const drafts = new InMemoryProblemDraftRepository();
  const images = new InMemoryAnalysisImageStore();
  const queue = new InMemoryAnalysisQueue(over.queueFails ?? false);
  const preflight = vi.fn(() =>
    Promise.resolve(
      over.preflightNg
        ? ({ ok: false, reason: "quota_exceeded" } as const)
        : ({ ok: true } as const),
    ),
  );
  let n = 0;
  const uc = new StartProblemAnalysisJob({
    jobs,
    drafts,
    images,
    queue,
    analyze: { preflight },
    now: () => NOW,
    newId: () => `id-${++n}`, // id-1=draft, id-2=job
  });
  return { uc, jobs, drafts, images, queue, preflight };
}

describe("StartProblemAnalysisJob（解析下書きの先行作成）", () => {
  it("下書きを先行作成し、写真を problems/{draftId}/{jobId}/ へ入れてキューへ投入する", async () => {
    const { uc, jobs, drafts, images, queue } = makeStart();

    const result = await uc.start({
      userId: "u1",
      cameraBottomSeat: "east",
      handImage: IMG,
      riverImage: IMG,
    });

    expect(result).toEqual({ ok: true, jobId: "id-2", draftId: "id-1" });
    expect((await drafts.findForUser("id-1", "u1"))?.jobId).toBe("id-2"); // 先行作成
    expect((await jobs.findForUser("id-2", "u1"))?.gameId).toBeNull(); // 半荘は作らない
    expect(await images.get("problems/id-1/id-2/hand")).not.toBeNull();
    expect(await images.get("problems/id-1/id-2/river")).not.toBeNull();
    expect(queue.sent).toEqual([
      {
        kind: "problem",
        jobId: "id-2",
        userId: "u1",
        draftId: "id-1",
        cameraBottomSeat: "east",
        handKey: "problems/id-1/id-2/hand",
        riverKey: "problems/id-1/id-2/river",
      },
    ]);
  });

  it("河なし（任意）は riverKey を載せない", async () => {
    const { uc, queue } = makeStart();
    await uc.start({ userId: "u1", cameraBottomSeat: "south", handImage: IMG });
    expect(queue.sent[0]).not.toHaveProperty("riverKey");
  });

  it("プリフライトNG（枠切れ等）は何も永続化しない", async () => {
    const { uc, jobs, drafts, images, queue } = makeStart({ preflightNg: true });
    const result = await uc.start({ userId: "u1", cameraBottomSeat: "east", handImage: IMG });
    expect(result).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(jobs.jobs.size).toBe(0);
    expect(drafts.drafts.size).toBe(0);
    expect(images.size).toBe(0);
    expect(queue.sent).toHaveLength(0);
  });

  it("キュー投入に失敗したらジョブを failed に落として例外を伝える（下書きは「解析失敗」で見える）", async () => {
    const { uc, jobs, drafts } = makeStart({ queueFails: true });
    await expect(
      uc.start({ userId: "u1", cameraBottomSeat: "east", handImage: IMG }),
    ).rejects.toThrow();
    expect((await jobs.findForUser("id-2", "u1"))?.status).toBe("failed");
    expect(await drafts.findForUser("id-1", "u1")).not.toBeNull();
  });
});

const MESSAGE = {
  kind: "problem" as const,
  jobId: "job-1",
  userId: "u1",
  draftId: "d-1",
  cameraBottomSeat: "east" as const,
  handKey: "problems/d-1/job-1/hand",
  riverKey: "problems/d-1/job-1/river",
};

function makeRun(analyzeResult: AnalyzeProblemDraftResult | Error = { ok: true, kifu: validKifu }) {
  const jobs = new InMemoryAnalysisJobRepository();
  const drafts = new InMemoryProblemDraftRepository();
  const images = new InMemoryAnalysisImageStore();
  const execute = vi.fn((_params: { userId: string; input: AnalysisInput }) =>
    analyzeResult instanceof Error ? Promise.reject(analyzeResult) : Promise.resolve(analyzeResult),
  );
  const uc = new RunProblemAnalysisJob({
    jobs,
    drafts,
    images,
    analyze: { execute },
    now: () => NOW,
  });
  return { uc, jobs, drafts, images, execute };
}

async function seed(f: ReturnType<typeof makeRun>, withImages = true) {
  await f.jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
  await f.drafts.create({ id: "d-1", userId: "u1", jobId: "job-1", now: NOW });
  if (withImages) {
    await f.images.put(MESSAGE.handKey, IMG);
    await f.images.put(MESSAGE.riverKey, IMG);
  }
}

describe("RunProblemAnalysisJob（consumer）", () => {
  it("成功したら下書きへ結果を書いてから done にし、写真は消さない（恒久保存）", async () => {
    const f = makeRun();
    await seed(f);

    await f.uc.execute(MESSAGE, 1);

    expect((await f.jobs.findForUser("job-1", "u1"))?.status).toBe("done");
    expect((await f.drafts.findForUser("d-1", "u1"))?.kifu).toEqual(validKifu);
    expect(await f.images.get(MESSAGE.handKey)).not.toBeNull(); // 写真は残す
    expect(await f.images.get(MESSAGE.riverKey)).not.toBeNull();
    const input = f.execute.mock.calls[0]![0].input;
    expect(input.hands?.bottom).toBeDefined();
    expect(input.riverImage).toBeDefined();
  });

  it("写真が消えていたら failed(images_missing)（解析しない＝課金なし）", async () => {
    const f = makeRun();
    await seed(f, false);

    await f.uc.execute(MESSAGE, 1);

    expect((await f.jobs.findForUser("job-1", "u1"))?.reason).toBe("images_missing");
    expect(f.execute).not.toHaveBeenCalled();
  });

  it("解析の業務的失敗（枠切れ等）は failed に理由を写す（下書きは空のまま）", async () => {
    const f = makeRun({ ok: false, reason: "quota_exceeded" });
    await seed(f);

    await f.uc.execute(MESSAGE, 1);

    expect((await f.jobs.findForUser("job-1", "u1"))?.reason).toBe("quota_exceeded");
    expect((await f.drafts.findForUser("d-1", "u1"))?.kifu).toBeNull();
  });

  it("一過性の例外は attempts が残っていれば投げ返す（Queues の再送に任せる）", async () => {
    const f = makeRun(new Error("transient"));
    await seed(f);

    await expect(f.uc.execute(MESSAGE, 1)).rejects.toThrow("transient");
    expect((await f.jobs.findForUser("job-1", "u1"))?.status).toBe("processing");
  });

  it("最終試行の例外は failed(analysis_failed) に落として ack", async () => {
    const f = makeRun(new Error("permanent"));
    await seed(f);

    await f.uc.execute(MESSAGE, MAX_ANALYSIS_ATTEMPTS);

    expect((await f.jobs.findForUser("job-1", "u1"))?.reason).toBe("analysis_failed");
  });

  it("processing 以外のジョブは何もしない（遅延再送で二重実行しない）", async () => {
    const f = makeRun();
    await seed(f);
    await f.jobs.markFailed("job-1", { reason: "x", now: NOW });

    await f.uc.execute(MESSAGE, 2);

    expect(f.execute).not.toHaveBeenCalled();
  });

  it("終端書き込みの失敗は投げ返さない（再送→解析やり直し＝二重課金を防ぐ）", async () => {
    const f = makeRun();
    await seed(f);
    f.jobs.markDone = () => Promise.reject(new Error("d1 down"));

    await expect(f.uc.execute(MESSAGE, MAX_ANALYSIS_ATTEMPTS)).resolves.toBeUndefined();
  });
});

describe("GetProblemAnalysisJob", () => {
  async function makeGet() {
    const jobs = new InMemoryAnalysisJobRepository();
    const drafts = new InMemoryProblemDraftRepository();
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
    await drafts.create({ id: "d-1", userId: "u1", jobId: "job-1", now: NOW });
    return { uc: new GetProblemAnalysisJob(jobs, drafts), jobs, drafts };
  }

  it("done なら下書きの結果ドラフト（Zod 検証済み）と draftId を返す", async () => {
    const { uc, jobs, drafts } = await makeGet();
    await drafts.setKifu("d-1", { kifu: validKifu, now: NOW });
    await jobs.markDone("job-1", { gameId: null, logId: null, now: NOW });

    const view = await uc.execute("job-1", "u1");
    expect(view?.status).toBe("done");
    expect(view?.draft).toEqual(validKifu);
    expect(view?.draftId).toBe("d-1");
  });

  it("done でも下書きの結果が無い（破棄済み等）なら failed(result_expired)", async () => {
    const { uc, jobs } = await makeGet();
    await jobs.markDone("job-1", { gameId: null, logId: null, now: NOW });

    const view = await uc.execute("job-1", "u1");
    expect(view?.status).toBe("failed");
    expect(view?.reason).toBe("result_expired");
  });

  it("processing はドラフト無しで状態と draftId を返す", async () => {
    const { uc } = await makeGet();
    expect(await uc.execute("job-1", "u1")).toMatchObject({
      status: "processing",
      draft: null,
      draftId: "d-1",
    });
  });

  it("他人・不存在は null（所有者ガード）", async () => {
    const { uc } = await makeGet();
    expect(await uc.execute("job-1", "attacker")).toBeNull();
    expect(await uc.execute("missing", "u1")).toBeNull();
  });
});
