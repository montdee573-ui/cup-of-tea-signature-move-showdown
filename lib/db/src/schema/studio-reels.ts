import { boolean, doublePrecision, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const studioReelsTable = pgTable("studio_reels", {
  id: serial("id").primaryKey(),
  briefId: text("brief_id").notNull(),
  title: text("title").notNull(),
  model: text("model").notNull(),
  predictionId: text("prediction_id"),
  status: text("status").notNull().default("starting"),
  durationSeconds: integer("duration_seconds").notNull(),
  aspectRatio: text("aspect_ratio").notNull(),
  resolution: text("resolution").notNull(),
  audioEnabled: boolean("audio_enabled").notNull(),
  estimatedCostUsd: doublePrecision("estimated_cost_usd").notNull(),
  isTest: boolean("is_test").notNull().default(false),
  objectPath: text("object_path"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type StudioReel = typeof studioReelsTable.$inferSelect;
