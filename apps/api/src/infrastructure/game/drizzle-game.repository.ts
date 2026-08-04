// infrastructure/game — GameRepository の Drizzle/D1 実装。

import type { ListCursor } from "@rigel/schema";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { Game } from "../../domain/game/game";
import type { GameRepository } from "../../domain/game/game.repository";
import type { Db } from "../db/client";
import { games, type GameRow } from "../db/schema";

function toDomain(row: GameRow): Game {
  return { id: row.id, userId: row.userId, title: row.title, createdAt: row.createdAt };
}

export class DrizzleGameRepository implements GameRepository {
  constructor(private readonly db: Db) {}

  async listByUser(userId: string): Promise<Game[]> {
    const rows = await this.db
      .select()
      .from(games)
      .where(eq(games.userId, userId))
      .orderBy(desc(games.createdAt))
      .all();
    return rows.map(toDomain);
  }

  async listByUserPage(userId: string, limit: number, cursor: ListCursor | null): Promise<Game[]> {
    const rows = await this.db
      .select()
      .from(games)
      .where(
        and(
          eq(games.userId, userId),
          cursor === null
            ? undefined
            : or(
                lt(games.createdAt, new Date(cursor.ms)),
                and(eq(games.createdAt, new Date(cursor.ms)), lt(games.id, cursor.id)),
              ),
        ),
      )
      .orderBy(desc(games.createdAt), desc(games.id))
      .limit(limit)
      .all();
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Game | null> {
    const row = await this.db.select().from(games).where(eq(games.id, id)).get();
    return row ? toDomain(row) : null;
  }

  async save(game: Game): Promise<void> {
    await this.db
      .insert(games)
      .values({ id: game.id, userId: game.userId, title: game.title, createdAt: game.createdAt })
      .onConflictDoUpdate({ target: games.id, set: { title: game.title } });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(games).where(eq(games.id, id));
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(games).where(eq(games.userId, userId));
  }
}
