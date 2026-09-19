CREATE TABLE `budgets` (
	`owner` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scan_limits` (
	`owner` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`store` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`category` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transactions_owner_date` ON `transactions` (`owner`,`date`);