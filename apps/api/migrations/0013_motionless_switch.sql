-- users に apple_sub / apple_refresh_token を追加し、google_sub を nullable 化する。
-- SQLite は列制約を変更できないためテーブル再構築が必要だが、users は全テーブルから
-- FK 参照される親であり、D1 では PRAGMA foreign_keys=OFF が使えず、DROP→RENAME 方式は
-- 「削除された親への参照」の違反が RENAME では解消されないため失敗する（本番で確認済み）。
-- そこで FK で連鎖する5テーブルを __new_* として作り直す:
--   1. __new_users（新スキーマ）を作成しコピー
--   2. 子テーブルを __new_users / __new_* 参照で作成しコピー（この時点で参照は常に充足）
--   3. 旧テーブルを子→親の順で DROP（残る制約はどれも旧テーブルを参照していない）
--   4. RENAME で元名へ（SQLite の RENAME が __new_* 間の FK 参照を最終名へ書き換える）
-- この順序ならどの文の時点でも FK 違反が発生しない（defer は保険）。
PRAGMA defer_foreign_keys = true;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text,
	`apple_sub` text,
	`apple_refresh_token` text,
	`email` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`plan_store` text,
	`handle` text,
	`display_name` text DEFAULT '' NOT NULL,
	`analysis_count_this_month` integer DEFAULT 0 NOT NULL,
	`count_reset_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "google_sub", "apple_sub", "apple_refresh_token", "email", "plan", "plan_store", "handle", "display_name", "analysis_count_this_month", "count_reset_at", "created_at") SELECT "id", "google_sub", NULL, NULL, "email", "plan", "plan_store", "handle", "display_name", "analysis_count_this_month", "count_reset_at", "created_at" FROM `users`;--> statement-breakpoint
CREATE TABLE `__new_games` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `__new_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_games`("id", "user_id", "title", "created_at") SELECT "id", "user_id", "title", "created_at" FROM `games`;--> statement-breakpoint
CREATE TABLE `__new_game_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game_id` text,
	`seq` integer DEFAULT 0 NOT NULL,
	`kifu` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `__new_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `__new_games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_game_logs`("id", "user_id", "game_id", "seq", "kifu", "visibility", "status", "created_at") SELECT "id", "user_id", "game_id", "seq", "kifu", "visibility", "status", "created_at" FROM `game_logs`;--> statement-breakpoint
CREATE TABLE `__new_problems` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`problem` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `__new_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_problems`("id", "user_id", "title", "problem", "status", "created_at") SELECT "id", "user_id", "title", "problem", "status", "created_at" FROM `problems`;--> statement-breakpoint
CREATE TABLE `__new_problem_answers` (
	`problem_id` text NOT NULL,
	`user_id` text NOT NULL,
	`choice_key` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`problem_id`, `user_id`),
	FOREIGN KEY (`problem_id`) REFERENCES `__new_problems`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `__new_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_problem_answers`("problem_id", "user_id", "choice_key", "action", "created_at") SELECT "problem_id", "user_id", "choice_key", "action", "created_at" FROM `problem_answers`;--> statement-breakpoint
DROP TABLE `problem_answers`;--> statement-breakpoint
DROP TABLE `game_logs`;--> statement-breakpoint
DROP TABLE `problems`;--> statement-breakpoint
DROP TABLE `games`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
ALTER TABLE `__new_games` RENAME TO `games`;--> statement-breakpoint
ALTER TABLE `__new_game_logs` RENAME TO `game_logs`;--> statement-breakpoint
ALTER TABLE `__new_problems` RENAME TO `problems`;--> statement-breakpoint
ALTER TABLE `__new_problem_answers` RENAME TO `problem_answers`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_apple_sub_unique` ON `users` (`apple_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);--> statement-breakpoint
CREATE INDEX `games_user_idx` ON `games` (`user_id`);--> statement-breakpoint
CREATE INDEX `game_logs_user_idx` ON `game_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `game_logs_game_idx` ON `game_logs` (`game_id`);--> statement-breakpoint
CREATE INDEX `game_logs_visibility_idx` ON `game_logs` (`visibility`);--> statement-breakpoint
CREATE INDEX `game_logs_pub_idx` ON `game_logs` (`visibility`,`status`);--> statement-breakpoint
CREATE INDEX `problem_answers_problem_idx` ON `problem_answers` (`problem_id`);--> statement-breakpoint
CREATE INDEX `problem_answers_user_idx` ON `problem_answers` (`user_id`);--> statement-breakpoint
CREATE INDEX `problems_status_idx` ON `problems` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `problems_user_idx` ON `problems` (`user_id`);
