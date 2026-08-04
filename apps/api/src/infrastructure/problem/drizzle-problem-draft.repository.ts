// infrastructure/problem — 解析下書き（problem_drafts）の Drizzle/D1 実装。
// 取得は常に所有者ガード付き。kifu は読み出し時に KifuSchema で再検証する
//（検証を通っていないデータを下流に流さない）。

import { KifuSchema } from "@rigel/schema";
import { and, desc, eq } from "drizzle-orm";
import type {
  ProblemDraft,
  ProblemDraftRepository,
} from "../../domain/problem/problem-draft.repository";
import type { Db } from "../db/client";
import { problemDrafts } from "../db/schema";

type Row = typeof problemDrafts.$inferSelect;

function toDomain(row: Row): ProblemDraft {
  const parsed = row.kifu == null ? null : KifuSchema.safeParse(row.kifu);
  return {
    id: row.id,
    userId: row.userId,
    jobId: row.jobId,
    kifu: parsed?.success ? parsed.data : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleProblemDraftRepository implements ProblemDraftRepository {
  constructor(private readonly db: Db) {}

  async create(params: { id: string; userId: string; jobId: string; now: Date }): Promise<void> {
    await this.db.insert(problemDrafts).values({
      id: params.id,
      userId: params.userId,
      jobId: params.jobId,
      kifu: null,
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  async findForUser(id: string, userId: string): Promise<ProblemDraft | null> {
    const row = await this.db
      .select()
      .from(problemDrafts)
      .where(and(eq(problemDrafts.id, id), eq(problemDrafts.userId, userId)))
      .get();
    return row ? toDomain(row) : null;
  }

  async findByJobForUser(jobId: string, userId: string): Promise<ProblemDraft | null> {
    const row = await this.db
      .select()
      .from(problemDrafts)
      .where(and(eq(problemDrafts.jobId, jobId), eq(problemDrafts.userId, userId)))
      .get();
    return row ? toDomain(row) : null;
  }

  async listByUser(userId: string): Promise<ProblemDraft[]> {
    // LIMIT は付けない: DeleteAccount の写真掃除（R2）がこの全件列挙に依存する
    // （欠けるとルール7「データ削除で必ず消す」に穴が開く）。件数は解析枠
    // （下書きは解析実行ごとに先行作成→保存/破棄で畳まれる）で自然に有界。
    // Plan: list-pagination.md 7章の逸脱メモ参照。
    const rows = await this.db
      .select()
      .from(problemDrafts)
      .where(eq(problemDrafts.userId, userId))
      .orderBy(desc(problemDrafts.createdAt))
      .all();
    return rows.map(toDomain);
  }

  async setKifu(id: string, params: { kifu: ProblemDraft["kifu"]; now: Date }): Promise<void> {
    await this.db
      .update(problemDrafts)
      .set({ kifu: params.kifu, updatedAt: params.now })
      .where(eq(problemDrafts.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(problemDrafts).where(eq(problemDrafts.id, id));
  }
}
