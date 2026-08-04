// infrastructure/problem — ProblemRepository の Drizzle/D1 実装。
// 読み出し時に ProblemSchema.parse で再検証する（後方互換の既定を埋め、
// 検証を通っていないデータを下流に流さない）。

import { ProblemSchema, type ListCursor } from "@rigel/schema";
import { and, count, desc, eq, lt, or } from "drizzle-orm";
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
    photoDraftId: row.photoDraftId,
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

  async listByUserPage(
    userId: string,
    limit: number,
    cursor: ListCursor | null,
  ): Promise<ProblemPost[]> {
    const rows = await this.db
      .select()
      .from(problems)
      .where(
        and(
          eq(problems.userId, userId),
          cursor === null
            ? undefined
            : or(
                lt(problems.createdAt, new Date(cursor.ms)),
                and(eq(problems.createdAt, new Date(cursor.ms)), lt(problems.id, cursor.id)),
              ),
        ),
      )
      .orderBy(desc(problems.createdAt), desc(problems.id))
      .limit(limit)
      .all();
    return rows.map(toDomain);
  }

  async listPublished(limit: number, cursor: ListCursor | null): Promise<ProblemPost[]> {
    // 並びは createdAt DESC・同時刻は id DESC（カーソルのタイブレークと同一。
    // Plan: docs/plans/list-pagination.md 3-1）。and() は undefined を無視する。
    const rows = await this.db
      .select()
      .from(problems)
      .where(
        and(
          eq(problems.status, "published"),
          cursor === null
            ? undefined
            : or(
                lt(problems.createdAt, new Date(cursor.ms)),
                and(eq(problems.createdAt, new Date(cursor.ms)), lt(problems.id, cursor.id)),
              ),
        ),
      )
      .orderBy(desc(problems.createdAt), desc(problems.id))
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
        photoDraftId: post.photoDraftId,
        createdAt: post.createdAt,
      })
      .onConflictDoUpdate({
        target: problems.id,
        // photoDraftId は作成時に決まり不変（更新で剥がさない）。
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
