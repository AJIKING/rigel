-- game_logs.status の DB 既定値（'complete'）を撤去する。
-- 既定 complete は「書き漏らしが黙って公開側へ倒れる」失敗モードで、実際に
-- AnalysisStore の status 漏れにより下書きが公開フィードへ露出した。以後は
-- 書き込み側（toGameLogRow）が必ず値を入れ、漏れたら NOT NULL で即エラーにする。
-- 既存行の値はそのまま引き継ぐ（/analyze 由来の局は complete で保存されているため、
-- 下書きに戻したい半荘は編集画面の「下書き/編集済」トグルで直す）。
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_game_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`game_id` text,
	`seq` integer DEFAULT 0 NOT NULL,
	`kifu` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_game_logs`("id", "user_id", "game_id", "seq", "kifu", "visibility", "status", "created_at") SELECT "id", "user_id", "game_id", "seq", "kifu", "visibility", "status", "created_at" FROM `game_logs`;--> statement-breakpoint
DROP TABLE `game_logs`;--> statement-breakpoint
ALTER TABLE `__new_game_logs` RENAME TO `game_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `game_logs_user_idx` ON `game_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `game_logs_game_idx` ON `game_logs` (`game_id`);--> statement-breakpoint
CREATE INDEX `game_logs_visibility_idx` ON `game_logs` (`visibility`);--> statement-breakpoint
CREATE INDEX `game_logs_pub_idx` ON `game_logs` (`visibility`,`status`);