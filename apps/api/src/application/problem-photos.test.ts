// 何切るの元写真（photo-retention.md）。所有者のみ・公開問題でも露出しない。
// 問題（photoDraftId で引き継ぎ）と解析下書きの両方から引ける。

import { describe, expect, it } from "vitest";
import { InMemoryProblemRepository } from "../test-support/in-memory";
import {
  InMemoryAnalysisImageStore,
  InMemoryProblemDraftRepository,
} from "../test-support/in-memory-analysis";
import { makeProblemData } from "../test-support/problem";
import { ProblemPhotos } from "./problem-photos.usecase";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const IMG = { data: new ArrayBuffer(4), mimeType: "image/jpeg" };

async function make() {
  const problems = new InMemoryProblemRepository();
  const drafts = new InMemoryProblemDraftRepository();
  const images = new InMemoryAnalysisImageStore();
  // 公開問題でも写真は所有者のみ（status は判定に使わない）。
  await problems.save({
    id: "p1",
    userId: "u1",
    title: "",
    problem: makeProblemData(),
    status: "published",
    photoDraftId: "d-1",
    createdAt: NOW,
  });
  await problems.save({
    id: "p-manual",
    userId: "u1",
    title: "",
    problem: makeProblemData(),
    status: "draft",
    photoDraftId: null,
    createdAt: NOW,
  });
  await drafts.create({ id: "d-2", userId: "u1", jobId: "j2", now: NOW });
  await images.put("problems/d-1/j1/hand", IMG);
  await images.put("problems/d-1/j1/river", IMG);
  await images.put("problems/d-2/j2/hand", IMG);
  return { uc: new ProblemPhotos(problems, drafts, images) };
}

describe("ProblemPhotos", () => {
  it("問題（photoDraftId）から所有者は写真を一覧・取得できる", async () => {
    const { uc } = await make();

    expect(await uc.list("u1", { problemId: "p1" })).toEqual([
      { jobId: "j1", kind: "hand" },
      { jobId: "j1", kind: "river" },
    ]);
    expect(await uc.get("u1", { problemId: "p1" }, "j1", "hand")).not.toBeNull();
  });

  it("解析下書きからも同様に引ける", async () => {
    const { uc } = await make();
    expect(await uc.list("u1", { draftId: "d-2" })).toEqual([{ jobId: "j2", kind: "hand" }]);
  });

  it("他人・不存在・手入力（photoDraftId なし）は null（公開問題でも露出しない）", async () => {
    const { uc } = await make();
    expect(await uc.list("attacker", { problemId: "p1" })).toBeNull();
    expect(await uc.list("attacker", { draftId: "d-2" })).toBeNull();
    expect(await uc.list("u1", { problemId: "p-manual" })).toBeNull();
    expect(await uc.list("u1", { problemId: "missing" })).toBeNull();
    expect(await uc.get("attacker", { problemId: "p1" }, "j1", "hand")).toBeNull();
  });
});
