// infrastructure/kifu — GameLogRepository の Drizzle/D1 実装。

import { and, asc, count, desc, eq } from "drizzle-orm";
import type { GameLog, Visibility } from "../../domain/kifu/game-log";
import type { GameLogRepository } from "../../domain/kifu/game-log.repository";
import type { Db } from "../db/client";
import { gameLogs, type GameLogRow } from "../db/schema";

function toDomain(row: GameLogRow): GameLog {
  return {
    id: row.id,
    userId: row.userId,
    gameId: row.gameId,
    seq: row.seq,
    kifu: row.kifu,
    visibility: row.visibility,
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
        gameId: gameLog.gameId,
        seq: gameLog.seq,
        kifu: gameLog.kifu,
        visibility: gameLog.visibility,
        createdAt: gameLog.createdAt,
      })
      .onConflictDoUpdate({
        target: gameLogs.id,
        set: {
          kifu: gameLog.kifu,
          gameId: gameLog.gameId,
          seq: gameLog.seq,
          visibility: gameLog.visibility,
        },
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

  async listByGame(gameId: string): Promise<GameLog[]> {
    const rows = await this.db
      .select()
      .from(gameLogs)
      .where(eq(gameLogs.gameId, gameId))
      .orderBy(asc(gameLogs.seq), asc(gameLogs.createdAt))
      .all();
    return rows.map(toDomain);
  }

  async countByUserAndVisibility(userId: string, visibility: Visibility): Promise<number> {
    const row = await this.db
      .select({ n: count() })
      .from(gameLogs)
      .where(and(eq(gameLogs.userId, userId), eq(gameLogs.visibility, visibility)))
      .get();
    return row?.n ?? 0;
  }
}
