// infrastructure/favorite — FavoriteRepository の Drizzle/D1 実装。
// 1人1対象1件（PK = user_id + target_type + target_id）。二度押しは onConflictDoNothing で
// 冪等にし、最初に付けた時刻を保つ（並べ替えが押し直しで変わらないように）。
// 対象はポリモーフィックで外部キーが無いため、対象削除・退会の掃除はこの実装の
// deleteByTarget / deleteByUser を呼ぶ側（ユースケース）の責務。

import { and, count, desc, eq, inArray } from "drizzle-orm";
import type {
  Favorite,
  FavoriteRepository,
  FavoriteTargetType,
} from "../../domain/favorite/favorite.repository";
import type { Db } from "../db/client";
import { favorites, type FavoriteRow } from "../db/schema";

function toDomain(row: FavoriteRow): Favorite {
  return {
    userId: row.userId,
    targetType: row.targetType,
    targetId: row.targetId,
    createdAt: row.createdAt,
  };
}

export class DrizzleFavoriteRepository implements FavoriteRepository {
  constructor(private readonly db: Db) {}

  async add(favorite: Favorite): Promise<void> {
    await this.db
      .insert(favorites)
      .values({
        userId: favorite.userId,
        targetType: favorite.targetType,
        targetId: favorite.targetId,
        createdAt: favorite.createdAt,
      })
      // 二度押しは「何もしない」。上書きにすると createdAt が動いて並び順が揺れる。
      .onConflictDoNothing();
  }

  async remove(userId: string, targetType: FavoriteTargetType, targetId: string): Promise<void> {
    await this.db
      .delete(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.targetType, targetType),
          eq(favorites.targetId, targetId),
        ),
      );
  }

  async listByUser(userId: string): Promise<Favorite[]> {
    const rows = await this.db
      .select()
      .from(favorites)
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt))
      .all();
    return rows.map(toDomain);
  }

  async countsByTargets(
    targetType: FavoriteTargetType,
    targetIds: readonly string[],
  ): Promise<Record<string, number>> {
    // 空配列で inArray を組むと SQL が壊れる／全件走査になるため先に返す。
    if (targetIds.length === 0) return {};
    const rows = await this.db
      .select({ targetId: favorites.targetId, n: count() })
      .from(favorites)
      .where(and(eq(favorites.targetType, targetType), inArray(favorites.targetId, [...targetIds])))
      .groupBy(favorites.targetId)
      .all();
    return Object.fromEntries(rows.map((r) => [r.targetId, r.n]));
  }

  async findMineIn(
    userId: string,
    targetType: FavoriteTargetType,
    targetIds: readonly string[],
  ): Promise<Set<string>> {
    if (targetIds.length === 0) return new Set();
    const rows = await this.db
      .select({ targetId: favorites.targetId })
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.targetType, targetType),
          inArray(favorites.targetId, [...targetIds]),
        ),
      )
      .all();
    return new Set(rows.map((r) => r.targetId));
  }

  async deleteByTarget(targetType: FavoriteTargetType, targetId: string): Promise<void> {
    await this.db
      .delete(favorites)
      .where(and(eq(favorites.targetType, targetType), eq(favorites.targetId, targetId)));
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(favorites).where(eq(favorites.userId, userId));
  }
}
