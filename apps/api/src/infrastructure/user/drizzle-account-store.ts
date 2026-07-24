// infrastructure/user — AccountStore の Drizzle/D1 実装。
// アカウント削除を D1 の batch（1トランザクション）で行い、部分失敗による孤児を残さない。

import { eq, inArray } from "drizzle-orm";
import type { AccountStore } from "../../domain/user/account-store";
import type { Db } from "../db/client";
import { gameLogs, games, problemAnswers, problems, quizSessions, users } from "../db/schema";

export class DrizzleAccountStore implements AccountStore {
  constructor(private readonly db: Db) {}

  async deleteAll(userId: string): Promise<void> {
    // 自分の問題 id（それに付いた他人の回答も消すため、先に集める）。
    const owned = await this.db
      .select({ id: problems.id })
      .from(problems)
      .where(eq(problems.userId, userId))
      .all();
    const ownedIds = owned.map((p) => p.id);

    // FK の向きに沿った順序で1トランザクション（回答 → 問題 → 局 → 半荘 → 特訓成績 → ユーザー）。
    const statements = [
      this.db.delete(problemAnswers).where(eq(problemAnswers.userId, userId)),
      ...(ownedIds.length > 0
        ? [this.db.delete(problemAnswers).where(inArray(problemAnswers.problemId, ownedIds))]
        : []),
      this.db.delete(problems).where(eq(problems.userId, userId)),
      this.db.delete(gameLogs).where(eq(gameLogs.userId, userId)),
      this.db.delete(games).where(eq(games.userId, userId)),
      this.db.delete(quizSessions).where(eq(quizSessions.userId, userId)),
      this.db.delete(users).where(eq(users.id, userId)),
    ] as const;

    await this.db.batch(statements as unknown as Parameters<Db["batch"]>[0]);
  }
}
