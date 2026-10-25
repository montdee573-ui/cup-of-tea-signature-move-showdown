import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const moveCardsTable = pgTable("move_cards", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  athleteName: text("athlete_name").notNull(),
  sport: text("sport").notNull(),
  era: text("era").notNull(),
  team: text("team").notNull(),
  moveName: text("move_name").notNull(),
  tagline: text("tagline").notNull(),
  explanation: text("explanation").notNull(),
  cues: jsonb("cues").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  sourceType: text("source_type").notNull(),
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url"),
  coverImageUrl: text("cover_image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMoveCardSchema = createInsertSchema(moveCardsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertMoveCard = z.infer<typeof insertMoveCardSchema>;
export type MoveCard = typeof moveCardsTable.$inferSelect;
