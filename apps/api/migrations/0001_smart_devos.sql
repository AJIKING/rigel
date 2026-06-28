CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `games_user_idx` ON `games` (`user_id`);--> statement-breakpoint
ALTER TABLE `game_logs` ADD `game_id` text REFERENCES games(id);--> statement-breakpoint
ALTER TABLE `game_logs` ADD `seq` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `game_logs_game_idx` ON `game_logs` (`game_id`);