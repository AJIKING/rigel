// Phase 2「もう一度解析」（async-analysis.md 8-3）。失敗ジョブの一時画像と message.json は
// R2 に残っている（TTL 1日）ので、再アップロード無しで同じメッセージを再 enqueue する。
// 信頼ゲート: 枠は再チェック（preflight）/ 同じ半荘の processing とは並走させない（409）/
// 期限切れ（R2 が消えた）は retry_expired で正直に断る。

import { describe, expect, it, vi } from "vitest";
import {
  analysisJobPrefix,
  analysisMessageKey,
  type KifuAnalysisJobMessage,
} from "../domain/analysis/analysis-transport";
import { fakeImage } from "../test-support/image";
import {
  InMemoryAnalysisImageStore,
  InMemoryAnalysisJobRepository,
  InMemoryAnalysisQueue,
} from "../test-support/in-memory-analysis";
import { RetryAnalysisJob } from "./retry-analysis-job.usecase";

const NOW = new Date("2026-08-02T12:00:00.000Z");

const MESSAGE: KifuAnalysisJobMessage = {
  jobId: "job-1",
  userId: "u1",
  gameId: "g1",
  cameraBottomSeat: "east",
  riverKey: "jobs/job-1/river",
  handKeys: {},
};

async function make(opts: { preflightOk?: boolean; queueFails?: boolean } = {}) {
  const jobs = new InMemoryAnalysisJobRepository();
  const images = new InMemoryAnalysisImageStore();
  const queue = new InMemoryAnalysisQueue(opts.queueFails ?? false);
  const preflight = vi.fn((_userId: string, _gameId?: string) =>
    Promise.resolve(
      opts.preflightOk === false
        ? ({ ok: false, reason: "quota_exceeded" } as const)
        : ({ ok: true } as const),
    ),
  );
  const uc = new RetryAnalysisJob({ jobs, images, queue, analyze: { preflight }, now: () => NOW });

  // 既定の下ごしらえ: 失敗ジョブ + 残っている画像 + message.json
  await jobs.create({ id: "job-1", userId: "u1", gameId: "g1", now: NOW });
  await jobs.markFailed("job-1", { reason: "analysis_failed", now: NOW });
  await images.put(MESSAGE.riverKey, fakeImage());
  await images.putJson(analysisMessageKey("job-1"), MESSAGE);

  return { uc, jobs, images, queue, preflight };
}

describe("RetryAnalysisJob（もう一度解析）", () => {
  it("失敗ジョブを processing に戻し、保存済みメッセージをそのまま再 enqueue する", async () => {
    const { uc, jobs, queue, preflight } = await make();

    const result = await uc.execute({ userId: "u1", jobId: "job-1" });

    expect(result).toEqual({ ok: true, jobId: "job-1", gameId: "g1" });
    const job = await jobs.findForUser("job-1", "u1");
    expect(job?.status).toBe("processing");
    expect(job?.reason).toBeNull(); // 前回の失敗理由を引きずらない
    expect(queue.sent).toEqual([MESSAGE]);
    expect(preflight).toHaveBeenCalledWith("u1", "g1"); // 枠・半荘上限の再チェック
  });

  it("他人のジョブ・不存在は not_found（存在を漏らさない）", async () => {
    const { uc } = await make();
    expect(await uc.execute({ userId: "attacker", jobId: "job-1" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await uc.execute({ userId: "u1", jobId: "missing" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("failed 以外（processing/done）はやり直せない（not_failed。二重実行を作らない）", async () => {
    const { uc, jobs, queue } = await make();
    await jobs.markProcessing("job-1", { now: NOW });

    const result = await uc.execute({ userId: "u1", jobId: "job-1" });

    expect(result).toEqual({ ok: false, reason: "not_failed" });
    expect(queue.sent).toHaveLength(0);
  });

  it("R2 の message.json や画像が消えていたら（TTL 1日超）retry_expired", async () => {
    const { uc, images, jobs } = await make();
    await images.deletePrefix(analysisJobPrefix("job-1"));

    const result = await uc.execute({ userId: "u1", jobId: "job-1" });

    expect(result).toEqual({ ok: false, reason: "retry_expired" });
    expect((await jobs.findForUser("job-1", "u1"))?.status).toBe("failed"); // 状態は変えない
  });

  it("画像だけ消えていても retry_expired（consumer で images_missing に落とすより手前で断る）", async () => {
    const { uc, images } = await make();
    await images.delete(MESSAGE.riverKey);

    expect(await uc.execute({ userId: "u1", jobId: "job-1" })).toEqual({
      ok: false,
      reason: "retry_expired",
    });
  });

  it("枠の再チェック NG（当月上限など）はその理由で断り、状態を変えない", async () => {
    const { uc, jobs, queue } = await make({ preflightOk: false });

    const result = await uc.execute({ userId: "u1", jobId: "job-1" });

    expect(result).toEqual({ ok: false, reason: "quota_exceeded" });
    expect((await jobs.findForUser("job-1", "u1"))?.status).toBe("failed");
    expect(queue.sent).toHaveLength(0);
  });

  it("同じ半荘に別の processing ジョブがあるうちは game_analyzing（二局作成の根治と同じガード）", async () => {
    const { uc, jobs } = await make();
    await jobs.create({ id: "job-2", userId: "u1", gameId: "g1", now: NOW }); // processing

    expect(await uc.execute({ userId: "u1", jobId: "job-1" })).toEqual({
      ok: false,
      reason: "game_analyzing",
    });
  });

  it("キュー投入に失敗したら failed に戻して例外を伝える（processing で宙に浮かせない）", async () => {
    const { uc, jobs } = await make({ queueFails: true });

    await expect(uc.execute({ userId: "u1", jobId: "job-1" })).rejects.toThrow();
    expect((await jobs.findForUser("job-1", "u1"))?.status).toBe("failed");
  });
});
