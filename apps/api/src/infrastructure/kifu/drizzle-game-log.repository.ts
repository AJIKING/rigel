// infrastructure/kifu — GameLogRepository の Drizzle/D1 実装。

import { and, asc, countDistinct, desc, eq, ne } from "drizzle-orm";
import type { GameLog, KifuStatus, Visibility } from "../../domain/kifu/game-log";
import type { GameLogRepository } from "../../domain/kifu/game-log.repository";
import type { Db } from "../db/client";
import { gameLogs } from "../db/schema";
import { toGameLog as toDomain, toGameLogRow } from "./game-log-row";

export class DrizzleGameLogRepository implements GameLogRepository {
  constructor(private readonly db: Db) {}

  async save(gameLog: GameLog): Promise<void> {
    // 行の組み立ては単一真実源（game-log-row）。AnalysisStore の insert と同じ形になる。
    const row = toGameLogRow(gameLog);
    await this.db
      .insert(gameLogs)
      .values(row)
      .onConflictDoUpdate({
        target: gameLogs.id,
        set: {
          kifu: row.kifu,
          gameId: row.gameId,
          seq: row.seq,
          visibility: row.visibility,
          status: row.status,
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

  async countGamesByUserAndStatus(
    userId: string,
    status: KifuStatus,
    excludeGameId?: string,
  ): Promise<number> {
    const row = await this.db
      .select({ n: countDistinct(gameLogs.gameId) })
      .from(gameLogs)
      .where(
        and(
          eq(gameLogs.userId, userId),
          eq(gameLogs.status, status),
          excludeGameId ? ne(gameLogs.gameId, excludeGameId) : undefined,
        ),
      )
      .get();
    return row?.n ?? 0;
  }

  async countGamesByUserVisibilityStatus(
    userId: string,
    visibility: Visibility,
    status: KifuStatus,
    excludeGameId?: string,
  ): Promise<number> {
    const row = await this.db
      .select({ n: countDistinct(gameLogs.gameId) })
      .from(gameLogs)
      .where(
        and(
          eq(gameLogs.userId, userId),
          eq(gameLogs.visibility, visibility),
          eq(gameLogs.status, status),
          excludeGameId ? ne(gameLogs.gameId, excludeGameId) : undefined,
        ),
      )
      .get();
    return row?.n ?? 0;
  }

  async listPublic(limit: number): Promise<GameLog[]> {
    const rows = await this.db
      .select()
      .from(gameLogs)
      .where(and(eq(gameLogs.visibility, "public"), eq(gameLogs.status, "complete")))
      .orderBy(desc(gameLogs.createdAt))
      .limit(limit)
      .all();
    return rows.map(toDomain);
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(gameLogs).where(eq(gameLogs.id, id));
  }

  async deleteByGame(gameId: string): Promise<void> {
    await this.db.delete(gameLogs).where(eq(gameLogs.gameId, gameId));
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(gameLogs).where(eq(gameLogs.userId, userId));
  }
}
