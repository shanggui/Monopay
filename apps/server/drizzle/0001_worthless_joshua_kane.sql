CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`nickname` text NOT NULL,
	`avatar` text,
	`is_player` integer DEFAULT true NOT NULL,
	`is_banker` integer DEFAULT false NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` integer NOT NULL,
	`bankrupt_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `players_room_id_idx` ON `players` (`room_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_token_hash_unique` ON `players` (`token_hash`);--> statement-breakpoint
CREATE TABLE `room_events` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `room_events_room_id_created_at_idx` ON `room_events` (`room_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`host_identity` text NOT NULL,
	`host_player_id` text NOT NULL,
	`host_token_hash` text NOT NULL,
	`config_json` text NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`started_at` integer,
	`ended_at` integer,
	`settled_at` integer,
	`dissolved_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_unique` ON `rooms` (`code`);