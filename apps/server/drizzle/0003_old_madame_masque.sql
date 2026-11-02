CREATE TABLE `asset_snapshots` (
	`room_id` text NOT NULL,
	`player_id` text NOT NULL,
	`property_value` integer DEFAULT 0 NOT NULL,
	`debt` integer DEFAULT 0 NOT NULL,
	`note` text,
	`updated_by` text,
	`reason` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`room_id`, `player_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`rankings_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settlements_room_unique` ON `settlements` (`room_id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `refund_of` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `reversal_of` text;