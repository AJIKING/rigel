// infrastructure/quiz — QuizSessionRepository の Drizzle/D1 実装。
// 履歴クエリは「本人の・完了済み（total IS NOT NULL）のみ」を SQL で強制する
// （他人の成績・未完了の放棄行をアプリ層まで持ち込まない）。

import type { QuizKind, QuizRankingRow } from "@rigel/schema";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { CompletedQuizSession, QuizSession } from "../../domain/quiz/quiz-session";
import type { QuizSessionRepository } from "../../domain/quiz/quiz-session.repository";
import type { Db } from "../db/client";
import { quizSessions, users, type QuizSessionRow } from "../db/schema";

function toDomain(row: QuizSessionRow): QuizSession {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    startedDay: row.startedDay,
    seed: row.seed,
    total: row.total,
    correct: row.correct,
    durationMs: row.durationMs,
    verified: row.verified,
    records: row.records,
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
      .set({
        total: session.total,
        correct: session.correct,
        durationMs: session.durationMs,
        verified: session.verified,
        records: session.records,
      })
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

  async aggregateVerified(kind: QuizKind, since: Date | null): Promise<QuizRankingRow[]> {
    // verified（サーバ再採点＋実時間チェック通過）だけを数える＝クライアント申告値を
    // ランキングに載せない。index は (kind, created_at)。
    const conditions = [
      eq(quizSessions.kind, kind),
      eq(quizSessions.verified, true),
      isNotNull(quizSessions.total),
      ...(since === null ? [] : [gte(quizSessions.createdAt, since)]),
    ];
    const rows = await this.db
      .select({
        userId: quizSessions.userId,
        handle: users.handle,
        displayName: users.displayName,
        correct: sql<number>`sum(${quizSessions.correct})`,
        total: sql<number>`sum(${quizSessions.total})`,
      })
      .from(quizSessions)
      .innerJoin(users, eq(users.id, quizSessions.userId))
      .where(and(...conditions))
      .groupBy(quizSessions.userId)
      .all();
    return rows.map((r) => ({
      userId: r.userId,
      // handle 未設定（旧アカウント想定の防御）は空文字（表示は displayName が担う）。
      handle: r.handle ?? "",
      displayName: r.displayName,
      correct: r.correct,
      total: r.total,
    }));
  }
}
