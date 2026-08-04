// infrastructure/kifu — GameLogRepository の Drizzle/D1 実装。

import type { ListCursor } from "@rigel/schema";
import { and, asc, countDistinct, desc, eq, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import type { GameLog, KifuStatus, Visibility } from "../../domain/kifu/game-log";
import type { GameLogRepository, PublicGameGroup } from "../../domain/kifu/game-log.repository";
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

  async listPublicGameGroups(
    limit: number,
    cursor: ListCursor | null,
    userId?: string,
  ): Promise<PublicGameGroup[]> {
    // kifu カラムを SELECT しない（＝巨大 JSON を読まない・parse しない）。
    // GROUP BY game_id で半荘を直接ページングする（Plan: docs/plans/list-pagination.md 3-4）。
    // latestLogId は SQLite の「MAX() と同じ行の裸カラム」仕様で最新公開局の id を取る
    // （D1 も sql.js も SQLite なので依存してよい・ドキュメント化された挙動）。
    const latestMs = sql<number>`max(${gameLogs.createdAt})`;
    const base = this.db
      .select({
        gameId: gameLogs.gameId,
        latestLogId: gameLogs.id,
        latestMs,
        publicCount: sql<number>`count(*)`,
      })
      .from(gameLogs)
      .where(
        and(
          eq(gameLogs.visibility, "public"),
          eq(gameLogs.status, "complete"),
          isNotNull(gameLogs.gameId),
          userId === undefined ? undefined : eq(gameLogs.userId, userId),
        ),
      )
      .groupBy(gameLogs.gameId);
    const rows = await (
      cursor === null
        ? base
        : base.having(
            or(
              sql`${latestMs} < ${cursor.ms}`,
              and(sql`${latestMs} = ${cursor.ms}`, lt(gameLogs.gameId, cursor.id)),
            ),
          )
    )
      .orderBy(desc(latestMs), desc(gameLogs.gameId))
      .limit(limit)
      .all();
    return rows.map((r) => ({
      gameId: r.gameId!,
      latestAt: new Date(r.latestMs),
      latestLogId: r.latestLogId,
      publicCount: r.publicCount,
    }));
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
