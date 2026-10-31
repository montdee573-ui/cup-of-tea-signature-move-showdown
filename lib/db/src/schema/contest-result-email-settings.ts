import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const contestResultEmailSettingsTable = pgTable("contest_result_email_settings", {
  id: integer("id").primaryKey(),
  recipient: text("recipient").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
