// infrastructure/analysis — 解析ジョブの Drizzle 実装（docs/plans/async-analysis.md）。
// 取得は常に所有者ガード付き（id + userId）。状態遷移は markDone / markFailed の2本だけ。

import { and, desc, eq, ne } from "drizzle-orm";
import type { AnalysisJob, AnalysisJobRepository } from "../../domain/analysis/analysis-job";
import type { Db } from "../db/client";
import { analysisJobs } from "../db/schema";

export class DrizzleAnalysisJobRepository implements AnalysisJobRepository {
  constructor(private readonly db: Db) {}

  async create(params: {
    id: string;
    userId: string;
    gameId: string | null;
    now: Date;
  }): Promise<void> {
    await this.db.insert(analysisJobs).values({
      id: params.id,
      userId: params.userId,
      gameId: params.gameId,
      status: "processing",
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  async listActiveByUser(userId: string): Promise<AnalysisJob[]> {
    const rows = await this.db
      .select()
      .from(analysisJobs)
      .where(and(eq(analysisJobs.userId, userId), ne(analysisJobs.status, "done")))
      .orderBy(desc(analysisJobs.createdAt));
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      status: row.status,
      gameId: row.gameId,
      logId: row.logId,
      reason: row.reason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async findForUser(id: string, userId: string): Promise<AnalysisJob | null> {
    const rows = await this.db
      .select()
      .from(analysisJobs)
      .where(and(eq(analysisJobs.id, id), eq(analysisJobs.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      status: row.status,
      gameId: row.gameId,
      logId: row.logId,
      reason: row.reason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async markDone(
    id: string,
    params: { gameId: string | null; logId: string | null; now: Date },
  ): Promise<void> {
    await this.db
      .update(analysisJobs)
      .set({ status: "done", gameId: params.gameId, logId: params.logId, updatedAt: params.now })
      .where(eq(analysisJobs.id, id));
  }

  async markFailed(id: string, params: { reason: string; now: Date }): Promise<void> {
    await this.db
      .update(analysisJobs)
      .set({ status: "failed", reason: params.reason, updatedAt: params.now })
      .where(eq(analysisJobs.id, id));
  }

  async markProcessing(id: string, params: { now: Date }): Promise<void> {
    await this.db
      .update(analysisJobs)
      .set({ status: "processing", reason: null, updatedAt: params.now })
      .where(eq(analysisJobs.id, id));
  }

  async deleteByGame(gameId: string): Promise<void> {
    await this.db.delete(analysisJobs).where(eq(analysisJobs.gameId, gameId));
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(analysisJobs).where(eq(analysisJobs.id, id));
  }
}
