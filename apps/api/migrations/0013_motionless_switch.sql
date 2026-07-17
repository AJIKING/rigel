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
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_apple_sub_unique` ON `users` (`apple_sub`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);