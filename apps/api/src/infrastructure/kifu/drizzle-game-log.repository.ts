// infrastructure/kifu — GameLogRepository の Drizzle/D1 実装。

import { KifuSchema } from "@rigel/schema";
import { and, asc, countDistinct, desc, eq, ne } from "drizzle-orm";
import type { GameLog, KifuStatus, Visibility } from "../../domain/kifu/game-log";
import type { GameLogRepository } from "../../domain/kifu/game-log.repository";
import type { Db } from "../db/client";
import { gameLogs, type GameLogRow } from "../db/schema";

function toDomain(row: GameLogRow): GameLog {
  return {
    id: row.id,
    userId: row.userId,
    gameId: row.gameId,
    seq: row.seq,
    // 保存済み牌譜をスキーマで正規化し、後から増えたフィールド（rules/agari 等）に
    // 既定を埋める（旧データの後方互換）。
    kifu: KifuSchema.parse(row.kifu),
    visibility: row.visibility,
    status: row.status,
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
        status: gameLog.status,
        createdAt: gameLog.createdAt,
      })
      .onConflictDoUpdate({
        target: gameLogs.id,
        set: {
          kifu: gameLog.kifu,
          gameId: gameLog.gameId,
          seq: gameLog.seq,
          visibility: gameLog.visibility,
          status: gameLog.status,
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
