import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import express, { type Request } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import creatorCardsRouter from "./creator-cards";
import { creatorCardState, resetCreatorCardState } from "./creator-cards-test-db";

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
  process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = "creator-motion-test-bucket";
  process.env.PRIVATE_OBJECT_DIR = "creator-motion-private";
}

function resetTestState(planId?: string): void {
  configureOwner(planId);
  resetCreatorCardState({
    creatorTokenHash: createHash("sha256").update(CREATOR_TOKEN).digest("hex"),
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
  const originalProxy = ReplitConnectors.prototype.proxy;
  ReplitConnectors.prototype.proxy = async function (_connectorName, path, options) {
    calls.push({ path, method: options?.method });
    const payload = options?.method === "POST"
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
