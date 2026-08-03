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

  it("新規なら半荘を先に作成し、画像は恒久キー（games/{gameId}/{jobId}/）へ入れて投入する", async () => {
    const { usecase, jobs, images, queue, games } = makeUsecase();

    const result = await usecase.start(params);

    expect(result).toEqual({ ok: true, jobId: "id-2", gameId: "id-1" });
    expect(await games.listByUser("u1")).toHaveLength(1); // 半荘先行作成
    expect(jobs.jobs.get("id-2")).toMatchObject({ status: "processing", gameId: "id-1" });
    // 画像は最初から恒久領域（半荘配下）。移動しない・完了しても消えない（photo-retention.md）。
    expect(await images.get("games/id-1/id-2/river")).not.toBeNull();
    expect(queue.sent[0]).toMatchObject({
      jobId: "id-2",
      userId: "u1",
      gameId: "id-1",
      riverKey: "games/id-1/id-2/river",
      handKeys: { bottom: "games/id-1/id-2/hand_bottom" },
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

  it("30分を超えた processing でも 409 のまま（表示の stale 降格でガードを緩めない）", async () => {
    const { usecase, jobs, games } = makeUsecase();
    await games.save({ id: "g1", userId: "u1", title: "", createdAt: NOW });
    await jobs.create({
      id: "j0",
      userId: "u1",
      gameId: "g1",
      now: new Date(NOW.getTime() - 60 * 60_000), // 1時間前から processing のまま
    });

    const result = await usecase.start({ ...params, gameId: "g1" });

    expect(result).toEqual({ ok: false, reason: "game_analyzing" });
  });

  it("画像アップロードに失敗したらジョブを failed に落とす（半荘は「解析失敗」で残る＝孤児画像なし）", async () => {
    // 行（ジョブ・半荘）を先に作ってからアップロードする順序（photo-retention.md）:
    // 失敗しても参照なしの画像が R2 に残ることが構造的にない。
    const { usecase, images, jobs, games } = makeUsecase();
    images.put = () => Promise.reject(new Error("R2 down"));

    await expect(usecase.start(params)).rejects.toThrow("R2 down");

    expect(await games.listByUser("u1")).toHaveLength(1); // 解析失敗ステータスで見える
    expect(jobs.jobs.get("id-2")?.status).toBe("failed");
  });

  it("再解析用にメッセージも半荘配下に置く（games/{gameId}/{jobId}/message.json。半荘と同じ寿命）", async () => {
    const { usecase, images, queue } = makeUsecase();

    await usecase.start({ ...params, handFromRiver: true });

    // キューへ送ったものと同じメッセージが message.json に残る（「もう一度解析」の材料）。
    expect(await images.getJson("games/id-1/id-2/message.json")).toEqual(queue.sent[0]);
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
    expect(images.size).toBe(3); // 画像2枚 + message.json は残す（半荘削除まで恒久）
  });
});
