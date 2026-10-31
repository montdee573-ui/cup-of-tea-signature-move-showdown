import { integer, jsonb, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { contestResultsTable } from "./contest-results";

export interface ContestResultSnapshot {
  eventTitle: string;
  division: string;
  winnerName: string;
  winnerHandle: string;
  runnerUpName: string;
  winnerVotes: number;
  runnerUpVotes: number;
  coreScore: number | null;
  base44Summary: string;
  viralReelSummary: string;
}

export const contestResultHistoryTable = pgTable("contest_result_history", {
  id: serial("id").primaryKey(),
  resultId: integer("result_id").notNull().references(() => contestResultsTable.id),
  changeType: text("change_type").notNull(),
  snapshot: jsonb("snapshot").$type<ContestResultSnapshot>().notNull(),
  reason: text("reason").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("contest_result_history_result_changed_at_idx").on(table.resultId, table.changedAt),
]);

export type ContestResultHistoryEntry = typeof contestResultHistoryTable.$inferSelect;
