// application — 何切る問題の CRUD ユースケース。
// 問題本体は使う前に必ず ProblemSchema.parse で検証する（信頼ゲート:
// 検証を通っていないデータを下流に流さない）。保存上限は free 20問（draft+published 合算）。

import { ProblemSchema } from "@rigel/schema";
import type { AnalysisJobRepository } from "../domain/analysis/analysis-job";
import { problemDraftPrefix } from "../domain/analysis/analysis-transport";
import type { FavoriteRepository } from "../domain/favorite/favorite.repository";
import type { ProblemPost, ProblemStatus } from "../domain/problem/problem";
import type { ProblemAnswerRepository } from "../domain/problem/problem-answer.repository";
import type { ProblemDraftRepository } from "../domain/problem/problem-draft.repository";
import type { ProblemRepository } from "../domain/problem/problem.repository";
import { problemLimit } from "../domain/user/user";
import type { UserRepository } from "../domain/user/user.repository";
import { isOverLimit } from "./limits";
import { fetchPage, type PagedResult } from "./pagination";

const TITLE_MAX = 80;
/** 公開一覧のページサイズ（新着順・カーソル方式。Plan: docs/plans/list-pagination.md 3-3）。 */
const PUBLISHED_PAGE_SIZE = 30;

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
      /** 解析下書きからの正規保存（photo-retention.md）。 */
      drafts: ProblemDraftRepository;
      /** 下書きを畳むとき解析ジョブ行も掃除する（堆積させない）。 */
      jobs: AnalysisJobRepository;
      now: () => Date;
      newId: () => string;
    },
  ) {}

  async execute(params: {
    userId: string;
    title: string;
    problem: unknown;
    status?: ProblemStatus;
    /** 解析下書き由来なら指定。写真（problems/{draftId}/…）を問題へ引き継ぎ、下書きを畳む。 */
    draftId?: string;
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
    // 解析下書きは所有者のものだけ引き継げる（他人の draftId を指されても写真を紐づけない）。
    const draft = params.draftId
      ? await this.deps.drafts.findForUser(params.draftId, params.userId)
      : null;
    const id = this.deps.newId();
    await this.deps.problems.save({
      id,
      userId: params.userId,
      title,
      problem: parsed.data,
      status: params.status ?? "draft",
      photoDraftId: draft?.id ?? null,
      createdAt: this.deps.now(),
    });
    // 正規保存できたら下書きを畳む（写真プレフィックスは問題が引き継ぐので消さない）。
    // 解析ジョブ行も掃除（DeleteProblemDraft と同じ。堆積させない）。
    if (draft) {
      await this.deps.jobs.deleteById(draft.jobId);
      await this.deps.drafts.delete(draft.id);
    }
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
    private readonly favorites: FavoriteRepository,
    /** 元写真の掃除（photo-retention.md）。必須＝配線漏れをコンパイラで検出する。 */
    private readonly images: { deletePrefix(prefix: string): Promise<void> },
  ) {}

  async execute(params: { userId: string; problemId: string }): Promise<DeleteProblemResult> {
    const post = await findOwnedProblem(this.problems, params.problemId, params.userId);
    if (!post) return { ok: false, reason: "not_found" };
    // ぶら下がる回答も★も一緒に消す（孤児を残さない）。
    // ★は対象への外部キーを持てない（ポリモーフィック）ので明示的に消す。
    await this.answers.deleteByProblem(post.id);
    await this.favorites.deleteByTarget("problem", post.id);
    // 解析下書き由来の写真（R2）。D1 の行より先に消す（参照喪失の防止）。
    if (post.photoDraftId) {
      await this.images.deletePrefix(problemDraftPrefix(post.photoDraftId));
    }
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

/** マイ何切る一覧のページサイズ（Plan: docs/plans/list-pagination.md 3-3）。 */
const MY_PROBLEMS_PAGE_SIZE = 30;

export type ListMyProblemsResult = PagedResult<ProblemPost>;

export class ListMyProblems {
  constructor(private readonly problems: ProblemRepository) {}

  execute(userId: string, cursorRaw?: string): Promise<ListMyProblemsResult> {
    return fetchPage(
      cursorRaw,
      MY_PROBLEMS_PAGE_SIZE,
      (limit, cursor) => this.problems.listByUserPage(userId, limit, cursor),
      (p) => ({ ms: p.createdAt.getTime(), id: p.id }),
    );
  }
}

export type ListPublishedProblemsResult = PagedResult<ProblemPost>;

export class ListPublishedProblems {
  constructor(private readonly problems: ProblemRepository) {}

  /** 公開一覧の1ページ（新着順・カーソル方式）。不正カーソルは invalid（400）。 */
  execute(cursorRaw?: string): Promise<ListPublishedProblemsResult> {
    return fetchPage(
      cursorRaw,
      PUBLISHED_PAGE_SIZE,
      (limit, cursor) => this.problems.listPublished(limit, cursor),
      (p) => ({ ms: p.createdAt.getTime(), id: p.id }),
    );
  }
}
