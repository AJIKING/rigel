// infrastructure/kifu — GameLogRepository の Drizzle/D1 実装。

import { desc, eq } from "drizzle-orm";
import type { GameLog } from "../../domain/kifu/game-log";
import type { GameLogRepository } from "../../domain/kifu/game-log.repository";
import type { Db } from "../db/client";
import { gameLogs, type GameLogRow } from "../db/schema";

function toDomain(row: GameLogRow): GameLog {
  return {
    id: row.id,
    userId: row.userId,
    kifu: row.kifu,
    createdAt: row.createdAt,
  };
}

export class DrizzleGameLogRepository implements GameLogRepository {
  constructor(private readonly db: Db) {}

  async save(gameLog: GameLog): Promise<void> {
    await this.db
      .insert(gameLogs)
      .values({
        id: gameLog.id,
        userId: gameLog.userId,
        kifu: gameLog.kifu,
        createdAt: gameLog.createdAt,
      })
      .onConflictDoUpdate({
        target: gameLogs.id,
        set: { kifu: gameLog.kifu },
      });
  }

  async findById(id: string): Promise<GameLog | null> {
    const row = await this.db.select().from(gameLogs).where(eq(gameLogs.id, id)).get();
    return row ? toDomain(row) : null;
  }

  async listByUser(userId: string): Promise<GameLog[]> {
    const rows = await this.db
      .select()
      .from(gameLogs)
      .where(eq(gameLogs.userId, userId))
      .orderBy(desc(gameLogs.createdAt))
      .all();
    return rows.map(toDomain);
  }
}
