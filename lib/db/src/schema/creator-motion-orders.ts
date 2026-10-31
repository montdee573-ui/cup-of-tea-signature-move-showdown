import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { moveSubmissionsTable } from "./move-submissions";

export const creatorMotionOrdersTable = pgTable("creator_motion_orders", {
  id: serial("id").primaryKey(),
  submissionId: text("submission_id")
    .notNull()
    .references(() => moveSubmissionsTable.id, { onDelete: "cascade" }),
  checkoutConfigurationId: text("checkout_configuration_id"),
  checkoutUrl: text("checkout_url"),
  paymentId: text("payment_id"),
  status: text("status").notNull().default("creating"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("creator_motion_orders_submission_unique").on(table.submissionId),
  uniqueIndex("creator_motion_orders_checkout_unique").on(table.checkoutConfigurationId),
  uniqueIndex("creator_motion_orders_payment_unique").on(table.paymentId),
  index("creator_motion_orders_status_idx").on(table.status),
]);

export type CreatorMotionOrder = typeof creatorMotionOrdersTable.$inferSelect;
