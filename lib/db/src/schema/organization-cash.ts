import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { recruitmentOrganizationsTable, promotersTable } from "./promoters";
import { creatorMotionOrdersTable } from "./creator-motion-orders";

// Balances must only be credited after verified settlement, never from a staff button.
export const organizationCashAccountsTable = pgTable("organization_cash_accounts", {
  organizationId: integer("organization_id").primaryKey().references(() => recruitmentOrganizationsTable.id),
  balanceCents: integer("balance_cents").notNull().default(0),
});

export const organizationCashFundingTable = pgTable("organization_cash_funding", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => recruitmentOrganizationsTable.id),
  provider: text("provider").notNull(),
  paymentId: text("payment_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", {withTimezone: true}).notNull().defaultNow(),
}, t => [uniqueIndex("organization_cash_funding_payment_unique").on(t.provider,t.paymentId)]);

export const organizationCashPurchasesTable = pgTable("organization_cash_purchases", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").notNull().references(() => recruitmentOrganizationsTable.id),
  promoterId: integer("promoter_id").notNull().references(() => promotersTable.id),
  orderId: integer("order_id").notNull().unique().references(() => creatorMotionOrdersTable.id),
  receiptCode: text("receipt_code").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  commissionCents: integer("commission_cents").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", {withTimezone: true}).notNull().defaultNow(),
});
