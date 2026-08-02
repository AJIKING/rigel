// 解析の非同期ジョブ化（docs/plans/async-analysis.md 8-3 半荘先行作成）。
// start: 同期検証 → 半荘を先に作成（既存指定ならそれ）→ 画像を R2 → ジョブ作成
//        （gameId 紐付き）→ キュー投入 → jobId + gameId。
// 同じ半荘に processing のジョブがあれば game_analyzing（二局作成の根治）。
// 投入失敗はジョブを failed に落とす（画像はリトライ用に残す＝TTL任せ）。

import { describe, expect, it } from "vitest";
import type { ImageRef } from "../domain/kifu/analyzer";
import { fakeImage } from "../test-support/image";
import { InMemoryGameRepository } from "../test-support/in-memory";
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
  const games = new InMemoryGameRepository();
  let n = 0;
  const usecase = new StartAnalysisJob({
    jobs,
    images,
    queue,
    games,
    analyze: {
      preflight: () =>
        Promise.resolve(
          opts.preflightOk === false
            ? ({ ok: false, reason: "quota_exceeded" } as const)
            : ({ ok: true } as const),
        ),
    },
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
  return { usecase, jobs, images, queue, games };
}

const river: ImageRef = fakeImage();
const params = {
  userId: "u1",
  cameraBottomSeat: "east" as const,
  riverImage: river,
  hands: { bottom: fakeImage() },
};

describe("StartAnalysisJob（半荘先行作成 + R2 + Queue）", () => {
  it("同期検証 NG なら半荘もジョブも画像もキューも作らない", async () => {
    const { usecase, jobs, images, queue, games } = makeUsecase({ preflightOk: false });

    const result = await usecase.start(params);

    expect(result).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(jobs.jobs.size).toBe(0);
    expect(images.size).toBe(0);
    expect(queue.sent).toHaveLength(0);
    expect(await games.listByUser("u1")).toHaveLength(0);
  });

  it("新規なら半荘を先に作成し、gameId 紐付きのジョブ → キュー投入 → jobId+gameId を返す", async () => {
    const { usecase, jobs, images, queue, games } = makeUsecase();

    const result = await usecase.start(params);

    expect(result).toEqual({ ok: true, jobId: "id-2", gameId: "id-1" });
    expect(await games.listByUser("u1")).toHaveLength(1); // 半荘先行作成
    expect(jobs.jobs.get("id-2")).toMatchObject({ status: "processing", gameId: "id-1" });
    expect(await images.get("jobs/id-2/river")).not.toBeNull();
    expect(queue.sent[0]).toMatchObject({
      jobId: "id-2",
      userId: "u1",
      gameId: "id-1",
      riverKey: "jobs/id-2/river",
      handKeys: { bottom: "jobs/id-2/hand_bottom" },
    });
  });

  it("既存半荘に processing のジョブがあるうちは game_analyzing（二局作成の根治）", async () => {
    const { usecase, jobs, games } = makeUsecase();
    await games.save({ id: "g1", userId: "u1", title: "", createdAt: NOW });
    await jobs.create({ id: "j0", userId: "u1", gameId: "g1", now: NOW });

    const result = await usecase.start({ ...params, gameId: "g1" });

    expect(result).toEqual({ ok: false, reason: "game_analyzing" });
    expect(jobs.jobs.size).toBe(1); // 新しいジョブは作らない
  });

  it("既存半荘の直近ジョブが終端（done/failed）なら受け付ける", async () => {
    const { usecase, jobs, games } = makeUsecase();
    await games.save({ id: "g1", userId: "u1", title: "", createdAt: NOW });
    await jobs.create({ id: "j0", userId: "u1", gameId: "g1", now: NOW });
    await jobs.markFailed("j0", { reason: "analysis_failed", now: NOW });

    const result = await usecase.start({ ...params, gameId: "g1" });

    expect(result).toMatchObject({ ok: true, gameId: "g1" });
  });

  it("キュー投入に失敗したらジョブを failed に落として例外を伝える（画像はリトライ用に残す）", async () => {
    const { usecase, jobs, images } = makeUsecase({ queueFails: true });

    await expect(usecase.start(params)).rejects.toThrow();

    expect(jobs.jobs.get("id-2")?.status).toBe("failed");
    expect(jobs.jobs.get("id-2")?.reason).toBe("enqueue_failed");
    expect(images.size).toBe(2); // 画像は残す（掃除は R2 ライフサイクル1日）
  });
});
