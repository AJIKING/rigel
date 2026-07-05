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
  /** Google アカウントのメール。緊急時・不正アカウント調査の運用のためだけに保存する。
   *  API では絶対にレスポンスしない（アプリ層の JSON 整形に含めない）。 */
  email: text("email"),
  /** 課金プラン（free / next=RIGEL Next / pro=RIGEL Pro）。 */
  plan: text("plan", { enum: ["free", "next", "pro"] })
    .notNull()
    .default("free"),
  /** 公開ハンドル(@xxx。共有URLに使う)。未設定は null。一意。 */
  handle: text("handle").unique(),
  /** 表示名（他ユーザーに見える名前）。 */
  displayName: text("display_name").notNull().default(""),
  /** 当月の Gemini 呼び出し回数（解析成功時のみ、実呼び出し数を加算）。 */
  analysisCountThisMonth: integer("analysis_count_this_month").notNull().default(0),
  /** この時刻を過ぎたら当月カウントをリセットする（次のリセット境界）。 */
  countResetAt: integer("count_reset_at", { mode: "timestamp_ms" }).notNull(),
  /** App Store サブスクの元トランザクションID（IAP 購入者のみ。更新/失効通知の照合キー）。 */
  appStoreOriginalTransactionId: text("appstore_original_transaction_id").unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// 半荘（ゲーム）。1半荘 = 複数局の牌譜(game_logs)のまとまり。
export const games = sqliteTable(
  "games",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** 任意のラベル（例: "6/28 友人戦"）。 */
    title: text("title").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("games_user_idx").on(t.userId)],
);

export const gameLogs = sqliteTable(
  "game_logs",
  {
    /** 牌譜ID（= 共有URL単位 / 課金単位）。1局のスナップショット。 */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** 所属する半荘。 */
    gameId: text("game_id").references(() => games.id),
    /** 半荘内での順序（東1局→… の表示順）。 */
    seq: integer("seq").notNull().default(0),
    /** 解析後の牌譜 JSON（KifuSchema 検証済み）。撮影画像は保存しない。 */
    kifu: text("kifu", { mode: "json" }).$type<Kifu>().notNull(),
    /** 公開範囲。public=他ユーザーも閲覧可 / private=所有者のみ。既定は private。 */
    visibility: text("visibility", { enum: ["public", "private"] })
      .notNull()
      .default("private"),
    /** 編集状態。draft=下書き / complete=編集済（公開フィードに出る）。
     *  既定は complete（既存データを確定扱いにする後方互換）。新規は作成時に draft を書く。 */
    status: text("status", { enum: ["draft", "complete"] })
      .notNull()
      .default("complete"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("game_logs_user_idx").on(t.userId),
    index("game_logs_game_idx").on(t.gameId),
    index("game_logs_visibility_idx").on(t.visibility),
    // 公開フィード（visibility=public かつ status=complete）用。
    index("game_logs_pub_idx").on(t.visibility, t.status),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type GameRow = typeof games.$inferSelect;
export type NewGameRow = typeof games.$inferInsert;
export type GameLogRow = typeof gameLogs.$inferSelect;
export type NewGameLogRow = typeof gameLogs.$inferInsert;
