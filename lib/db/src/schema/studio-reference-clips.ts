import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const studioReferenceClipsTable = pgTable("studio_reference_clips", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  athleteName: text("athlete_name").notNull(),
  sport: text("sport").notNull(),
  era: text("era").notNull(),
  team: text("team").notNull(),
  sourceType: text("source_type").notNull(),
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url"),
  permissionConfirmed: boolean("permission_confirmed").notNull().default(false),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  objectPath: text("object_path").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStudioReferenceClipSchema = createInsertSchema(studioReferenceClipsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertStudioReferenceClip = z.infer<typeof insertStudioReferenceClipSchema>;
export type StudioReferenceClip = typeof studioReferenceClipsTable.$inferSelect;
