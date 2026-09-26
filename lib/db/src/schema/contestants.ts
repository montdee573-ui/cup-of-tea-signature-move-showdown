import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const contestantsTable = pgTable("contestants", {
  id: serial("id").primaryKey(),
  group: text("group").notNull(),
  handle: text("handle").notNull(),
  signatureMove: text("signature_move").notNull(),
  category: text("category").notNull(),
  verificationStatus: text("verification_status").notNull(),
  coreVerdict: text("core_verdict").notNull(),
  overallFidelity: integer("overall_fidelity").notNull(),
  referenceClipUrl: text("reference_clip_url"),
  visualProofName: text("visual_proof_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContestantSchema = createInsertSchema(contestantsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertContestant = z.infer<typeof insertContestantSchema>;
export type Contestant = typeof contestantsTable.$inferSelect;