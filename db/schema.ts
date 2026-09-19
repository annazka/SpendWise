import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const budgets = sqliteTable("budgets", {
  owner: text("owner").primaryKey(),
  amount: integer("amount").notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
});

export const currencyAccounts = sqliteTable(
  "currency_accounts",
  {
    owner: text("owner").notNull(),
    currency: text("currency").notNull(),
    budgetAmount: integer("budget_amount"),
    budgetStart: text("budget_start"),
    budgetEnd: text("budget_end"),
  },
  (table) => [primaryKey({ columns: [table.owner, table.currency] })],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    store: text("store").notNull(),
    date: text("date").notNull(),
    amount: integer("amount").notNull(),
    category: text("category").notNull(),
    currency: text("currency").notNull().default("IDR"),
    txHash: text("tx_hash"),
    onchainId: text("onchain_id"),
  },
  (table) => [index("transactions_owner_currency_date").on(table.owner, table.currency, table.date)],
);

export const walletSessions = sqliteTable("wallet_sessions", {
  session: text("session").primaryKey(),
  wallet: text("wallet").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const authChallenges = sqliteTable("auth_challenges", {
  session: text("session").primaryKey(),
  wallet: text("wallet").notNull(),
  nonce: text("nonce").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const scanLimits = sqliteTable("scan_limits", {
  owner: text("owner").primaryKey(),
  day: text("day").notNull(),
  count: integer("count").notNull(),
});
