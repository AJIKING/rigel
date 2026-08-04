ALTER TABLE `quiz_sessions` ADD `seed` integer;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `quiz_sessions` ADD `records` text;--> statement-breakpoint
CREATE INDEX `quiz_sessions_kind_created_idx` ON `quiz_sessions` (`kind`,`created_at`);