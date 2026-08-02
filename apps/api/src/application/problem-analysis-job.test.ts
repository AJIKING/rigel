// 何切るの写真AI再現の非同期ジョブ化（docs/plans/async-analysis.md Task 8）。
// 結果は保存されないドラフト Kifu なので、R2 の result.json に置いて GET で返す
// （[決定] 2026-08-02 オーナー承認・案A。TTL 1日が保険）。
// 信頼ゲート: 結果は書く前も読む後も Zod（KifuSchema）検証 / 課金は execute 内の
// 成功時のみ加算 / 終端書き込み失敗は再送に乗せない（二重課金防止・牌譜ジョブと同じ）。

import { describe, expect, it, vi } from "vitest";
import type { AnalysisInput } from "../domain/kifu/analyzer";
import { analysisResultKey } from "../domain/analysis/analysis-transport";
import {
  InMemoryAnalysisImageStore,
  InMemoryAnalysisJobRepository,
  InMemoryAnalysisQueue,
} from "../test-support/in-memory-analysis";
import { validKifu } from "../test-support/kifu";
import type { AnalyzeProblemDraftResult } from "./analyze-problem-draft.usecase";
import {
  GetProblemAnalysisJob,
  RunProblemAnalysisJob,
  StartProblemAnalysisJob,
} from "./problem-analysis-job.usecase";
import { MAX_ANALYSIS_ATTEMPTS } from "./run-analysis-job.usecase";

const NOW = new Date("2026-08-02T10:00:00.000Z");
const IMG = { data: new ArrayBuffer(4), mimeType: "image/jpeg" };

function makeStart(over: { queueFails?: boolean; preflightNg?: boolean } = {}) {
  const jobs = new InMemoryAnalysisJobRepository();
  const images = new InMemoryAnalysisImageStore();
  const queue = new InMemoryAnalysisQueue(over.queueFails ?? false);
  const preflight = vi.fn(() =>
    Promise.resolve(
      over.preflightNg
        ? ({ ok: false, reason: "quota_exceeded" } as const)
        : ({ ok: true } as const),
    ),
  );
  const uc = new StartProblemAnalysisJob({
    jobs,
    images,
    queue,
    analyze: { preflight },
    now: () => NOW,
    newId: () => "job-1",
  });
  return { uc, jobs, images, queue, preflight };
}

describe("StartProblemAnalysisJob", () => {
  it("画像をR2へ置き、gameId 無しのジョブを作り、problem メッセージをキューへ送る", async () => {
    const { uc, jobs, images, queue } = makeStart();

    const result = await uc.start({
      userId: "u1",
      cameraBottomSeat: "east",
      handImage: IMG,
      riverImage: IMG,
    });

    expect(result).toEqual({ ok: true, jobId: "job-1" });
    expect((await jobs.findForUser("job-1", "u1"))?.gameId).toBeNull(); // 半荘は作らない
    expect(await images.get("jobs/job-1/hand")).not.toBeNull();
    expect(await images.get("jobs/job-1/river")).not.toBeNull();
    expect(queue.sent).toEqual([
      {
        kind: "problem",
        jobId: "job-1",
        userId: "u1",
        cameraBottomSeat: "east",
        handKey: "jobs/job-1/hand",
        riverKey: "jobs/job-1/river",
      },
    ]);
  });

  it("河なし（任意）は riverKey を載せない", async () => {
    const { uc, queue } = makeStart();
    await uc.start({ userId: "u1", cameraBottomSeat: "south", handImage: IMG });
    expect(queue.sent[0]).not.toHaveProperty("riverKey");
  });

  it("プリフライトNG（枠切れ等）は何も永続化しない", async () => {
    const { uc, jobs, images, queue } = makeStart({ preflightNg: true });
    const result = await uc.start({ userId: "u1", cameraBottomSeat: "east", handImage: IMG });
    expect(result).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(jobs.jobs.size).toBe(0);
    expect(images.size).toBe(0);
    expect(queue.sent).toHaveLength(0);
  });

  it("キュー投入に失敗したらジョブを failed に落として例外を伝える（宙に浮かせない）", async () => {
    const { uc, jobs } = makeStart({ queueFails: true });
    await expect(
      uc.start({ userId: "u1", cameraBottomSeat: "east", handImage: IMG }),
    ).rejects.toThrow();
    expect((await jobs.findForUser("job-1", "u1"))?.status).toBe("failed");
  });
});

const MESSAGE = {
  kind: "problem" as const,
  jobId: "job-1",
  userId: "u1",
  cameraBottomSeat: "east" as const,
  handKey: "jobs/job-1/hand",
  riverKey: "jobs/job-1/river",
};

function makeRun(analyzeResult: AnalyzeProblemDraftResult | Error = { ok: true, kifu: validKifu }) {
  const jobs = new InMemoryAnalysisJobRepository();
  const images = new InMemoryAnalysisImageStore();
  const execute = vi.fn((_params: { userId: string; input: AnalysisInput }) =>
    analyzeResult instanceof Error ? Promise.reject(analyzeResult) : Promise.resolve(analyzeResult),
  );
  const uc = new RunProblemAnalysisJob({ jobs, images, analyze: { execute }, now: () => NOW });
  return { uc, jobs, images, execute };
}

describe("RunProblemAnalysisJob（consumer）", () => {
  it("成功したら result.json を書いてから done にし、画像だけ消して結果は残す", async () => {
    const { uc, jobs, images, execute } = makeRun();
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
    await images.put(MESSAGE.handKey, IMG);
    await images.put(MESSAGE.riverKey, IMG);

    await uc.execute(MESSAGE, 1);

    const job = await jobs.findForUser("job-1", "u1");
    expect(job).toMatchObject({ status: "done", gameId: null, logId: null });
    expect(await images.getJson(analysisResultKey("job-1"))).toEqual(validKifu);
    expect(await images.get(MESSAGE.handKey)).toBeNull(); // 画像は消す
    expect(await images.get(MESSAGE.riverKey)).toBeNull();
    // 解析入力は手牌（bottom）＋河。
    const input = execute.mock.calls[0]![0].input;
    expect(input.hands?.bottom).toBeDefined();
    expect(input.riverImage).toBeDefined();
    expect(input.cameraBottomSeat).toBe("east");
  });

  it("手牌画像が消えていたら failed(images_missing) にして掃除する（解析しない＝課金なし）", async () => {
    const { uc, jobs, execute } = makeRun();
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });

    await uc.execute(MESSAGE, 1);

    expect((await jobs.findForUser("job-1", "u1"))?.reason).toBe("images_missing");
    expect(execute).not.toHaveBeenCalled();
  });

  it("解析の業務的失敗（枠切れ等）は failed に理由を写す", async () => {
    const { uc, jobs, images } = makeRun({ ok: false, reason: "quota_exceeded" });
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
    await images.put(MESSAGE.handKey, IMG);

    await uc.execute(MESSAGE, 1);

    expect((await jobs.findForUser("job-1", "u1"))?.reason).toBe("quota_exceeded");
  });

  it("一過性の例外は attempts が残っていれば投げ返す（Queues の再送に任せる）", async () => {
    const { uc, jobs, images } = makeRun(new Error("transient"));
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
    await images.put(MESSAGE.handKey, IMG);

    await expect(uc.execute(MESSAGE, 1)).rejects.toThrow("transient");
    expect((await jobs.findForUser("job-1", "u1"))?.status).toBe("processing");
    expect(await images.get(MESSAGE.handKey)).not.toBeNull(); // 画像は再送用に残す
  });

  it("最終試行の例外は failed(analysis_failed) に落として ack（無限再送にしない）", async () => {
    const { uc, jobs, images } = makeRun(new Error("permanent"));
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
    await images.put(MESSAGE.handKey, IMG);

    await uc.execute(MESSAGE, MAX_ANALYSIS_ATTEMPTS);

    expect((await jobs.findForUser("job-1", "u1"))?.reason).toBe("analysis_failed");
  });

  it("processing 以外のジョブは何もしない（遅延再送で二重実行しない）", async () => {
    const { uc, jobs, images, execute } = makeRun();
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
    await jobs.markFailed("job-1", { reason: "x", now: NOW });
    await images.put(MESSAGE.handKey, IMG);

    await uc.execute(MESSAGE, 2);

    expect(execute).not.toHaveBeenCalled();
  });

  it("終端書き込みの失敗は投げ返さない（再送→解析やり直し＝二重課金を防ぐ）", async () => {
    const { jobs, images } = makeRun();
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
    await images.put(MESSAGE.handKey, IMG);
    jobs.markDone = () => Promise.reject(new Error("d1 down"));
    const uc = new RunProblemAnalysisJob({
      jobs,
      images,
      analyze: { execute: () => Promise.resolve({ ok: true, kifu: validKifu }) },
      now: () => NOW,
    });

    await expect(uc.execute(MESSAGE, MAX_ANALYSIS_ATTEMPTS)).resolves.toBeUndefined();
  });
});

describe("GetProblemAnalysisJob", () => {
  async function makeGet() {
    const jobs = new InMemoryAnalysisJobRepository();
    const images = new InMemoryAnalysisImageStore();
    await jobs.create({ id: "job-1", userId: "u1", gameId: null, now: NOW });
    return { uc: new GetProblemAnalysisJob(jobs, images), jobs, images };
  }

  it("done なら R2 の結果ドラフトを Zod 検証して返す", async () => {
    const { uc, jobs, images } = await makeGet();
    await images.putJson(analysisResultKey("job-1"), validKifu);
    await jobs.markDone("job-1", { gameId: null, logId: null, now: NOW });

    const view = await uc.execute("job-1", "u1");
    expect(view?.status).toBe("done");
    expect(view?.draft).toEqual(validKifu);
  });

  it("done でも結果が消えていたら（TTL 1日）failed(result_expired) として返す", async () => {
    const { uc, jobs } = await makeGet();
    await jobs.markDone("job-1", { gameId: null, logId: null, now: NOW });

    const view = await uc.execute("job-1", "u1");
    expect(view?.status).toBe("failed");
    expect(view?.reason).toBe("result_expired");
    expect(view?.draft).toBeNull();
  });

  it("processing はドラフト無しで状態だけ返す", async () => {
    const { uc } = await makeGet();
    expect(await uc.execute("job-1", "u1")).toMatchObject({ status: "processing", draft: null });
  });

  it("他人・不存在は null（所有者ガード）", async () => {
    const { uc } = await makeGet();
    expect(await uc.execute("job-1", "attacker")).toBeNull();
    expect(await uc.execute("missing", "u1")).toBeNull();
  });
});
