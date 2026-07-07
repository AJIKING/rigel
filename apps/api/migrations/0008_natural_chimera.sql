CREATE TABLE `problem_answers` (
	`problem_id` text NOT NULL,
	`user_id` text NOT NULL,
	`choice_key` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`problem_id`, `user_id`),
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `problem_answers_problem_idx` ON `problem_answers` (`problem_id`);--> statement-breakpoint
CREATE INDEX `problem_answers_user_idx` ON `problem_answers` (`user_id`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`problem` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `problems_user_idx` ON `problems` (`user_id`);--> statement-breakpoint
CREATE INDEX `problems_status_idx` ON `problems` (`status`,`created_at`);