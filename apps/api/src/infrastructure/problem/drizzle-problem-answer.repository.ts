// infrastructure/problem — ProblemAnswerRepository の Drizzle/D1 実装。
// 1人1回（PK = problem_id + user_id）。upsert は複合キーを target にする。

import { ProblemActionSchema } from "@rigel/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import type {
  ProblemAnswer,
  ProblemAnswerRepository,
} from "../../domain/problem/problem-answer.repository";
import type { Db } from "../db/client";
import { problemAnswers, problems, type ProblemAnswerRow } from "../db/schema";

function toDomain(row: ProblemAnswerRow): ProblemAnswer {
  return {
    problemId: row.problemId,
    userId: row.userId,
    choiceKey: row.choiceKey,
    action: ProblemActionSchema.parse(row.action),
    createdAt: row.createdAt,
  };
}

export class DrizzleProblemAnswerRepository implements ProblemAnswerRepository {
  constructor(private readonly db: Db) {}

  async upsert(answer: ProblemAnswer): Promise<void> {
    await this.db
      .insert(problemAnswers)
      .values({
        problemId: answer.problemId,
        userId: answer.userId,
        choiceKey: answer.choiceKey,
        action: answer.action,
        createdAt: answer.createdAt,
      })
      .onConflictDoUpdate({
        target: [problemAnswers.problemId, problemAnswers.userId],
        set: { choiceKey: answer.choiceKey, action: answer.action, createdAt: answer.createdAt },
      });
  }

  async countsByProblem(problemId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ choiceKey: problemAnswers.choiceKey, n: count() })
      .from(problemAnswers)
      .where(eq(problemAnswers.problemId, problemId))
      .groupBy(problemAnswers.choiceKey)
      .all();
    return Object.fromEntries(rows.map((r) => [r.choiceKey, r.n]));
  }

  async findMine(problemId: string, userId: string): Promise<ProblemAnswer | null> {
    const row = await this.db
      .select()
      .from(problemAnswers)
      .where(and(eq(problemAnswers.problemId, problemId), eq(problemAnswers.userId, userId)))
      .get();
    return row ? toDomain(row) : null;
  }

  async deleteByProblem(problemId: string): Promise<void> {
    await this.db.delete(problemAnswers).where(eq(problemAnswers.problemId, problemId));
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(problemAnswers).where(eq(problemAnswers.userId, userId));
  }

  async deleteByProblemOwner(ownerId: string): Promise<void> {
    // 所有問題の id を集めてから消す（D1 はサブクエリ delete が不安定なため2段で確実に）。
    const owned = await this.db
      .select({ id: problems.id })
      .from(problems)
      .where(eq(problems.userId, ownerId))
      .all();
    if (owned.length === 0) return;
    await this.db.delete(problemAnswers).where(
      inArray(
        problemAnswers.problemId,
        owned.map((r) => r.id),
      ),
    );
  }
}
