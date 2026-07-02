ALTER TABLE `game_logs` ADD `status` text DEFAULT 'complete' NOT NULL;--> statement-breakpoint
CREATE INDEX `game_logs_pub_idx` ON `game_logs` (`visibility`,`status`);