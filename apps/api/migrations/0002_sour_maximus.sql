ALTER TABLE `game_logs` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
CREATE INDEX `game_logs_visibility_idx` ON `game_logs` (`visibility`);