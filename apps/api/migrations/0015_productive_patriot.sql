CREATE TABLE `favorites` (
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `target_type`, `target_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `favorites_target_idx` ON `favorites` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `favorites_user_created_idx` ON `favorites` (`user_id`,`created_at`);