CREATE TABLE `game_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kifu` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `game_logs_user_idx` ON `game_logs` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_sub` text NOT NULL,
	`plan` text DEFAULT 'free' NOT NULL,
	`analysis_count_this_month` integer DEFAULT 0 NOT NULL,
	`count_reset_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);