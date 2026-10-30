import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const moveSubmissionsTable = pgTable("move_submissions", {
  id: text("id").primaryKey(),
  sport: text("sport").notNull(),
  category: text("category").notNull(),
  moveName: text("move_name").notNull(),
  displayName: text("display_name").notNull(),
  handle: text("handle").notNull(),
  team: text("team"),
  design: text("design").notNull(),
  videoObjectPath: text("video_object_path").notNull(),
  videoFileName: text("video_file_name").notNull(),
  videoContentType: text("video_content_type").notNull(),
  videoSizeBytes: integer("video_size_bytes").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export type MoveSubmission = typeof moveSubmissionsTable.$inferSelect;
