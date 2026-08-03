CREATE TABLE `problem_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`kifu` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `problem_drafts_user_idx` ON `problem_drafts` (`user_id`);--> statement-breakpoint
ALTER TABLE `problems` ADD `photo_draft_id` text;