// 解析ジョブの consumer 側（docs/plans/async-analysis.md）。
// キューのメッセージから一時画像を取り、既存パイプライン（AnalyzeAndSaveKifu.execute）を
// 実行してジョブ状態へ写す。終端（done/failed）では一時画像を必ず削除する。
// 一過性の例外は attempts が尽きるまで再送（throw）し、尽きたら failed に落として ack。

import { describe, expect, it } from "vitest";
import type { GameLog } from "../domain/kifu/game-log";
import { fakeImage } from "../test-support/image";
import {
  InMemoryAnalysisImageStore,
  InMemoryAnalysisJobRepository,
} from "../test-support/in-memory-analysis";
import type { AnalyzeResult } from "./analyze-and-save-kifu.usecase";
import { MAX_ANALYSIS_ATTEMPTS, RunAnalysisJob } from "./run-analysis-job.usecase";

const NOW = new Date("2026-08-01T09:00:00.000Z");
const gameLog = { id: "log-1", gameId: "g1" } as unknown as GameLog;

const message = {
  jobId: "job-1",
  userId: "u1",
  cameraBottomSeat: "east" as const,
  riverKey: "jobs/job-1/river",
  handKeys: { bottom: "jobs/job-1/hand_bottom" } as const,
};

async function makeFixture(execute: () => Promise<AnalyzeResult>) {
  const jobs = new InMemoryAnalysisJobRepository();
  const images = new InMemoryAnalysisImageStore();
  await jobs.create({ id: "job-1", userId: "u1", now: NOW });
  await images.put("jobs/job-1/river", fakeImage());
  await images.put("jobs/job-1/hand_bottom", fakeImage());
  const captured: unknown[] = [];
  const usecase = new RunAnalysisJob({
    jobs,
    images,
    analyze: {
      execute: (params: unknown) => {
        captured.push(params);
        return execute();
      },
    } as never,
    now: () => NOW,
  });
  return { usecase, jobs, images, captured };
}

describe("RunAnalysisJob", () => {
  it("成功でジョブが done になり、一時画像を削除する", async () => {
    const { usecase, jobs, images, captured } = await makeFixture(() =>
      Promise.resolve({ ok: true, gameLog, gameId: "g1" }),
    );

    await usecase.execute(message, 1);

    expect(jobs.jobs.get("job-1")).toMatchObject({ status: "done", gameId: "g1", logId: "log-1" });
    expect(images.size).toBe(0);
    // 画像は R2 から取り直してパイプラインへ渡す。
    expect(captured[0]).toMatchObject({
      userId: "u1",
      input: { cameraBottomSeat: "east" },
    });
  });

  it("reason 付き失敗は failed + reason になり、一時画像を削除する（再送しない）", async () => {
    const { usecase, jobs, images } = await makeFixture(() =>
      Promise.resolve({ ok: false, reason: "game_full" }),
    );

    await usecase.execute(message, 1);

    expect(jobs.jobs.get("job-1")).toMatchObject({ status: "failed", reason: "game_full" });
    expect(images.size).toBe(0);
  });

  it("一時画像が消えていたら failed(images_missing)（TTL 削除後の遅延再送に耐える）", async () => {
    const { usecase, jobs, images } = await makeFixture(() =>
      Promise.resolve({ ok: true, gameLog, gameId: "g1" }),
    );
    await images.deletePrefix("jobs/job-1/");

    await usecase.execute(message, 1);

    expect(jobs.jobs.get("job-1")).toMatchObject({ status: "failed", reason: "images_missing" });
  });

  it("例外は attempts が残っていれば投げ返す（Queues の再送に任せ、画像は残す）", async () => {
    const { usecase, jobs, images } = await makeFixture(() =>
      Promise.reject(new Error("Gemini API error: 500")),
    );

    await expect(usecase.execute(message, 1)).rejects.toThrow(/500/);

    expect(jobs.jobs.get("job-1")?.status).toBe("processing");
    expect(images.size).toBe(2); // 再送で使うので消さない
  });

  it("最終試行の例外は failed(analysis_failed) に落として ack（画像は削除）", async () => {
    const { usecase, jobs, images } = await makeFixture(() =>
      Promise.reject(new Error("Gemini API error: 500")),
    );

    await expect(usecase.execute(message, MAX_ANALYSIS_ATTEMPTS)).resolves.toBeUndefined();

    expect(jobs.jobs.get("job-1")).toMatchObject({ status: "failed", reason: "analysis_failed" });
    expect(images.size).toBe(0);
  });

  it("processing でないジョブ・不明なジョブは何もしない（再送との競合で二重実行しない）", async () => {
    const { usecase, jobs, captured } = await makeFixture(() =>
      Promise.resolve({ ok: true, gameLog, gameId: "g1" }),
    );
    await jobs.markDone("job-1", { gameId: "g0", logId: "l0", now: NOW });

    await usecase.execute(message, 1);
    await usecase.execute({ ...message, jobId: "missing" }, 1);

    expect(captured).toHaveLength(0);
    expect(jobs.jobs.get("job-1")?.gameId).toBe("g0"); // 上書きされない
  });
});
