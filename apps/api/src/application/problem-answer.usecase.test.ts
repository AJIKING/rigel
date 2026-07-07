import { describe, expect, it } from "vitest";
import type { ProblemPost } from "../domain/problem/problem";
import {
  InMemoryProblemAnswerRepository,
  InMemoryProblemRepository,
} from "../test-support/in-memory";
import { makeProblemData } from "../test-support/problem";
import { AnswerProblem, GetProblemStats } from "./problem-answer.usecase";

const NOW = new Date("2026-07-07T00:00:00Z");

function post(
  id: string,
  userId: string,
  status: "draft" | "published" = "published",
): ProblemPost {
  return { id, userId, title: "t", problem: makeProblemData(), status, createdAt: NOW };
}

function deps() {
  const problems = new InMemoryProblemRepository();
  const answers = new InMemoryProblemAnswerRepository();
  return { problems, answers, now: () => NOW };
}

describe("AnswerProblem（回答の upsert）", () => {
  it("公開済みの問題に回答でき、choiceKey で集計される", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner"));
    const result = await new AnswerProblem(d).execute({
      userId: "u1",
      problemId: "p1",
      action: { type: "discard", tile: "5p", riichi: true },
    });
    expect(result).toEqual({ ok: true });
    expect(await d.answers.countsByProblem("p1")).toEqual({ "discard:5p:riichi": 1 });
  });

  it("再回答は上書き（1人1回。分布の合計＝回答者数）", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner"));
    const uc = new AnswerProblem(d);
    await uc.execute({ userId: "u1", problemId: "p1", action: { type: "discard", tile: "5p" } });
    await uc.execute({ userId: "u1", problemId: "p1", action: { type: "discard", tile: "1m" } });
    expect(await d.answers.countsByProblem("p1")).toEqual({ "discard:1m": 1 });
  });

  it("出題形式に合わない・手牌に無い牌の回答は invalid（分布を荒らさない）", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner"));
    const uc = new AnswerProblem(d);
    expect(await uc.execute({ userId: "u1", problemId: "p1", action: { type: "pass" } })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await uc.execute({ userId: "u1", problemId: "p1", action: { type: "discard", tile: "9s" } }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(await uc.execute({ userId: "u1", problemId: "p1", action: { bad: 1 } })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("下書き・存在しない問題には回答できない（not_found）", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner", "draft"));
    const uc = new AnswerProblem(d);
    expect(
      await uc.execute({ userId: "u1", problemId: "p1", action: { type: "discard", tile: "5p" } }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(
      await uc.execute({
        userId: "u1",
        problemId: "nope",
        action: { type: "discard", tile: "5p" },
      }),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("GetProblemStats（分布＋自分の回答）", () => {
  it("choiceKey ごとの件数・合計・自分の回答を返す", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner"));
    const uc = new AnswerProblem(d);
    await uc.execute({ userId: "u1", problemId: "p1", action: { type: "discard", tile: "5p" } });
    await uc.execute({ userId: "u2", problemId: "p1", action: { type: "discard", tile: "5p" } });
    await uc.execute({ userId: "u3", problemId: "p1", action: { type: "discard", tile: "1m" } });

    const stats = await new GetProblemStats(d).execute({ userId: "u1", problemId: "p1" });
    expect(stats).toEqual({
      counts: { "discard:5p": 2, "discard:1m": 1 },
      total: 3,
      myChoiceKey: "discard:5p",
      myAction: { type: "discard", tile: "5p", riichi: false },
    });
  });

  it("未回答者の myChoiceKey は null", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner"));
    const stats = await new GetProblemStats(d).execute({ userId: "u9", problemId: "p1" });
    expect(stats).toEqual({ counts: {}, total: 0, myChoiceKey: null, myAction: null });
  });

  it("下書きの分布は所有者だけ見られる（他人は null=404 相当）", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner", "draft"));
    const uc = new GetProblemStats(d);
    expect(await uc.execute({ userId: "owner", problemId: "p1" })).not.toBeNull();
    expect(await uc.execute({ userId: "other", problemId: "p1" })).toBeNull();
  });
});
