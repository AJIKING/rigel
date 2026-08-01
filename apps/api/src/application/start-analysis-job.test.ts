// 解析の非同期ジョブ化（docs/plans/async-analysis.md）。
// start: 同期検証 → 画像を一時ストア（R2）へ → ジョブ作成 → キュー投入 → jobId。
// 投入に失敗したらジョブを failed に落とし一時画像を削除する（宙に浮かせない）。

import { describe, expect, it } from "vitest";
import type { ImageRef } from "../domain/kifu/analyzer";
import { fakeImage } from "../test-support/image";
import {
  InMemoryAnalysisImageStore,
  InMemoryAnalysisJobRepository,
  InMemoryAnalysisQueue,
} from "../test-support/in-memory-analysis";
import { StartAnalysisJob } from "./start-analysis-job.usecase";

const NOW = new Date("2026-08-01T09:00:00.000Z");

function makeUsecase(opts: { preflightOk?: boolean; queueFails?: boolean } = {}) {
  const jobs = new InMemoryAnalysisJobRepository();
  const images = new InMemoryAnalysisImageStore();
  const queue = new InMemoryAnalysisQueue(opts.queueFails ?? false);
  let n = 0;
  const usecase = new StartAnalysisJob({
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
  });
  return { usecase, jobs, images, queue };
}

const river: ImageRef = fakeImage();
const params = {
  userId: "u1",
  cameraBottomSeat: "east" as const,
  riverImage: river,
  hands: { bottom: fakeImage() },
};

describe("StartAnalysisJob（R2 + Queue 版）", () => {
  it("同期検証 NG ならジョブも画像もキューも作らない", async () => {
    const { usecase, jobs, images, queue } = makeUsecase({ preflightOk: false });

    const result = await usecase.start(params);

    expect(result).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(jobs.jobs.size).toBe(0);
    expect(images.size).toBe(0);
    expect(queue.sent).toHaveLength(0);
  });

  it("検証を通れば 画像保存 → processing ジョブ → キュー投入 の順で行い jobId を返す", async () => {
    const { usecase, jobs, images, queue } = makeUsecase();

    const result = await usecase.start({ ...params, gameId: "g1" });

    expect(result).toEqual({ ok: true, jobId: "job-1" });
    expect(jobs.jobs.get("job-1")?.status).toBe("processing");
    expect(await images.get("jobs/job-1/river")).not.toBeNull();
    expect(await images.get("jobs/job-1/hand_bottom")).not.toBeNull();
    expect(queue.sent).toEqual([
      {
        jobId: "job-1",
        userId: "u1",
        gameId: "g1",
        cameraBottomSeat: "east",
        riverKey: "jobs/job-1/river",
        handKeys: { bottom: "jobs/job-1/hand_bottom" },
      },
    ]);
  });

  it("キュー投入に失敗したらジョブを failed に落とし一時画像を削除して例外を伝える", async () => {
    const { usecase, jobs, images } = makeUsecase({ queueFails: true });

    await expect(usecase.start(params)).rejects.toThrow();

    expect(jobs.jobs.get("job-1")?.status).toBe("failed");
    expect(jobs.jobs.get("job-1")?.reason).toBe("enqueue_failed");
    expect(images.size).toBe(0); // 消し漏れなし（保険の TTL に頼らない）
  });
});
