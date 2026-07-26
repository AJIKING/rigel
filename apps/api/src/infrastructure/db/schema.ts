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

import { QuizKindSchema, type Kifu, type Problem, type ProblemAction } from "@rigel/schema";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  /** UUID。 */
  id: text("id").primaryKey(),
  /** Google認証の sub（一意）。Apple のみのユーザーは null（少なくとも一方は必須＝ドメイン層で保証）。 */
  googleSub: text("google_sub").unique(),
  /** Apple認証の sub（一意）。Google のみのユーザーは null。 */
  appleSub: text("apple_sub").unique(),
  /** Sign in with Apple の refresh token。退会時の失効（revoke。App Store 審査要件）専用。
   *  API では絶対にレスポンスしない。 */
  appleRefreshToken: text("apple_refresh_token"),
  /** アカウントのメール。緊急時・不正アカウント調査の運用のためだけに保存する。
   *  API では絶対にレスポンスしない（アプリ層の JSON 整形に含めない）。 */
  email: text("email"),
  /** 課金プラン（free / next=RIGEL Next / pro=RIGEL Pro）。 */
  plan: text("plan", { enum: ["free", "next", "pro"] })
    .notNull()
    .default("free"),
  /** 有料プランの購入経路（RevenueCat の store 値: "APP_STORE"|"PLAY_STORE"|"STRIPE"等）。
   *  web の購読管理の出し分けに使う。free / 不明（既存加入者）は null。 */
  planStore: text("plan_store"),
  /** 公開ハンドル(@xxx。共有URLに使う)。未設定は null。一意。 */
  handle: text("handle").unique(),
  /** 表示名（他ユーザーに見える名前）。 */
  displayName: text("display_name").notNull().default(""),
  /** 当月の Gemini 呼び出し回数（解析成功時のみ、実呼び出し数を加算）。 */
  analysisCountThisMonth: integer("analysis_count_this_month").notNull().default(0),
  /** この時刻を過ぎたら当月カウントをリセットする（次のリセット境界）。 */
  countResetAt: integer("count_reset_at", { mode: "timestamp_ms" }).notNull(),
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
     *  **DB 既定値は置かない**。既定 complete だと書き漏らしが「黙って公開側へ倒れる」
     *  最悪の失敗モードになるため（実際に AnalysisStore の status 漏れで下書きが
     *  公開フィードへ露出した）。書き込みは必ず toGameLogRow が値を入れる。 */
    status: text("status", { enum: ["draft", "complete"] }).notNull(),
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

// 何切る問題。1問 = 1レコード（共有URL単位）。盤面・答え・解説は Problem JSON で保持。
export const problems = sqliteTable(
  "problems",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** 任意のタイトル（例: "南3局の押し引き"）。 */
    title: text("title").notNull().default(""),
    /** 問題本体（ProblemSchema 検証済み JSON）。画像は扱わない。 */
    problem: text("problem", { mode: "json" }).$type<Problem>().notNull(),
    /** draft=下書き（所有者のみ） / published=公開（誰でも閲覧可）。 */
    status: text("status", { enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("problems_user_idx").on(t.userId),
    // 公開一覧（status=published を新着順）用。
    index("problems_status_idx").on(t.status, t.createdAt),
  ],
);

// 何切る問題への回答。1人1回（PK = problem_id + user_id。再回答は上書き）。
// API は choice_key ごとの件数だけを外に出す（誰が何と答えたかは返さない）。
export const problemAnswers = sqliteTable(
  "problem_answers",
  {
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** 回答の直列化キー（@rigel/schema の choiceKey）。分布集計の単位。 */
    choiceKey: text("choice_key").notNull(),
    action: text("action", { mode: "json" }).$type<ProblemAction>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.userId] }),
    index("problem_answers_problem_idx").on(t.problemId),
    index("problem_answers_user_idx").on(t.userId),
  ],
);

// 特訓クイズの60秒セッション。開始時に1行 INSERT（無料 1日3回の消費）し、
// 完了時に結果（total/correct/duration_ms）を書く。null のまま = 途中離脱（消費は戻さない）。
// 成績は本人のみ閲覧（他人向け API レスポンスに含めない）。画像・PII は持たない。
export const quizSessions = sqliteTable(
  "quiz_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** クイズ種別（@rigel/schema の QuizKind。enum は型レベルのみ＝D1 は text なので
     *  種目追加に migration は不要）。値は背骨からそのまま引く——手で並べ直すと
     *  背骨との差分が型エラーにならず黙って腐る（実際に種目追加で二重管理が発生した）。 */
    kind: text("kind", { enum: QuizKindSchema.options }).notNull(),
    /** 開始日（JST 'YYYY-MM-DD'）。無料 1日3回・JST 0時回復のカウントキー。 */
    startedDay: text("started_day").notNull(),
    /** 出題数。null = 未完了（開始しただけ・途中離脱）。 */
    total: integer("total"),
    /** 正解数（total 以下。入口で QuizResultSchema が強制）。 */
    correct: integer("correct"),
    /** 所要ミリ秒。 */
    durationMs: integer("duration_ms"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // 無料枠の当日開始数カウント用。
    index("quiz_sessions_user_day_idx").on(t.userId, t.startedDay),
    // 本人の履歴（期間グラフ）用。
    index("quiz_sessions_user_created_idx").on(t.userId, t.createdAt),
  ],
);

// お気に入り（★）。半荘（牌譜）と何切るの両方に付けられる。1人1対象1件（PK で保証）。
// target_type + target_id のポリモーフィックな参照なので外部キーは張れない。対象が消えても
// 行が残らないよう、半荘/問題の削除ユースケースと退会処理が明示的に消す（下記 repository）。
// API が外に出すのは「件数」と「自分が付けたか」だけで、誰が付けたかは返さない
// （problem_answers と同じプライバシー原則）。
export const favorites = sqliteTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    /** 対象の種別（game=半荘 / problem=何切る）。D1 は text なので種別追加に migration は不要。 */
    targetType: text("target_type", { enum: ["game", "problem"] }).notNull(),
    targetId: text("target_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    // 一覧カードのお気に入り数の集計（対象ごと）用。
    index("favorites_target_idx").on(t.targetType, t.targetId),
    // 自分のお気に入り一覧（新しい順）用。
    index("favorites_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/** 処理済みの RevenueCat Webhook イベント（冪等キー = event.id）。
 *  失効後に古い購入イベントが再送されてもプランが復活しないよう記録する。 */
export const revenuecatEvents = sqliteTable("revenuecat_events", {
  id: text("id").primaryKey(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type GameRow = typeof games.$inferSelect;
export type NewGameRow = typeof games.$inferInsert;
export type GameLogRow = typeof gameLogs.$inferSelect;
export type NewGameLogRow = typeof gameLogs.$inferInsert;
export type ProblemRow = typeof problems.$inferSelect;
export type NewProblemRow = typeof problems.$inferInsert;
export type ProblemAnswerRow = typeof problemAnswers.$inferSelect;
export type NewProblemAnswerRow = typeof problemAnswers.$inferInsert;
export type QuizSessionRow = typeof quizSessions.$inferSelect;
export type NewQuizSessionRow = typeof quizSessions.$inferInsert;
export type FavoriteRow = typeof favorites.$inferSelect;
export type NewFavoriteRow = typeof favorites.$inferInsert;
