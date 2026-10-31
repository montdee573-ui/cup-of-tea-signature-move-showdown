import { CreateMoveSubmissionHeader } from "@workspace/api-zod";
import type { moveSubmissionsTable } from "@workspace/db";

export type SubmissionMetadata = {
  sport: string;
  category: string;
  moveName: string;
  displayName: string;
  handle: string;
  team?: string;
  design: "holo" | "court";
  merchProductId?: number | null;
  consent: true;
  videoFileName?: string;
};

type MoveSubmissionRow = typeof moveSubmissionsTable.$inferSelect;

function isSubmissionMetadata(value: unknown): value is SubmissionMetadata {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  const textInRange = (field: unknown, min: number, max: number): field is string =>
    typeof field === "string" && field.trim().length >= min && field.length <= max;

  return textInRange(input.sport, 1, 50)
    && ["Open", "Men's", "Women's", "Mixed"].includes(String(input.category))
    && textInRange(input.moveName, 1, 60)
    && textInRange(input.displayName, 1, 50)
    && textInRange(input.handle, 1, 30)
    && (input.team === undefined || textInRange(input.team, 0, 60))
    && (input.design === "holo" || input.design === "court")
    && (input.merchProductId === undefined || input.merchProductId === null
      || (Number.isSafeInteger(input.merchProductId) && Number(input.merchProductId) >= 1))
    && input.consent === true
    && (input.videoFileName === undefined || textInRange(input.videoFileName, 1, 150));
}

export function parseSubmissionMetadataHeader(header: string | undefined): SubmissionMetadata | null {
  const parsedHeader = CreateMoveSubmissionHeader.safeParse({
    "X-Submission-Metadata": header,
  });
  if (!parsedHeader.success) return null;

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(parsedHeader.data["X-Submission-Metadata"], "base64url").toString("utf8"),
    );
    return isSubmissionMetadata(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function submissionFieldsFromMetadata(metadata: SubmissionMetadata) {
  return {
    sport: metadata.sport.trim(),
    category: metadata.category,
    moveName: metadata.moveName.trim(),
    displayName: metadata.displayName.trim(),
    handle: metadata.handle.trim(),
    team: metadata.team?.trim() || null,
    design: metadata.design,
    merchProductId: metadata.merchProductId ?? null,
  };
}

export function encodeMoveSubmissionForReview(row: MoveSubmissionRow) {
  return {
    id: row.id,
    sport: row.sport,
    category: row.category,
    moveName: row.moveName,
    displayName: row.displayName,
    handle: row.handle,
    team: row.team,
    merchProductId: row.merchProductId,
    design: row.design as "holo" | "court",
    videoFileName: row.videoFileName,
    videoContentType: row.videoContentType,
    videoSizeBytes: row.videoSizeBytes,
    consentAt: row.consentAt,
    status: row.status as "pending" | "approved" | "rejected",
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    videoUrl: `/api/studio/move-submissions/${row.id}/video`,
  };
}

export function encodeCommunityCard(row: MoveSubmissionRow) {
  return {
    id: row.id,
    displayName: row.displayName,
    handle: row.handle,
    sport: row.sport,
    category: row.category,
    moveName: row.moveName,
    team: row.team,
    merchProductId: row.merchProductId,
    design: row.design as "holo" | "court",
    createdAt: row.createdAt,
    videoUrl: `/api/community-cards/${row.id}/video`,
  };
}
