import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const contestResultsTable = pgTable("contest_results", {
  id: serial("id").primaryKey(),
  eventTitle: text("event_title").notNull(),
  division: text("division").notNull(),
  winnerName: text("winner_name").notNull(),
  winnerHandle: text("winner_handle").notNull(),
  runnerUpName: text("runner_up_name").notNull(),
  winnerVotes: integer("winner_votes").notNull(),
  runnerUpVotes: integer("runner_up_votes").notNull(),
  coreScore: integer("core_score"),
  base44Summary: text("base44_summary").notNull(),
  viralReelSummary: text("viral_reel_summary").notNull(),
  status: text("status").notNull().default("draft"),
  clearanceNote: text("clearance_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
});

export type ContestResult = typeof contestResultsTable.$inferSelect;
