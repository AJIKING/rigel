// infrastructure/billing — RevenueCatEventRepository の Drizzle/D1 実装。
// Webhook の冪等処理（event.id の記録）。同一イベントの再送を plan に二重適用しない。

import { eq } from "drizzle-orm";
import type { RevenueCatEventRepository } from "../../domain/billing/revenuecat";
import type { Db } from "../db/client";
import { revenuecatEvents } from "../db/schema";

export class DrizzleRevenueCatEventRepository implements RevenueCatEventRepository {
  constructor(private readonly db: Db) {}

  async isProcessed(eventId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: revenuecatEvents.id })
      .from(revenuecatEvents)
      .where(eq(revenuecatEvents.id, eventId))
      .limit(1);
    return rows.length > 0;
  }

  async markProcessed(eventId: string): Promise<void> {
    // 並行再送とぶつかっても落とさない（changePlan は同値収束なので重複適用は無害）。
    await this.db.insert(revenuecatEvents).values({ id: eventId }).onConflictDoNothing();
  }
}
