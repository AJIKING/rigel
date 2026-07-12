// infrastructure/analysis — AnalysisStore の Drizzle/D1 実装。
// D1 の batch（複数文を1トランザクションで実行）で、半荘・局・カウント更新を原子化する。

import { eq, sql } from "drizzle-orm";
import type { AnalysisCommitInput, AnalysisStore } from "../../domain/analysis/analysis-store";
import type { Db } from "../db/client";
import { gameLogs, games, users } from "../db/schema";
import { toGameLogRow } from "../kifu/game-log-row";

export class DrizzleAnalysisStore implements AnalysisStore {
  constructor(private readonly db: Db) {}

  async commit({ newGame, gameLog, counter }: AnalysisCommitInput): Promise<void> {
    // 行の組み立ては単一真実源（game-log-row）。ここで手書きすると
    // カラム追加時に GameLogRepository.save と乖離する（status 漏れの再発防止）。
    const insertLog = this.db.insert(gameLogs).values(toGameLogRow(gameLog));

    // カウンタは「読んで足して書き戻す」のではなく、単一 UPDATE 文で加算する
    //（並行コミットの lost update ＝ 枠超過方向の取りこぼしを防ぐ）。
    // 月境界のリセットも同じ文で表現し、判定ロジック（nextResetAt）はドメインが計算する。
    const now = counter.now.getTime();
    const nextReset = counter.nextResetAt.getTime();
    const updateUser = this.db
      .update(users)
      .set({
        analysisCountThisMonth: sql`CASE WHEN ${users.countResetAt} <= ${now}
          THEN ${counter.calls}
          ELSE ${users.analysisCountThisMonth} + ${counter.calls} END`,
        countResetAt: sql`CASE WHEN ${users.countResetAt} <= ${now}
          THEN ${nextReset}
          ELSE ${users.countResetAt} END`,
      })
      .where(eq(users.id, counter.userId));

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
