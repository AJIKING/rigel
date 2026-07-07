// infrastructure/problem — ProblemRepository の Drizzle/D1 実装。
// 読み出し時に ProblemSchema.parse で再検証する（後方互換の既定を埋め、
// 検証を通っていないデータを下流に流さない）。

import { ProblemSchema } from "@rigel/schema";
import { count, desc, eq } from "drizzle-orm";
import type { ProblemPost } from "../../domain/problem/problem";
import type { ProblemRepository } from "../../domain/problem/problem.repository";
import type { Db } from "../db/client";
import { problems, type ProblemRow } from "../db/schema";

function toDomain(row: ProblemRow): ProblemPost {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    problem: ProblemSchema.parse(row.problem),
    status: row.status,
    createdAt: row.createdAt,
  };
}

export class DrizzleProblemRepository implements ProblemRepository {
  constructor(private readonly db: Db) {}

  async listByUser(userId: string): Promise<ProblemPost[]> {
    const rows = await this.db
      .select()
      .from(problems)
      .where(eq(problems.userId, userId))
      .orderBy(desc(problems.createdAt))
      .all();
    return rows.map(toDomain);
  }

  async listPublished(limit: number): Promise<ProblemPost[]> {
    const rows = await this.db
      .select()
      .from(problems)
      .where(eq(problems.status, "published"))
      .orderBy(desc(problems.createdAt))
      .limit(limit)
      .all();
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<ProblemPost | null> {
    const row = await this.db.select().from(problems).where(eq(problems.id, id)).get();
    return row ? toDomain(row) : null;
  }

  async countByUser(userId: string): Promise<number> {
    const row = await this.db
      .select({ n: count() })
      .from(problems)
      .where(eq(problems.userId, userId))
      .get();
    return row?.n ?? 0;
  }

  async save(post: ProblemPost): Promise<void> {
    await this.db
      .insert(problems)
      .values({
        id: post.id,
        userId: post.userId,
        title: post.title,
        problem: post.problem,
        status: post.status,
        createdAt: post.createdAt,
      })
      .onConflictDoUpdate({
        target: problems.id,
        set: { title: post.title, problem: post.problem, status: post.status },
      });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(problems).where(eq(problems.id, id));
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(problems).where(eq(problems.userId, userId));
  }
}
