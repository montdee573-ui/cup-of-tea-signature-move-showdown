import { pgTable, text, serial, integer, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";

export const recruitmentOrganizationsTable = pgTable("recruitment_organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  facilityAddress: text("facility_address"),
  recruitmentCode: text("recruitment_code").notNull().unique(),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promotersTable = pgTable("promoters", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => recruitmentOrganizationsTable.id),
  workerCode: text("worker_code").unique(),
  accountSubject: text("account_subject").notNull().unique(),
  referralCode: text("referral_code").unique(),
  status: text("status").notNull().default("pending"),
  eligibilityVerified: boolean("eligibility_verified").notNull().default(false),
  guardianConsentVerified: boolean("guardian_consent_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const promoterCommissionsTable = pgTable("promoter_commissions", {
  id: serial("id").primaryKey(),
  promoterId: integer("promoter_id").notNull().references(() => promotersTable.id),
  provider: text("provider").notNull(),
  paymentId: text("payment_id").notNull(),
  product: text("product").notNull(),
  commissionCents: integer("commission_cents").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
}, table => [uniqueIndex("promoter_commission_payment_unique").on(table.provider, table.paymentId)]);
