import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const studioLoginAttemptsTable = pgTable("studio_login_attempts", {
  ipAddress: text("ip_address").primaryKey(),
  failedCount: integer("failed_count").notNull(),
  windowExpiresAt: timestamp("window_expires_at", { withTimezone: true }).notNull(),
});
