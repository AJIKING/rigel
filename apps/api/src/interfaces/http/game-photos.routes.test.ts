// 半荘の元写真ルートの契約（photo-retention.md）。
// 一覧・配信とも所有者のみ（公開半荘でも露出しない）。他人・不存在・不正 kind は 404。

import { describe, expect, it } from "vitest";
import { GetGamePhoto, ListGamePhotos } from "../../application/game-photos.usecase";
import type { AppContainer } from "../../composition-root";
import { JwtSessionService } from "../../infrastructure/auth/jwt-session-service";
import { fakeEnv } from "../../test-support/billing";
import { InMemoryGameRepository } from "../../test-support/in-memory";
import { InMemoryAnalysisImageStore } from "../../test-support/in-memory-analysis";
import { createApp } from "./app";

const NOW = new Date("2026-08-03T00:00:00.000Z");
const session = new JwtSessionService({ secret: "test-secret" });

async function makeApp() {
  const games = new InMemoryGameRepository([
    { id: "g1", userId: "owner", title: "", createdAt: NOW },
  ]);
  const images = new InMemoryAnalysisImageStore();
  await images.put("games/g1/job-1/river", { data: new ArrayBuffer(8), mimeType: "image/png" });
  const container = {
    session,
    listGamePhotos: new ListGamePhotos(games, images),
    getGamePhoto: new GetGamePhoto(games, images),
  } as unknown as AppContainer;
  return { app: createApp({ container: () => container }) };
}

async function bearer(userId: string) {
  return { authorization: `Bearer ${await session.issue(userId)}` };
}

describe("GET /games/:id/photos（元写真の一覧）", () => {
  it("所有者には jobId + kind の一覧を返す", async () => {
    const { app } = await makeApp();
    const res = await app.request("/games/g1/photos", { headers: await bearer("owner") }, fakeEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ photos: [{ jobId: "job-1", kind: "river" }] });
  });

  it("他人は 404・未認証は 401", async () => {
    const { app } = await makeApp();
    const other = await app.request(
      "/games/g1/photos",
      { headers: await bearer("attacker") },
      fakeEnv,
    );
    expect(other.status).toBe(404);
    expect((await app.request("/games/g1/photos", {}, fakeEnv)).status).toBe(401);
  });
});

describe("GET /games/:id/photos/:jobId/:kind（元写真の配信）", () => {
  it("所有者には contentType 付きのバイトを返す（private キャッシュ）", async () => {
    const { app } = await makeApp();
    const res = await app.request(
      "/games/g1/photos/job-1/river",
      { headers: await bearer("owner") },
      fakeEnv,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("private");
    expect((await res.arrayBuffer()).byteLength).toBe(8);
  });

  it("他人・不正な kind（任意キー読み出し）は 404", async () => {
    const { app } = await makeApp();
    const other = await app.request(
      "/games/g1/photos/job-1/river",
      { headers: await bearer("attacker") },
      fakeEnv,
    );
    expect(other.status).toBe(404);
    // kind の許可リスト外（message.json 等）を配信の口にしない。
    const evil = await app.request(
      "/games/g1/photos/job-1/message.json",
      { headers: await bearer("owner") },
      fakeEnv,
    );
    expect(evil.status).toBe(404);
  });
});
