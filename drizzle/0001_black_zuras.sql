CREATE TABLE `auth_challenges` (
	`session` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`nonce` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `currency_accounts` (
	`owner` text NOT NULL,
	`currency` text NOT NULL,
	`budget_amount` integer,
	`budget_start` text,
	`budget_end` text,
	PRIMARY KEY(`owner`, `currency`)
);
--> statement-breakpoint
CREATE TABLE `wallet_sessions` (
	`session` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX `transactions_owner_date`;--> statement-breakpoint
ALTER TABLE `transactions` ADD `currency` text DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `tx_hash` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `onchain_id` text;--> statement-breakpoint
CREATE INDEX `transactions_owner_currency_date` ON `transactions` (`owner`,`currency`,`date`);