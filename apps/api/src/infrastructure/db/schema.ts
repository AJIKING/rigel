// ============================================================
// infrastructure/db — Drizzle スキーマ（Cloudflare D1 / SQLite）
// ------------------------------------------------------------
// 設計ドキュメント 5章の D1 テーブルを Drizzle で定義する。
// 牌譜本体(kifu)は背骨スキーマ(@rigel/schema)の Kifu を JSON 列として保持する。
// 撮影画像は保存しない（game_logs に入るのは解析後の Kifu JSON のみ）。
//
// マイグレーション: `pnpm --filter api db:generate`（drizzle-kit）→ migrations/ に SQL 出力。
//                   `pnpm --filter api db:migrate:local|db:migrate`（wrangler d1）で適用。
// ============================================================

import type { Kifu } from "@rigel/schema";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  /** UUID。 */
  id: text("id").primaryKey(),
  /** Google認証の sub（一意）。 */
  googleSub: text("google_sub").notNull().unique(),
  /** 課金プラン。 */
  plan: text("plan", { enum: ["free", "paid"] })
    .notNull()
    .default("free"),
  /** 当月の解析回数（成功時のみ加算）。 */
  analysisCountThisMonth: integer("analysis_count_this_month").notNull().default(0),
  /** この時刻を過ぎたら当月カウントをリセットする（次のリセット境界）。 */
  countResetAt: integer("count_reset_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const gameLogs = sqliteTable(
  "game_logs",
  {
    /** 牌譜ID（= 共有URL単位 / 課金単位）。 */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** 解析後の牌譜 JSON（KifuSchema 検証済み）。撮影画像は保存しない。 */
    kifu: text("kifu", { mode: "json" }).$type<Kifu>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("game_logs_user_idx").on(t.userId)],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type GameLogRow = typeof gameLogs.$inferSelect;
export type NewGameLogRow = typeof gameLogs.$inferInsert;
