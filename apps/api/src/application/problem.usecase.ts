// application — 何切る問題の CRUD ユースケース。
// 問題本体は使う前に必ず ProblemSchema.parse で検証する（信頼ゲート:
// 検証を通っていないデータを下流に流さない）。保存上限は free 20問（draft+published 合算）。

import { ProblemSchema } from "@rigel/schema";
import type { ProblemPost, ProblemStatus } from "../domain/problem/problem";
import type { ProblemAnswerRepository } from "../domain/problem/problem-answer.repository";
import type { ProblemRepository } from "../domain/problem/problem.repository";
import { problemLimit } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";
import { isOverLimit } from "./limits";

const TITLE_MAX = 80;
/** 公開一覧の既定件数（新着順）。 */
const PUBLISHED_LIST_LIMIT = 50;

/** 所有者の問題を返す（他人・不存在はどちらも null = 存在を伏せる）。 */
async function findOwnedProblem(
  problems: ProblemRepository,
  problemId: string,
  userId: string,
): Promise<ProblemPost | null> {
  const post = await problems.findById(problemId);
  return post && post.userId === userId ? post : null;
}

export type CreateProblemResult =
  { ok: true; problemId: string } | { ok: false; reason: "invalid" | "problem_limit" };

export class CreateProblem {
  constructor(
    private readonly deps: {
      problems: ProblemRepository;
      users: UserRepository;
      now: () => Date;
      newId: () => string;
    },
  ) {}

  async execute(params: {
    userId: string;
    title: string;
    problem: unknown;
    status?: ProblemStatus;
  }): Promise<CreateProblemResult> {
    const title = params.title.trim();
    if (title.length > TITLE_MAX) return { ok: false, reason: "invalid" };
    const parsed = ProblemSchema.safeParse(params.problem);
    if (!parsed.success) return { ok: false, reason: "invalid" };
    if (
      await isOverLimit(this.deps.users, params.userId, problemLimit, () =>
        this.deps.problems.countByUser(params.userId),
      )
    ) {
      return { ok: false, reason: "problem_limit" };
    }
    const id = this.deps.newId();
    await this.deps.problems.save({
      id,
      userId: params.userId,
      title,
      problem: parsed.data,
      status: params.status ?? "draft",
      createdAt: this.deps.now(),
    });
    return { ok: true, problemId: id };
  }
}

export type UpdateProblemResult = { ok: true } | { ok: false; reason: "not_found" | "invalid" };

export class UpdateProblem {
  constructor(private readonly problems: ProblemRepository) {}

  async execute(params: {
    userId: string;
    problemId: string;
    title?: string;
    problem?: unknown;
    status?: ProblemStatus;
  }): Promise<UpdateProblemResult> {
    const post = await findOwnedProblem(this.problems, params.problemId, params.userId);
    if (!post) return { ok: false, reason: "not_found" };

    let title = post.title;
    if (params.title !== undefined) {
      title = params.title.trim();
      if (title.length > TITLE_MAX) return { ok: false, reason: "invalid" };
    }
    let problem = post.problem;
    if (params.problem !== undefined) {
      const parsed = ProblemSchema.safeParse(params.problem);
      if (!parsed.success) return { ok: false, reason: "invalid" };
      problem = parsed.data;
    }
    await this.problems.save({ ...post, title, problem, status: params.status ?? post.status });
    return { ok: true };
  }
}

export type DeleteProblemResult = { ok: true } | { ok: false; reason: "not_found" };

export class DeleteProblem {
  constructor(
    private readonly problems: ProblemRepository,
    private readonly answers: ProblemAnswerRepository,
  ) {}

  async execute(params: { userId: string; problemId: string }): Promise<DeleteProblemResult> {
    const post = await findOwnedProblem(this.problems, params.problemId, params.userId);
    if (!post) return { ok: false, reason: "not_found" };
    // ぶら下がる回答も一緒に消す（孤児を残さない）。
    await this.answers.deleteByProblem(post.id);
    await this.problems.deleteById(post.id);
    return { ok: true };
  }
}

export class GetProblem {
  constructor(private readonly problems: ProblemRepository) {}

  /** published は誰でも・draft は所有者(viewerId)のみ。他人には null（存在を伏せる）。 */
  async execute(problemId: string, viewerId?: string): Promise<ProblemPost | null> {
    const post = await this.problems.findById(problemId);
    if (!post) return null;
    if (post.status === "draft" && post.userId !== viewerId) return null;
    return post;
  }
}

export class ListMyProblems {
  constructor(private readonly problems: ProblemRepository) {}
  execute(userId: string): Promise<ProblemPost[]> {
    return this.problems.listByUser(userId);
  }
}

export class ListPublishedProblems {
  constructor(private readonly problems: ProblemRepository) {}
  execute(limit = PUBLISHED_LIST_LIMIT): Promise<ProblemPost[]> {
    return this.problems.listPublished(limit);
  }
}
