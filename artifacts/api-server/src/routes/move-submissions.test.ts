import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { request as httpRequest } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import express, { type Request } from "express";
import cookieParser from "cookie-parser";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  GetCommunityCardResponse,
  ListCommunityCardsResponse,
  ListMoveSubmissionsForReviewResponse,
} from "@workspace/api-zod";
import moveSubmissionsRouter from "./move-submissions";
import studioMoveCardsRouter from "./studio-move-cards";
import {
  moveSubmissionPersistenceState,
  resetMoveSubmissionPersistenceState,
  setAvailableProfessionalCardId,
} from "./move-submissions-test-db";
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
const originalSessionSecret = process.env.SESSION_SECRET;
const originalOwnerPassword = process.env.REEL_STUDIO_ADMIN_PASSWORD;

before(async () => {
  process.env.SESSION_SECRET = "move-card-test-secret";
  process.env.REEL_STUDIO_ADMIN_PASSWORD = "move-card-test-owner";
  app.set("trust proxy", true);
  app.use((req: Request, _res, next) => {
    Object.defineProperty(req, "log", {
      value: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    next();
  });
  app.use(cookieParser());
  app.use(express.json());
  app.use(moveSubmissionsRouter);
  app.use(studioMoveCardsRouter);
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
  if (originalSessionSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSessionSecret;
  if (originalOwnerPassword === undefined) delete process.env.REEL_STUDIO_ADMIN_PASSWORD;
  else process.env.REEL_STUDIO_ADMIN_PASSWORD = originalOwnerPassword;
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

function ownerCookie(): string {
  const payload = Buffer.from(JSON.stringify({ role: "owner", exp: Date.now() + 60_000 })).toString("base64url");
  const signature = createHmac("sha256", `${process.env.SESSION_SECRET}:${process.env.REEL_STUDIO_ADMIN_PASSWORD}`)
    .update(payload)
    .digest("base64url");
  return `reel_studio_owner=${payload}.${signature}`;
}

test("anonymous callers cannot view the private queue or approve or reject a card", async () => {
  const queue = await fetch(`${baseUrl}/studio/move-submissions/review`);
  assert.equal(queue.status, 401);
  for (const status of ["approved", "rejected"]) {
    const response = await fetch(`${baseUrl}/studio/move-submissions/${submissionId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    assert.equal(response.status, 401);
  }
  assert.equal(moveSubmissionPersistenceState().insertCalls, 0);
});

test("professional-card attempts keep their card link through anonymous submission", async () => {
  const response = await fetch(`${baseUrl}/move-submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "video/mp4",
      "X-Submission-Metadata": metadataHeader({ ...metadataBase, professionalMoveCardId: 1 }),
      "X-Forwarded-For": "198.51.100.51",
    },
    body: Buffer.from("video bytes for a linked professional move challenge"),
  });
  assert.equal(response.status, 201);
  assert.equal(moveSubmissionPersistenceState().lastInsertedSubmission?.professionalMoveCardId, 1);
});

test("a removed professional card cannot be used for a new participant attempt", async () => {
  setAvailableProfessionalCardId(null);
  const response = await fetch(`${baseUrl}/move-submissions`, {
    method: "POST",
    headers: {
      "Content-Type": "video/mp4",
      "X-Submission-Metadata": metadataHeader({ ...metadataBase, professionalMoveCardId: 2 }),
      "X-Forwarded-For": "198.51.100.52",
    },
    body: Buffer.from("video bytes for a removed professional move challenge"),
  });
  assert.equal(response.status, 400);
  assert.equal(moveSubmissionPersistenceState().insertCalls, 0);
});

test("private card administration and AI analysis reject anonymous callers", async () => {
  assert.equal((await fetch(`${baseUrl}/studio/move-cards`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/studio/move-cards/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  })).status, 401);
  assert.equal((await fetch(`${baseUrl}/studio/move-cards/ai-draft`, {
    method: "POST",
    headers: {
      "Content-Type": "video/mp4",
      "X-Move-Card-Context": metadataHeader({}),
    },
    body: Buffer.from("unauthorized video data"),
  })).status, 401);
});

test("professional card publication requires owner verification and permission checks", async () => {
  const cookie = ownerCookie();
  const created = await fetch(`${baseUrl}/studio/move-cards/drafts`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      athleteName: "Test Athlete",
      sport: "Basketball",
      era: "Current",
      team: "Test Team",
      moveName: "Observed change of direction",
      tagline: "A short description.",
      explanation: "This draft is used only to test the publication gates.",
      cues: ["Watch the change of direction."],
      sourceType: "official",
      sourceLabel: "Owner-verified test reference",
      sourceUrl: null,
      coverImageUrl: null,
    }),
  });
  const createdBody = await created.json() as { id?: number; moderationStatus?: string; error?: string };
  assert.equal(created.status, 201, createdBody.error);
  const card = createdBody as { id: number; moderationStatus: string };
  assert.equal(card.moderationStatus, "draft");

  const baseUpdate = {
    athleteName: "Test Athlete",
    sport: "Basketball",
    era: "Current",
    team: "Test Team",
    moveName: "Observed change of direction",
    tagline: "A short description.",
    explanation: "This draft is used only to test the publication gates.",
    cues: ["Watch the change of direction."],
    sourceType: "official",
    sourceLabel: "Owner-verified test reference",
    sourceUrl: null,
    coverImageUrl: null,
    action: "publish",
  };
  const tryPublish = (values: Record<string, unknown>) => fetch(`${baseUrl}/studio/move-cards/${card.id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  assert.equal((await tryPublish({
    ...baseUpdate, identityVerified: false, mediaPermissionConfirmed: false,
  })).status, 400);
  assert.equal((await tryPublish({
    ...baseUpdate, identityVerified: true, mediaPermissionConfirmed: false,
  })).status, 400);
  assert.equal((await tryPublish({
    ...baseUpdate, identityVerified: true, mediaPermissionConfirmed: true,
  })).status, 400);
  const published = await tryPublish({
    ...baseUpdate,
    sourceUrl: "https://example.org/verified-reference",
    identityVerified: true,
    mediaPermissionConfirmed: true,
  });
  assert.equal(published.status, 200);
  assert.equal((await published.json() as { moderationStatus: string }).moderationStatus, "published");
});

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
    professionalMoveCardId: null,
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

test("invalid metadata is rejected before reading an oversized declared video body", async () => {
  requestNumber += 1;
  const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
    const request = httpRequest(`${baseUrl}/move-submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(100 * 1024 * 1024 + 1),
        "X-Submission-Metadata": metadataHeader({ ...metadataBase, consent: false }),
        "X-Forwarded-For": `192.0.2.${requestNumber}`,
      },
    }, resolve);
    request.once("error", reject);
    request.end();
  });

  let responseBody = "";
  response.setEncoding("utf8");
  for await (const chunk of response) responseBody += chunk;

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(responseBody), {
    error: "Submission details or consent are missing or invalid.",
  });
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
