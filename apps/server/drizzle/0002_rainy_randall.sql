CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`seq` integer NOT NULL,
	`from_type` text NOT NULL,
	`from_player_id` text,
	`to_type` text NOT NULL,
	`to_player_id` text,
	`amount` integer NOT NULL,
	`balance_after_from` integer,
	`balance_after_to` integer,
	`category` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'success' NOT NULL,
	`operator_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_room_seq_unique` ON `transactions` (`room_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_room_request_unique` ON `transactions` (`room_id`,`client_request_id`);--> statement-breakpoint
CREATE INDEX `transactions_room_created_idx` ON `transactions` (`room_id`,`created_at`);