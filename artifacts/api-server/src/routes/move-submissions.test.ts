import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GetCommunityCardResponse,
  ListMoveSubmissionsForReviewResponse,
} from "@workspace/api-zod";
import {
  encodeCommunityCard,
  encodeMoveSubmissionForReview,
  parseSubmissionMetadataHeader,
  submissionFieldsFromMetadata,
} from "../lib/move-submission-contract";

const submissionId = "6dbec5fa-e3f8-4b1c-b245-1371b2ef51ae";
const metadataBase = {
  sport: "Basketball",
  category: "Open",
  moveName: "Spin move",
  displayName: "Creator",
  handle: "creator",
  design: "holo" as const,
  consent: true as const,
};

function metadataHeader(metadata: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(metadata)).toString("base64url");
}

test("selected catalog item travels from submission metadata through review and approved card", () => {
  const metadata = parseSubmissionMetadataHeader(metadataHeader({
    ...metadataBase,
    merchProductId: 42,
  }));
  assert(metadata);

  const storedFields = submissionFieldsFromMetadata(metadata);
  assert.equal(storedFields.merchProductId, 42);

  const row = {
    ...storedFields,
    id: submissionId,
    videoObjectPath: "private/submission/video",
    videoFileName: "move.mp4",
    videoContentType: "video/mp4",
    videoSizeBytes: 1024,
    consentAt: new Date("2026-06-01T12:00:00.000Z"),
    status: "pending",
    creatorTokenHash: "hashed-token",
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    reviewedAt: null,
  };
  const review = ListMoveSubmissionsForReviewResponse.parse([
    encodeMoveSubmissionForReview(row),
  ])[0];
  assert.equal(review.merchProductId, 42);

  const approvedCard = GetCommunityCardResponse.parse(encodeCommunityCard({
    ...row,
    status: "approved",
  }));
  assert.equal(approvedCard.merchProductId, 42);
});

test("submission without a merchandise match stays valid and returns null", () => {
  const metadata = parseSubmissionMetadataHeader(metadataHeader(metadataBase));
  assert(metadata);

  const storedFields = submissionFieldsFromMetadata(metadata);
  assert.equal(storedFields.merchProductId, null);

  const row = {
    ...storedFields,
    id: submissionId,
    videoObjectPath: "private/submission/video",
    videoFileName: "move.mp4",
    videoContentType: "video/mp4",
    videoSizeBytes: 1024,
    consentAt: new Date("2026-06-01T12:00:00.000Z"),
    status: "pending",
    creatorTokenHash: "hashed-token",
    createdAt: new Date("2026-06-01T12:00:00.000Z"),
    reviewedAt: null,
  };
  const review = ListMoveSubmissionsForReviewResponse.parse([
    encodeMoveSubmissionForReview(row),
  ])[0];
  assert.equal(review.merchProductId, null);

  const approvedCard = GetCommunityCardResponse.parse(encodeCommunityCard({
    ...row,
    status: "approved",
  }));
  assert.equal(approvedCard.merchProductId, null);
});
