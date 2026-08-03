// 半荘の元写真（恒久保存。photo-retention.md）の一覧・取得ユースケース。
// 信頼ゲート: 閲覧は所有者のみ（公開半荘でも写真は露出しない）。他人・不存在は null=404。

import { describe, expect, it } from "vitest";
import { gameJobMessageKey } from "../domain/analysis/analysis-transport";
import { fakeImage } from "../test-support/image";
import { InMemoryGameRepository } from "../test-support/in-memory";
import { InMemoryAnalysisImageStore } from "../test-support/in-memory-analysis";
import { GetGamePhoto, ListGamePhotos } from "./game-photos.usecase";

const NOW = new Date("2026-08-03T00:00:00.000Z");

async function make() {
  const games = new InMemoryGameRepository([
    { id: "g1", userId: "u1", title: "", createdAt: NOW },
    // 公開状態は半荘の可視性に依存しない（写真は常に所有者のみ）。
  ]);
  const images = new InMemoryAnalysisImageStore();
  await images.put("games/g1/job-1/river", fakeImage());
  await images.put("games/g1/job-1/hand_bottom", fakeImage());
  await images.put("games/g1/job-2/river", fakeImage());
  await images.putJson(gameJobMessageKey("g1", "job-1"), { jobId: "job-1" }); // 控えは写真ではない
  return { list: new ListGamePhotos(games, images), get: new GetGamePhoto(games, images), images };
}

describe("ListGamePhotos", () => {
  it("所有者には写真（jobId + kind）を返し、message.json は混ぜない", async () => {
    const { list } = await make();

    const photos = await list.execute("g1", "u1");

    expect(photos).toEqual([
      { jobId: "job-1", kind: "hand_bottom" },
      { jobId: "job-1", kind: "river" },
      { jobId: "job-2", kind: "river" },
    ]);
  });

  it("他人・未ログイン・不存在の半荘は null（存在を漏らさない）", async () => {
    const { list } = await make();
    expect(await list.execute("g1", "attacker")).toBeNull();
    expect(await list.execute("g1", null)).toBeNull();
    expect(await list.execute("missing", "u1")).toBeNull();
  });
});

describe("GetGamePhoto", () => {
  it("所有者には画像バイト（contentType 付き）を返す", async () => {
    const { get } = await make();

    const photo = await get.execute({
      gameId: "g1",
      jobId: "job-1",
      kind: "river",
      viewerId: "u1",
    });

    expect(photo?.mimeType).toBeTruthy();
    expect(photo?.data).toBeDefined();
  });

  it("他人には null（所有者ガード）・無い写真も null", async () => {
    const { get } = await make();
    expect(
      await get.execute({ gameId: "g1", jobId: "job-1", kind: "river", viewerId: "attacker" }),
    ).toBeNull();
    expect(
      await get.execute({ gameId: "g1", jobId: "job-9", kind: "river", viewerId: "u1" }),
    ).toBeNull();
  });
});
