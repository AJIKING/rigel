CREATE INDEX `games_user_created_idx` ON `games` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `problems_user_created_idx` ON `problems` (`user_id`,`created_at`);