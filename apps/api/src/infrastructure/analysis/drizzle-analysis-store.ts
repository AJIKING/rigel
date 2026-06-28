// infrastructure/analysis — AnalysisStore の Drizzle/D1 実装。
// D1 の batch（複数文を1トランザクションで実行）で、半荘・局・カウント更新を原子化する。

import { eq } from "drizzle-orm";
import type { AnalysisCommitInput, AnalysisStore } from "../../domain/analysis/analysis-store";
import type { Db } from "../db/client";
import { gameLogs, games, users } from "../db/schema";

export class DrizzleAnalysisStore implements AnalysisStore {
  constructor(private readonly db: Db) {}

  async commit({ newGame, gameLog, user }: AnalysisCommitInput): Promise<void> {
    const p = user.toProps();

    const insertLog = this.db.insert(gameLogs).values({
      id: gameLog.id,
      userId: gameLog.userId,
      gameId: gameLog.gameId,
      seq: gameLog.seq,
      kifu: gameLog.kifu,
      createdAt: gameLog.createdAt,
    });

    const updateUser = this.db
      .update(users)
      .set({ analysisCountThisMonth: p.analysisCountThisMonth, countResetAt: p.countResetAt })
      .where(eq(users.id, p.id));

    if (newGame) {
      const insertGame = this.db.insert(games).values({
        id: newGame.id,
        userId: newGame.userId,
        title: newGame.title,
        createdAt: newGame.createdAt,
      });
      await this.db.batch([insertGame, insertLog, updateUser]);
    } else {
      await this.db.batch([insertLog, updateUser]);
    }
  }
}
