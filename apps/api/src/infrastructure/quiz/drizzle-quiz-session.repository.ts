// infrastructure/quiz — QuizSessionRepository の Drizzle/D1 実装。
// 履歴クエリは「本人の・完了済み（total IS NOT NULL）のみ」を SQL で強制する
// （他人の成績・未完了の放棄行をアプリ層まで持ち込まない）。

import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { CompletedQuizSession, QuizSession } from "../../domain/quiz/quiz-session";
import type { QuizSessionRepository } from "../../domain/quiz/quiz-session.repository";
import type { Db } from "../db/client";
import { quizSessions, type QuizSessionRow } from "../db/schema";

function toDomain(row: QuizSessionRow): QuizSession {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    startedDay: row.startedDay,
    total: row.total,
    correct: row.correct,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
  };
}

export class DrizzleQuizSessionRepository implements QuizSessionRepository {
  constructor(private readonly db: Db) {}

  async insert(session: QuizSession): Promise<void> {
    await this.db.insert(quizSessions).values(session);
  }

  async findById(id: string): Promise<QuizSession | null> {
    const row = await this.db.select().from(quizSessions).where(eq(quizSessions.id, id)).get();
    return row ? toDomain(row) : null;
  }

  async countByUserAndDay(userId: string, day: string): Promise<number> {
    const row = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(quizSessions)
      .where(and(eq(quizSessions.userId, userId), eq(quizSessions.startedDay, day)))
      .get();
    return row?.n ?? 0;
  }

  async update(session: QuizSession): Promise<void> {
    await this.db
      .update(quizSessions)
      .set({ total: session.total, correct: session.correct, durationMs: session.durationMs })
      .where(eq(quizSessions.id, session.id));
  }

  async listCompletedByUser(
    userId: string,
    since: Date | null,
    limit: number,
  ): Promise<CompletedQuizSession[]> {
    const conditions = [
      eq(quizSessions.userId, userId),
      isNotNull(quizSessions.total),
      ...(since === null ? [] : [gte(quizSessions.createdAt, since)]),
    ];
    const rows = await this.db
      .select()
      .from(quizSessions)
      .where(and(...conditions))
      .orderBy(desc(quizSessions.createdAt))
      .limit(limit)
      .all();
    return rows.map((r) => toDomain(r) as CompletedQuizSession);
  }
}
