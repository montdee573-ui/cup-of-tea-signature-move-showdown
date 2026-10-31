import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import cookieParser from "cookie-parser";
import express, { type Request } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import creatorCardsRouter from "./creator-cards";
import {
  creatorCardState,
  resetCreatorCardState,
  seedCreatorMotionOrder,
} from "./creator-cards-test-db";
import { creatorMotionVideoUrl } from "../lib/creator-motion-generation";
import { creatorMotionVideoState, resetCreatorMotionVideo } from "./creator-cards-test-storage";

const CREATOR_TOKEN = "creator-link-token-for-checkout-regression-tests";
const PRICE_USD = 9.99;
const OWNER_ENV = [
  "CREATOR_MOTION_SALES_APPROVED",
  "CREATOR_MOTION_PAYMENT_PROVIDER",
  "CREATOR_MOTION_PRICE_USD",
  "WHOP_COMPANY_ID",
  "WHOP_PLAN_ID",
  "REPLICATE_API_TOKEN",
  "SESSION_SECRET",
  "REEL_STUDIO_ADMIN_PASSWORD",
  "DEFAULT_OBJECT_STORAGE_BUCKET_ID",
  "PRIVATE_OBJECT_DIR",
] as const;
const originalEnv = new Map(OWNER_ENV.map((key) => [key, process.env[key]]));
const submissionId = "6dbec5fa-e3f8-4b1c-b245-1371b2ef51ae";
const app = express();
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let requestId = 0;

function configureOwner(planId = "plan_test"): void {
  process.env.CREATOR_MOTION_SALES_APPROVED = "true";
  process.env.CREATOR_MOTION_PAYMENT_PROVIDER = "whop";
  process.env.CREATOR_MOTION_PRICE_USD = String(PRICE_USD);
  process.env.WHOP_COMPANY_ID = "biz_test";
  process.env.WHOP_PLAN_ID = planId;
  process.env.REPLICATE_API_TOKEN = "configured-for-test";
  process.env.SESSION_SECRET = "creator-motion-test-session-secret";
  process.env.REEL_STUDIO_ADMIN_PASSWORD = "creator-motion-test-owner-password";
  process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = "creator-motion-test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "creator-motion-private";
}

function resetTestState(planId?: string): void {
  configureOwner(planId);
  resetCreatorCardState({
    creatorTokenHash: createHash("sha256").update(CREATOR_TOKEN).digest("hex"),
  });
}

function ownerCookie(): string {
  const payload = Buffer.from(JSON.stringify({ role: "owner", exp: Date.now() + 60 * 60 * 1000 })).toString("base64url");
  const signature = createHmac(
    "sha256",
    `${process.env.SESSION_SECRET}:${process.env.REEL_STUDIO_ADMIN_PASSWORD}`,
  ).update(payload).digest("base64url");
  return `reel_studio_owner=${payload}.${signature}`;
}

function videoTicket(expires?: number, signature?: string): string {
  const generated = creatorMotionVideoUrl(submissionId);
  assert(generated);
  const ticket = new URL(generated, "https://example.test");
  const expiry = expires ?? Number(ticket.searchParams.get("expires"));
  const signed = signature ?? createHmac("sha256", process.env.SESSION_SECRET!)
    .update(`${submissionId}:${expiry}`)
    .digest("base64url");
  return `/creator-cards/${submissionId}/motion/video?expires=${expiry}&signature=${signed}`;
}

async function playCreatorMotionVideo(url = videoTicket(), range?: string): Promise<Response> {
  requestId += 1;
  return fetch(`${baseUrl}${url}`, {
    headers: {
      "X-Forwarded-For": `192.0.2.${requestId}`,
      ...(range ? { Range: range } : {}),
    },
  });
}

function approvedPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: process.env.WHOP_PLAN_ID,
    account: { id: process.env.WHOP_COMPANY_ID },
    billing_type: "one_time",
    billing_period: null,
    currency: "usd",
    initial_price: PRICE_USD,
    collect_tax: false,
    adaptive_pricing_enabled: false,
    ...overrides,
  };
}

type WhopCall = { path: string; method?: string };

async function withWhop(
  plan: Record<string, unknown>,
  run: (calls: WhopCall[]) => Promise<void>,
): Promise<void> {
  const calls: WhopCall[] = [];
  let refundedAmount = 0;
  const originalProxy = ReplitConnectors.prototype.proxy;
  ReplitConnectors.prototype.proxy = async function (_connectorName, path, options) {
    calls.push({ path, method: options?.method });
    const paymentPath = path.includes("/api/v1/payments/pay_test");
    if (paymentPath && options?.method === "POST" && path.endsWith("/refund")) refundedAmount = PRICE_USD;
    const payload = paymentPath
      ? {
        id: "pay_test",
        company: { id: "biz_test" },
        checkout_configuration_id: "checkout_test",
        status: refundedAmount >= PRICE_USD ? "refunded" : "paid",
        amount: PRICE_USD,
        currency: "usd",
        refunded_amount: refundedAmount,
      }
      : options?.method === "POST"
        ? { id: "checkout_test", purchase_url: "https://whop.com/checkout/test" }
        : plan;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await run(calls);
  } finally {
    ReplitConnectors.prototype.proxy = originalProxy;
  }
}

before(async () => {
  app.use(express.json());
  app.use(cookieParser());
  app.set("trust proxy", true);
  app.use((req: Request, _res, next) => {
    Object.defineProperty(req, "log", {
      value: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });
    next();
  });
  app.use(creatorCardsRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function checkout(
  body: Record<string, unknown> = {
    creatorToken: CREATOR_TOKEN,
    approvedPriceUsd: PRICE_USD,
    confirmPurchase: true,
  },
): Promise<Response> {
  requestId += 1;
  return fetch(`${baseUrl}/creator-cards/${submissionId}/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl.replace(/^http:/, "https:"),
      "X-Forwarded-For": `192.0.2.${requestId}`,
    },
    body: JSON.stringify(body),
  });
}

async function creatorCardAccess(): Promise<Response> {
  requestId += 1;
  return fetch(`${baseUrl}/creator-cards/${submissionId}/access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: baseUrl.replace(/^http:/, "https:"),
      "X-Forwarded-For": `192.0.2.${requestId}`,
    },
    body: JSON.stringify({ creatorToken: CREATOR_TOKEN }),
  });
}

async function creatorRefundRequest(): Promise<Response> {
  requestId += 1;
  return fetch(`${baseUrl}/creator-cards/${submissionId}/refund-request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `192.0.2.${requestId}`,
    },
    body: JSON.stringify({ creatorToken: CREATOR_TOKEN }),
  });
}

async function ownerRefundDecision(decision: "refund" | "decline", cookie = ownerCookie()): Promise<Response> {
  return fetch(`${baseUrl}/studio/creator-refunds/${submissionId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ decision }),
  });
}

test("checkout stays unavailable until every owner setting is present and approved", async () => {
  const invalidSettings: Array<[string, string | undefined]> = [
    ["CREATOR_MOTION_SALES_APPROVED", "false"],
    ["CREATOR_MOTION_SALES_APPROVED", undefined],
    ["CREATOR_MOTION_PAYMENT_PROVIDER", "stripe"],
    ["CREATOR_MOTION_PAYMENT_PROVIDER", undefined],
    ["CREATOR_MOTION_PRICE_USD", undefined],
    ["CREATOR_MOTION_PRICE_USD", "0"],
    ["CREATOR_MOTION_PRICE_USD", "500.01"],
    ["CREATOR_MOTION_PRICE_USD", "9.999"],
    ["WHOP_COMPANY_ID", undefined],
    ["WHOP_PLAN_ID", undefined],
    ["REPLICATE_API_TOKEN", undefined],
    ["SESSION_SECRET", undefined],
    ["DEFAULT_OBJECT_STORAGE_BUCKET_ID", undefined],
    ["PRIVATE_OBJECT_DIR", undefined],
  ];

  for (const [key, value] of invalidSettings) {
    resetTestState();
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;

    await withWhop(approvedPlan(), async (calls) => {
      const response = await checkout();
      assert.equal(response.status, 503, `${key} should block checkout`);
      assert.match((await response.json() as { error: string }).error, /not enabled/);
      assert.deepEqual(calls, [], `${key} must block before calling Whop`);
    });
    assert.deepEqual(creatorCardState().orders, [], `${key} must not create an order`);
  }
});

test("mismatched, recurring, taxed, and adaptive Whop plans never create checkout", async () => {
  const invalidPlans: Array<[string, Record<string, unknown>]> = [
    ["different price", { initial_price: 10 }],
    ["different plan", { id: "plan_not_approved" }],
    ["different owner account", { account: { id: "biz_not_approved" } }],
    ["different currency", { currency: "eur" }],
    ["recurring", { billing_type: "monthly", billing_period: 1 }],
    ["tax collection", { collect_tax: true }],
    ["adaptive pricing", { adaptive_pricing_enabled: true }],
  ];

  for (const [index, [label, overrides]] of invalidPlans.entries()) {
    const planId = `plan_invalid${index}`;
    resetTestState(planId);
    await withWhop(approvedPlan(overrides), async (calls) => {
      const response = await checkout();
      assert.equal(response.status, 503, `${label} plan should be refused`);
      assert.match((await response.json() as { error: string }).error, /could not be verified/);
      assert.deepEqual(calls.map((call) => call.method), ["GET"]);
      assert.match(calls[0].path, /\/api\/v1\/variants\//);
    });
    assert.deepEqual(creatorCardState().orders, [], `${label} plan must not create an order`);
  }
});

test("buyers must confirm the exact displayed price before checkout", async () => {
  for (const body of [
    { creatorToken: CREATOR_TOKEN, approvedPriceUsd: PRICE_USD, confirmPurchase: false },
    { creatorToken: CREATOR_TOKEN, approvedPriceUsd: PRICE_USD - 0.01, confirmPurchase: true },
    { creatorToken: CREATOR_TOKEN, approvedPriceUsd: PRICE_USD + 0.01, confirmPurchase: true },
  ]) {
    resetTestState();
    await withWhop(approvedPlan(), async (calls) => {
      const response = await checkout(body);
      assert.equal(response.status, body.confirmPurchase ? 409 : 400);
      assert.deepEqual(calls, [], "an unconfirmed or different price must not call Whop");
    });
    assert.deepEqual(creatorCardState().orders, []);
  }

  resetTestState();
  await withWhop(approvedPlan(), async (calls) => {
    const response = await checkout({
      creatorToken: CREATOR_TOKEN,
      approvedPriceUsd: PRICE_USD,
      confirmPurchase: true,
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { priceUsd: number }).priceUsd, PRICE_USD);
    assert.deepEqual(calls.map((call) => call.method), ["GET", "POST"]);
  });
  const [order] = creatorCardState().orders;
  assert.equal(order.priceUsd, PRICE_USD);
  assert.equal(order.status, "pending");
});

test("checkout rechecks the live Whop plan after a valid display check was cached", async () => {
  resetTestState("plan_livecheck");
  await withWhop(approvedPlan(), async (calls) => {
    const response = await creatorCardAccess();
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { offerAvailable: boolean }).offerAvailable, true);
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
  });

  await withWhop(approvedPlan({ initial_price: PRICE_USD + 1 }), async (calls) => {
    const response = await checkout();
    assert.equal(response.status, 503);
    assert.match((await response.json() as { error: string }).error, /could not be verified/);
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
  });
  assert.deepEqual(creatorCardState().orders, []);
});

test("checkout writes only the separate creator order and leaves free contest entry unchanged", async () => {
  resetTestState();
  const before = creatorCardState().submission;

  await withWhop(approvedPlan(), async () => {
    const response = await checkout();
    assert.equal(response.status, 200);
  });

  const afterState = creatorCardState();
  assert.equal(afterState.submission.status, before.status);
  assert.equal(afterState.submission.id, before.id);
  assert.deepEqual(afterState.writes, ["creator_motion_orders"]);
  assert.equal(afterState.orders.length, 1);
});

test("refund requests require a failed retry and persist only on the verified payment order", async () => {
  resetTestState();
  seedCreatorMotionOrder({ generationRetryCount: 0 });
  await withWhop(approvedPlan(), async (calls) => {
    const response = await creatorRefundRequest();
    assert.equal(response.status, 409);
    assert.deepEqual(calls, []);
  });

  resetTestState();
  seedCreatorMotionOrder();
  const before = creatorCardState();
  await withWhop(approvedPlan(), async (calls) => {
    const response = await creatorRefundRequest();
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { refundRequestStatus: string }).refundRequestStatus, "requested");
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
    assert.match(calls[0].path, /\/api\/v1\/payments\/pay_test$/);
  });
  const afterState = creatorCardState();
  assert.equal(afterState.orders[0].paymentId, before.orders[0].paymentId);
  assert.equal(afterState.orders[0].refundRequestStatus, "requested");
  assert.deepEqual(afterState.writes, ["creator_motion_orders"]);
  assert.deepEqual(afterState.submission, before.submission);

  await withWhop(approvedPlan(), async () => {
    const response = await creatorCardAccess();
    const payload = await response.json() as { refundRequestStatus: string; refundRequestAllowed: boolean };
    assert.equal(response.status, 200);
    assert.equal(payload.refundRequestStatus, "requested");
    assert.equal(payload.refundRequestAllowed, false);
  });
});

test("owner can issue a full Whop refund and persist the completed result", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  const before = creatorCardState().submission;
  const anonymousList = await fetch(`${baseUrl}/studio/creator-refunds`);
  assert.equal(anonymousList.status, 401);

  await withWhop(approvedPlan(), async (calls) => {
    const list = await fetch(`${baseUrl}/studio/creator-refunds`, { headers: { Cookie: ownerCookie() } });
    assert.equal(list.status, 200);
    const requests = await list.json() as Array<{ submissionId: string; priceUsd: number }>;
    assert.equal(requests.length, 1);
    assert.equal(requests[0].submissionId, submissionId);
    assert.equal(requests[0].priceUsd, PRICE_USD);

    const response = await ownerRefundDecision("refund");
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { refundRequestStatus: string }).refundRequestStatus, "completed");
    assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "GET"]);
    assert.match(calls[1].path, /\/api\/v1\/payments\/pay_test\/refund$/);
  });
  const state = creatorCardState();
  assert.equal(state.orders[0].refundRequestStatus, "completed");
  assert.equal(state.submission.status, before.status);
  assert.deepEqual(state.writes, ["creator_motion_orders"]);
});

test("owner can decline a refund request without calling Whop", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  await withWhop(approvedPlan(), async (calls) => {
    const response = await ownerRefundDecision("decline");
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { refundRequestStatus: string }).refundRequestStatus, "declined");
    assert.deepEqual(calls, []);
  });
  assert.equal(creatorCardState().orders[0].refundRequestStatus, "declined");
});

test("private reel playback accepts a valid ticket and serves private byte ranges", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    generationStatus: "succeeded",
    generationObjectPath: `creator-motion/${submissionId}.mp4`,
  });
  resetCreatorMotionVideo(Buffer.from("0123456789"));

  const response = await playCreatorMotionVideo(videoTicket(), "bytes=2-5");
  assert.equal(response.status, 206);
  assert.equal(await response.text(), "2345");
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(response.headers.get("content-type"), "video/mp4");
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(creatorMotionVideoState().streamRanges, [{ start: 2, end: 5 }]);
});

test("expired and malformed reel tickets never access stored videos", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    generationStatus: "succeeded",
    generationObjectPath: `creator-motion/${submissionId}.mp4`,
  });
  resetCreatorMotionVideo(Buffer.from("private-video"));
  const expired = videoTicket(1);
  const malformed = `/creator-cards/${submissionId}/motion/video?expires=not-a-time&signature=bad`;
  const tampered = videoTicket(undefined, "A".repeat(43));

  for (const url of [expired, malformed, tampered]) {
    const response = await playCreatorMotionVideo(url);
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(creatorMotionVideoState().metadataReads, 0);
    assert.deepEqual(creatorMotionVideoState().streamRanges, []);
  }
});

test("unpaid, failed, or missing reel records are never streamed", async () => {
  const unavailableOrders = [
    { status: "pending", generationStatus: "succeeded", generationObjectPath: `creator-motion/${submissionId}.mp4` },
    { status: "failed", generationStatus: "succeeded", generationObjectPath: `creator-motion/${submissionId}.mp4` },
    { status: "paid", generationStatus: "failed", generationObjectPath: `creator-motion/${submissionId}.mp4` },
    { status: "paid", generationStatus: "succeeded", generationObjectPath: null },
  ] as const;

  for (const order of unavailableOrders) {
    resetTestState();
    seedCreatorMotionOrder(order);
    resetCreatorMotionVideo(Buffer.from("private-video"));
    const response = await playCreatorMotionVideo();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(creatorMotionVideoState().metadataReads, 0);
    assert.deepEqual(creatorMotionVideoState().streamRanges, []);
  }
});

test("a missing stored reel returns unavailable without opening a video stream", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    generationStatus: "succeeded",
    generationObjectPath: `creator-motion/${submissionId}.mp4`,
  });
  resetCreatorMotionVideo(Buffer.from("private-video"), true);

  const response = await playCreatorMotionVideo();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(creatorMotionVideoState().metadataReads, 1);
  assert.deepEqual(creatorMotionVideoState().streamRanges, []);
});
