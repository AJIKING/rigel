// application — 何切る問題の回答（upsert）と分布（stats）。
// 回答は使う前に必ず ProblemActionSchema.parse で検証し、さらに isValidAnswer で
// 「その問題の答えとして成立するか」を確かめてから choiceKey で集計に入れる
// （不正キーで分布を荒らさない）。分布は件数のみ返す（誰が何と答えたかは出さない）。

import { choiceKey, isValidAnswer, ProblemActionSchema, type ProblemAction } from "@rigel/schema";
import type { ProblemAnswerRepository } from "../domain/problem/problem-answer.repository";
import type { ProblemRepository } from "../domain/problem/problem.repository";

export type AnswerProblemResult = { ok: true } | { ok: false; reason: "not_found" | "invalid" };

export class AnswerProblem {
  constructor(
    private readonly deps: {
      problems: ProblemRepository;
      answers: ProblemAnswerRepository;
      now: () => Date;
    },
  ) {}

  async execute(params: {
    userId: string;
    problemId: string;
    action: unknown;
  }): Promise<AnswerProblemResult> {
    const parsed = ProblemActionSchema.safeParse(params.action);
    if (!parsed.success) return { ok: false, reason: "invalid" };
    const post = await this.deps.problems.findById(params.problemId);
    // 回答を受け付けるのは公開済みのみ（下書きは存在も伏せる）。
    if (!post || post.status !== "published") return { ok: false, reason: "not_found" };
    if (!isValidAnswer(post.problem, parsed.data)) return { ok: false, reason: "invalid" };
    await this.deps.answers.upsert({
      problemId: post.id,
      userId: params.userId,
      choiceKey: choiceKey(parsed.data),
      action: parsed.data,
      createdAt: this.deps.now(),
    });
    return { ok: true };
  }
}

export interface ProblemStats {
  /** choiceKey → 件数。 */
  counts: Record<string, number>;
  total: number;
  /** 自分の回答（未回答は null）。 */
  myChoiceKey: string | null;
  myAction: ProblemAction | null;
}

export class GetProblemStats {
  constructor(
    private readonly deps: { problems: ProblemRepository; answers: ProblemAnswerRepository },
  ) {}

  /** published は認証ユーザーなら誰でも・draft は所有者のみ（他人は null=404 相当）。 */
  async execute(params: { userId: string; problemId: string }): Promise<ProblemStats | null> {
    const post = await this.deps.problems.findById(params.problemId);
    if (!post) return null;
    if (post.status !== "published" && post.userId !== params.userId) return null;
    const counts = await this.deps.answers.countsByProblem(post.id);
    const mine = await this.deps.answers.findMine(post.id, params.userId);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return {
      counts,
      total,
      myChoiceKey: mine?.choiceKey ?? null,
      myAction: mine?.action ?? null,
    };
  }
}
