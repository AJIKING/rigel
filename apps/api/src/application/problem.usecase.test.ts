import { describe, expect, it } from "vitest";
import type { ProblemPost } from "../domain/problem/problem";
import { firstOfNextMonthUtc, User, type Plan } from "../domain/user/user";
import {
  InMemoryFavoriteRepository,
  InMemoryProblemAnswerRepository,
  InMemoryProblemRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import {
  InMemoryAnalysisImageStore,
  InMemoryAnalysisJobRepository,
  InMemoryProblemDraftRepository,
} from "../test-support/in-memory-analysis";
import { makeProblemData, minimalProblemInput } from "../test-support/problem";
import {
  CreateProblem,
  DeleteProblem,
  GetProblem,
  ListMyProblems,
  ListPublishedProblems,
  UpdateProblem,
} from "./problem.usecase";

const NOW = new Date("2026-07-07T00:00:00Z");

function user(plan: Plan = "free", id = "u1"): User {
  return new User({
    id,
    googleSub: `g-${id}`,
    plan,
    analysisCountThisMonth: 0,
    countResetAt: firstOfNextMonthUtc(NOW),
  });
}

function post(
  id: string,
  userId: string,
  status: "draft" | "published" = "published",
): ProblemPost {
  return {
    id,
    userId,
    title: `問題${id}`,
    problem: makeProblemData(),
    status,
    photoDraftId: null,
    createdAt: NOW,
  };
}

function deps(plan: Plan = "free") {
  const problems = new InMemoryProblemRepository();
  const answers = new InMemoryProblemAnswerRepository();
  const favorites = new InMemoryFavoriteRepository();
  const users = new InMemoryUserRepository([user(plan)]);
  const drafts = new InMemoryProblemDraftRepository();
  const jobs = new InMemoryAnalysisJobRepository();
  let n = 0;
  return {
    problems,
    answers,
    favorites,
    users,
    drafts,
    jobs,
    now: () => NOW,
    newId: () => `p${++n}`,
  };
}

describe("CreateProblem（解析下書きからの正規保存。photo-retention.md）", () => {
  it("draftId 指定で写真を引き継ぎ（photoDraftId）、下書きを畳む", async () => {
    const d = deps();
    const drafts = new InMemoryProblemDraftRepository();
    await drafts.create({ id: "d-1", userId: "u1", jobId: "j1", now: NOW });
    const uc = new CreateProblem({ ...d, drafts });

    const result = await uc.execute({
      userId: "u1",
      title: "t",
      problem: minimalProblemInput(),
      draftId: "d-1",
    });

    expect(result).toEqual({ ok: true, problemId: "p1" });
    expect((await d.problems.findById("p1"))?.photoDraftId).toBe("d-1");
    expect(await drafts.findForUser("d-1", "u1")).toBeNull(); // 畳まれた
  });

  it("他人の draftId は無視する（写真を紐づけない・下書きも消さない）", async () => {
    const d = deps();
    const drafts = new InMemoryProblemDraftRepository();
    await drafts.create({ id: "d-x", userId: "someone-else", jobId: "j1", now: NOW });
    const uc = new CreateProblem({ ...d, drafts });

    await uc.execute({
      userId: "u1",
      title: "t",
      problem: minimalProblemInput(),
      draftId: "d-x",
    });

    expect((await d.problems.findById("p1"))?.photoDraftId).toBeNull();
    expect(await drafts.findForUser("d-x", "someone-else")).not.toBeNull();
  });
});

describe("CreateProblem", () => {
  it("正しい問題を draft 既定で保存し problemId を返す", async () => {
    const d = deps();
    const uc = new CreateProblem(d);
    const result = await uc.execute({
      userId: "u1",
      title: "  何切る？ ",
      problem: minimalProblemInput(),
    });
    expect(result).toEqual({ ok: true, problemId: "p1" });
    const saved = await d.problems.findById("p1");
    expect(saved?.title).toBe("何切る？"); // trim
    expect(saved?.status).toBe("draft");
    expect(saved?.problem.kind).toBe("discard");
  });

  it("published 指定で公開状態で作成できる", async () => {
    const d = deps();
    const result = await new CreateProblem(d).execute({
      userId: "u1",
      title: "t",
      problem: minimalProblemInput(),
      status: "published",
    });
    expect(result.ok).toBe(true);
    expect((await d.problems.listByUser("u1"))[0]?.status).toBe("published");
  });

  it("不正な問題データ・長すぎるタイトルは invalid", async () => {
    const d = deps();
    const uc = new CreateProblem(d);
    expect(await uc.execute({ userId: "u1", title: "t", problem: { bad: true } })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(
      await uc.execute({ userId: "u1", title: "あ".repeat(81), problem: minimalProblemInput() }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("free は draft+published 合算20問で problem_limit、有料は無制限", async () => {
    const d = deps();
    for (let i = 0; i < 20; i++) {
      await d.problems.save(post(`seed${i}`, "u1", i % 2 === 0 ? "draft" : "published"));
    }
    expect(
      await new CreateProblem(d).execute({
        userId: "u1",
        title: "t",
        problem: minimalProblemInput(),
      }),
    ).toEqual({ ok: false, reason: "problem_limit" });

    const paid = deps("pro");
    for (let i = 0; i < 20; i++) await paid.problems.save(post(`seed${i}`, "u1"));
    const result = await new CreateProblem(paid).execute({
      userId: "u1",
      title: "t",
      problem: minimalProblemInput(),
    });
    expect(result.ok).toBe(true);
  });
});

describe("UpdateProblem", () => {
  it("所有者はタイトル・状態・問題データを更新できる", async () => {
    const d = deps();
    await d.problems.save(post("p1", "u1", "draft"));
    const result = await new UpdateProblem(d.problems).execute({
      userId: "u1",
      problemId: "p1",
      title: "新タイトル",
      status: "published",
    });
    expect(result).toEqual({ ok: true });
    const saved = await d.problems.findById("p1");
    expect(saved?.title).toBe("新タイトル");
    expect(saved?.status).toBe("published");
  });

  it("他人の問題は not_found（存在を伏せる）", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner"));
    expect(
      await new UpdateProblem(d.problems).execute({
        userId: "attacker",
        problemId: "p1",
        title: "x",
      }),
    ).toEqual({ ok: false, reason: "not_found" });
  });

  it("不正な問題データは invalid", async () => {
    const d = deps();
    await d.problems.save(post("p1", "u1"));
    expect(
      await new UpdateProblem(d.problems).execute({
        userId: "u1",
        problemId: "p1",
        problem: { bad: 1 },
      }),
    ).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("DeleteProblem", () => {
  it("解析下書き由来の問題は写真（R2）も一緒に消す（photo-retention.md）", async () => {
    const d = deps();
    const images = new InMemoryAnalysisImageStore();
    await images.put("problems/d-1/j1/hand", { data: new ArrayBuffer(4), mimeType: "image/jpeg" });
    await d.problems.save({ ...post("p1", "u1"), photoDraftId: "d-1" });

    const result = await new DeleteProblem(d.problems, d.answers, d.favorites, images).execute({
      userId: "u1",
      problemId: "p1",
    });

    expect(result).toEqual({ ok: true });
    expect(await images.listKeys("problems/d-1/")).toEqual([]);
  });

  it("所有者は削除でき、ぶら下がる回答も他人が付けた★も消える（孤児を残さない）", async () => {
    const d = deps();
    await d.problems.save(post("p1", "u1"));
    await d.problems.save(post("p2", "u1"));
    await d.answers.upsert({
      problemId: "p1",
      userId: "u2",
      choiceKey: "pass",
      action: { type: "pass" },
      createdAt: NOW,
    });
    await d.favorites.add({
      userId: "u2",
      targetType: "problem",
      targetId: "p1",
      createdAt: NOW,
    });
    await d.favorites.add({
      userId: "u2",
      targetType: "problem",
      targetId: "p2",
      createdAt: NOW,
    });

    const result = await new DeleteProblem(
      d.problems,
      d.answers,
      d.favorites,
      new InMemoryAnalysisImageStore(),
    ).execute({
      userId: "u1",
      problemId: "p1",
    });
    expect(result).toEqual({ ok: true });
    expect(await d.problems.findById("p1")).toBeNull();
    expect(await d.answers.countsByProblem("p1")).toEqual({});
    // 消したのは p1 の★だけ（残りの問題の★は無傷）。
    expect(await d.favorites.countsByTargets("problem", ["p1", "p2"])).toEqual({ p2: 1 });
  });

  it("他人の問題は not_found", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner"));
    expect(
      await new DeleteProblem(
        d.problems,
        d.answers,
        d.favorites,
        new InMemoryAnalysisImageStore(),
      ).execute({
        userId: "attacker",
        problemId: "p1",
      }),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("GetProblem", () => {
  it("published は誰でも取得できる（未認証含む）", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner", "published"));
    expect((await new GetProblem(d.problems).execute("p1"))?.id).toBe("p1");
  });

  it("draft は所有者だけ取得でき、他人・未認証には null（存在を伏せる）", async () => {
    const d = deps();
    await d.problems.save(post("p1", "owner", "draft"));
    const uc = new GetProblem(d.problems);
    expect((await uc.execute("p1", "owner"))?.id).toBe("p1");
    expect(await uc.execute("p1", "other")).toBeNull();
    expect(await uc.execute("p1")).toBeNull();
  });
});

describe("ListMyProblems / ListPublishedProblems", () => {
  it("mine は自分の問題だけ（draft 含む）、published 一覧は公開だけ", async () => {
    const d = deps();
    await d.problems.save(post("p1", "u1", "draft"));
    await d.problems.save(post("p2", "u1", "published"));
    await d.problems.save(post("p3", "other", "published"));
    await d.problems.save(post("p4", "other", "draft"));

    const mine = await new ListMyProblems(d.problems).execute("u1");
    expect(mine.map((p) => p.id).sort()).toEqual(["p1", "p2"]);

    const published = await new ListPublishedProblems(d.problems).execute();
    expect(published.map((p) => p.id).sort()).toEqual(["p2", "p3"]);
  });
});
