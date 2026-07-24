CREATE TABLE `quiz_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`started_day` text NOT NULL,
	`total` integer,
	`correct` integer,
	`duration_ms` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `quiz_sessions_user_day_idx` ON `quiz_sessions` (`user_id`,`started_day`);--> statement-breakpoint
CREATE INDEX `quiz_sessions_user_created_idx` ON `quiz_sessions` (`user_id`,`created_at`);