// infrastructure/user — AccountStore の Drizzle/D1 実装。
// アカウント削除を D1 の batch（1トランザクション）で行い、部分失敗による孤児を残さない。

import { and, eq, inArray } from "drizzle-orm";
import type { AccountStore } from "../../domain/user/account-store";
import type { Db } from "../db/client";
import {
  analysisJobs,
  favorites,
  gameLogs,
  games,
  problemAnswers,
  problems,
  quizSessions,
  users,
} from "../db/schema";

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
    // 自分の半荘 id（それに付いた他人の★も消すため）。
    const ownedGames = await this.db
      .select({ id: games.id })
      .from(games)
      .where(eq(games.userId, userId))
      .all();
    const ownedGameIds = ownedGames.map((g) => g.id);

    // FK の向きに沿った順序で1トランザクション
    // （★ → 回答 → 問題 → 局 → 半荘 → 特訓成績 → ユーザー）。
    // ★（favorites）は users への FK を持つので、消し漏らすと退会そのものが FK 違反で失敗する。
    const statements = [
      // 自分が付けた★（他人の投稿へ付けた分も含む）。
      this.db.delete(favorites).where(eq(favorites.userId, userId)),
      // 自分の投稿に他人が付けた★（対象が消えるので孤児にしない）。
      ...(ownedGameIds.length > 0
        ? [
            this.db
              .delete(favorites)
              .where(
                and(eq(favorites.targetType, "game"), inArray(favorites.targetId, ownedGameIds)),
              ),
          ]
        : []),
      ...(ownedIds.length > 0
        ? [
            this.db
              .delete(favorites)
              .where(
                and(eq(favorites.targetType, "problem"), inArray(favorites.targetId, ownedIds)),
              ),
          ]
        : []),
      this.db.delete(problemAnswers).where(eq(problemAnswers.userId, userId)),
      ...(ownedIds.length > 0
        ? [this.db.delete(problemAnswers).where(inArray(problemAnswers.problemId, ownedIds))]
        : []),
      this.db.delete(problems).where(eq(problems.userId, userId)),
      this.db.delete(gameLogs).where(eq(gameLogs.userId, userId)),
      this.db.delete(games).where(eq(games.userId, userId)),
      this.db.delete(quizSessions).where(eq(quizSessions.userId, userId)),
      // 解析ジョブも users への FK を持つ（消し漏らすと退会が FK 違反で落ちる）。
      this.db.delete(analysisJobs).where(eq(analysisJobs.userId, userId)),
      this.db.delete(users).where(eq(users.id, userId)),
    ] as const;

    await this.db.batch(statements as unknown as Parameters<Db["batch"]>[0]);
  }
}
