import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import express, { type Request } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  GetCommunityCardResponse,
  ListCommunityCardsResponse,
  ListMoveSubmissionsForReviewResponse,
} from "@workspace/api-zod";
import moveSubmissionsRouter from "./move-submissions";
import { moveSubmissionPersistenceState, resetMoveSubmissionPersistenceState } from "./move-submissions-test-db";
import { moveSubmissionStorageState, resetMoveSubmissionStorageState } from "./move-submissions-test-storage";
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
const app = express();
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let requestNumber = 0;
let catalogMode: "available" | "missing" | "unavailable" = "available";
let catalogCalls = 0;
const originalProxy = ReplitConnectors.prototype.proxy;

before(async () => {
  app.set("trust proxy", true);
  app.use((req: Request, _res, next) => {
    Object.defineProperty(req, "log", {
      value: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    next();
  });
  app.use(moveSubmissionsRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  resetMoveSubmissionPersistenceState();
  resetMoveSubmissionStorageState();
  catalogMode = "available";
  catalogCalls = 0;
});

after(async () => {
  ReplitConnectors.prototype.proxy = originalProxy;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

ReplitConnectors.prototype.proxy = async (_connector, path) => {
  catalogCalls += 1;
  if (catalogMode === "missing") return Response.json({}, { status: 404 });
  if (catalogMode === "unavailable") return Response.json({}, { status: 503 });
  const productId = Number(path.split("/").at(-1));
  return Response.json({ result: { product: { id: productId, title: "Classic unisex tee" } } });
};

function metadataHeader(metadata: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(metadata)).toString("base64url");
}

test("selected catalog item travels from submission metadata through review and approved card", () => {
  const metadata = parseSubmissionMetadataHeader(metadataHeader({
    ...metadataBase,
    merchProductId: 42,
    merchProductName: "Classic unisex tee",
  }));
  assert(metadata);

  const storedFields = submissionFieldsFromMetadata(metadata);
  assert.equal(storedFields.merchProductId, 42);
  assert.equal(storedFields.merchProductName, "Classic unisex tee");

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
  assert.equal(review.merchProductName, "Classic unisex tee");

  const approvedCard = GetCommunityCardResponse.parse(encodeCommunityCard({
    ...row,
    status: "approved",
  }));
  assert.equal(approvedCard.merchProductId, 42);
  assert.equal(approvedCard.merchProductName, "Classic unisex tee");

  const communityCards = ListCommunityCardsResponse.parse([
    encodeCommunityCard({ ...row, status: "approved" }),
  ]);
  assert.equal(communityCards[0].merchProductId, storedFields.merchProductId);
  assert.equal(communityCards[0].merchProductName, storedFields.merchProductName);
});

test("submission without a merchandise match stays valid and returns null", () => {
  const metadata = parseSubmissionMetadataHeader(metadataHeader(metadataBase));
  assert(metadata);

  const storedFields = submissionFieldsFromMetadata(metadata);
  assert.equal(storedFields.merchProductId, null);
  assert.equal(storedFields.merchProductName, null);

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
  assert.equal(approvedCard.merchProductName, null);

  const communityCards = ListCommunityCardsResponse.parse([
    encodeCommunityCard({ ...row, status: "approved" }),
  ]);
  assert.equal(communityCards[0].merchProductId, null);
  assert.equal(communityCards[0].merchProductName, null);
});

test("older submission metadata with a catalog ID but no name remains valid", () => {
  const metadata = parseSubmissionMetadataHeader(metadataHeader({
    ...metadataBase,
    merchProductId: 42,
  }));
  assert(metadata);

  const storedFields = submissionFieldsFromMetadata(metadata);
  assert.equal(storedFields.merchProductId, 42);
  assert.equal(storedFields.merchProductName, null);
});

test("submission metadata accepts explicit null and rejects invalid merchandise IDs", () => {
  const nullProduct = parseSubmissionMetadataHeader(metadataHeader({
    ...metadataBase,
    merchProductId: null,
  }));
  assert(nullProduct);
  assert.equal(submissionFieldsFromMetadata(nullProduct).merchProductId, null);

  const invalidIds: unknown[] = [
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "42",
    "not-an-id",
    true,
    [],
    {},
  ];
  for (const merchProductId of invalidIds) {
    assert.equal(
      parseSubmissionMetadataHeader(metadataHeader({ ...metadataBase, merchProductId })),
      null,
      `expected ${JSON.stringify(merchProductId)} to be rejected`,
    );
  }
});

test("invalid merchandise IDs return the existing validation error before persistence", async () => {
  const invalidIds: unknown[] = [
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "42",
    "not-an-id",
    true,
    [],
    {},
  ];

  for (const merchProductId of invalidIds) {
    requestNumber += 1;
    const response = await fetch(`${baseUrl}/move-submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "video/mp4",
        "X-Submission-Metadata": metadataHeader({ ...metadataBase, merchProductId }),
        "X-Forwarded-For": `192.0.2.${requestNumber}`,
      },
      body: Buffer.from("test video"),
    });
    assert.equal(response.status, 400, `expected ${JSON.stringify(merchProductId)} to be rejected`);
    assert.deepEqual(await response.json(), {
      error: "Submission details or consent are missing or invalid.",
    });
  }

  assert.equal(moveSubmissionStorageState().saveCalls, 0);
  assert.equal(moveSubmissionPersistenceState().insertCalls, 0);
});

test("submission accepts a merchandise ID confirmed by the live catalog", async () => {
  requestNumber += 1;
  const response = await fetch(`${baseUrl}/move-submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "video/mp4",
      "X-Submission-Metadata": metadataHeader({ ...metadataBase, merchProductId: 42 }),
      "X-Forwarded-For": `192.0.2.${requestNumber}`,
    },
    body: Buffer.from("test video"),
  });

  assert.equal(response.status, 201);
  assert.equal(catalogCalls, 1);
  assert.equal(moveSubmissionStorageState().saveCalls, 1);
  assert.equal(moveSubmissionPersistenceState().insertCalls, 1);
});

test("submission rejects a merchandise ID missing from the live catalog", async () => {
  catalogMode = "missing";
  requestNumber += 1;
  const response = await fetch(`${baseUrl}/move-submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "video/mp4",
      "X-Submission-Metadata": metadataHeader({ ...metadataBase, merchProductId: 42 }),
      "X-Forwarded-For": `192.0.2.${requestNumber}`,
    },
    body: Buffer.from("test video"),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "That planned merchandise item is no longer in the catalog.",
  });
  assert.equal(catalogCalls, 1);
  assert.equal(moveSubmissionStorageState().saveCalls, 0);
  assert.equal(moveSubmissionPersistenceState().insertCalls, 0);
});

test("catalog outages do not block submissions without a merchandise selection", async () => {
  catalogMode = "unavailable";
  requestNumber += 1;
  const response = await fetch(`${baseUrl}/move-submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "video/mp4",
      "X-Submission-Metadata": metadataHeader(metadataBase),
      "X-Forwarded-For": `192.0.2.${requestNumber}`,
    },
    body: Buffer.from("test video"),
  });

  assert.equal(response.status, 201);
  assert.equal(catalogCalls, 0);
  assert.equal(moveSubmissionStorageState().saveCalls, 1);
  assert.equal(moveSubmissionPersistenceState().insertCalls, 1);
});

test("catalog outages are reported for submissions with an unverified merchandise selection", async () => {
  catalogMode = "unavailable";
  requestNumber += 1;
  const response = await fetch(`${baseUrl}/move-submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "video/mp4",
      "X-Submission-Metadata": metadataHeader({ ...metadataBase, merchProductId: 42 }),
      "X-Forwarded-For": `192.0.2.${requestNumber}`,
    },
    body: Buffer.from("test video"),
  });

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "The merchandise catalog is temporarily unavailable. Please try again.",
  });
  assert.equal(catalogCalls, 1);
  assert.equal(moveSubmissionStorageState().saveCalls, 0);
  assert.equal(moveSubmissionPersistenceState().insertCalls, 0);
});
