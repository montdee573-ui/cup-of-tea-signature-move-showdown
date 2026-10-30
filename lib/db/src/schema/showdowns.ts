import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { moveSubmissionsTable } from "./move-submissions";

export const showdownsTable = pgTable("showdowns", {
  id: serial("id").primaryKey(),
  leftSubmissionId: text("left_submission_id")
    .notNull()
    .references(() => moveSubmissionsTable.id, { onDelete: "cascade" }),
  rightSubmissionId: text("right_submission_id")
    .notNull()
    .references(() => moveSubmissionsTable.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("showdowns_pair_mode_unique").on(
    table.leftSubmissionId,
    table.rightSubmissionId,
    table.mode,
  ),
]);

export const showdownVotesTable = pgTable("showdown_votes", {
  id: serial("id").primaryKey(),
  showdownId: integer("showdown_id")
    .notNull()
    .references(() => showdownsTable.id, { onDelete: "cascade" }),
  submissionId: text("submission_id")
    .notNull()
    .references(() => moveSubmissionsTable.id, { onDelete: "cascade" }),
  voterHash: text("voter_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("showdown_votes_voter_unique").on(table.showdownId, table.voterHash),
  index("showdown_votes_showdown_idx").on(table.showdownId),
]);
