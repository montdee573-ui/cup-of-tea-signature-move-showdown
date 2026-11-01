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
import { paymentMatchesBasePrice } from "../lib/whop-payment-amounts";
import { creatorMotionVideoState, resetCreatorMotionVideo } from "./creator-cards-test-storage";

const CREATOR_TOKEN = "creator-link-token-for-checkout-regression-tests";
const PRICE_USD = 9.99;

test("payment amounts require exact base plus verified tax, not arbitrary overpayments", () => {
  assert.equal(paymentMatchesBasePrice({ subtotal: 2, tax_amount: 0.16, total: 2.16 }, 2), true);
  assert.equal(paymentMatchesBasePrice({ subtotal: "2.00", tax_amount: null, total: 2 }, 2), true);
  for (const payment of [
    { subtotal: 2, tax_amount: 0.16, total: 3 },
    { subtotal: 1, tax_amount: 1.16, total: 2.16 },
    { subtotal: 2, tax_amount: -0.16, total: 1.84 },
    { subtotal: 2, total: 2 },
    { subtotal: null, tax_amount: 0, total: 2 },
    { subtotal: 2, tax_amount: 0.001, total: 2.001 },
  ]) assert.equal(paymentMatchesBasePrice(payment, 2), false);
});
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
  "CONTEST_RESULTS_EMAIL_FROM",
] as const;
const originalEnv = new Map(OWNER_ENV.map((key) => [key, process.env[key]]));
const submissionId = "6dbec5fa-e3f8-4b1c-b245-1371b2ef51ae";
const app = express();
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let requestId = 0;
type SentEmail = { path: string; idempotencyKey?: string; body: Record<string, unknown> };
let sentEmails: SentEmail[] = [];

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
  process.env.CONTEST_RESULTS_EMAIL_FROM = "studio@example.test";
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
    company: { id: process.env.WHOP_COMPANY_ID },
    plan_type: "one_time",
    billing_period: null,
    currency: "usd",
    initial_price: PRICE_USD,
    collect_tax: false,
    adaptive_pricing_enabled: false,
    ...overrides,
  };
}

type WhopCall = { path: string; method?: string; idempotencyKey?: string };

type WhopMockOptions = {
  beforeRefund?: () => Promise<void>;
  failRequest?: { method: string; pathSuffix: string; status: number };
  timeoutAfterCheckoutCreated?: boolean;
  refundAmount?: number;
  failEmail?: boolean;
  emailFailures?: number;
  throwEmail?: boolean;
  checkoutConfigurations?: Array<{ id: string; metadata?: Record<string, unknown> | null }>;
};

async function withWhop(
  plan: Record<string, unknown>,
  run: (calls: WhopCall[], getCheckoutCreationCount: () => number) => Promise<void>,
  beforeCheckout?: () => Promise<void>,
  paymentOverrides: Record<string, unknown> = {},
  mockOptions: WhopMockOptions = {},
): Promise<void> {
  const calls: WhopCall[] = [];
  const checkoutSessions = new Map<string, { id: string; purchase_url: string }>();
  let checkoutCreationCount = 0;
  let emailFailureCount = 0;
  let timedOutAfterCheckoutCreation = false;
  sentEmails = [];
  let refundedAmount = 0;
  const originalProxy = ReplitConnectors.prototype.proxy;
  ReplitConnectors.prototype.proxy = async function (connectorName, path, options) {
    if (connectorName === "resend") {
      if (mockOptions.throwEmail) throw new Error("Resend is unavailable.");
      sentEmails.push({
        path,
        idempotencyKey: (options?.headers as Record<string, string> | undefined)?.["Idempotency-Key"],
        body: (options?.body ?? {}) as Record<string, unknown>,
      });
      const failEmail = mockOptions.emailFailures !== undefined
        ? emailFailureCount++ < mockOptions.emailFailures
        : mockOptions.failEmail;
      return new Response(JSON.stringify({ id: "email_test" }), {
        status: failEmail ? 503 : 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const idempotencyKey = (options?.headers as Record<string, string> | undefined)?.["Idempotency-Key"];
    calls.push({ path, method: options?.method, idempotencyKey });
    const isCheckoutCreation = path === "/api/v1/checkout_configurations" && options?.method === "POST";
    if (isCheckoutCreation) {
      await beforeCheckout?.();
    }
    let checkoutSession: { id: string; purchase_url: string } | undefined;
    if (isCheckoutCreation) {
      checkoutSession = idempotencyKey ? checkoutSessions.get(idempotencyKey) : undefined;
      if (!checkoutSession) {
        checkoutCreationCount += 1;
        checkoutSession = {
          id: checkoutCreationCount === 1 ? "checkout_test" : `checkout_test_${checkoutCreationCount}`,
          purchase_url: checkoutCreationCount === 1
            ? "https://whop.com/checkout/test"
            : `https://whop.com/checkout/test-${checkoutCreationCount}`,
        };
        if (idempotencyKey) checkoutSessions.set(idempotencyKey, checkoutSession);
      }
      if (mockOptions.timeoutAfterCheckoutCreated && !timedOutAfterCheckoutCreation) {
        timedOutAfterCheckoutCreation = true;
        throw new Error("Whop response timed out after creating the checkout.");
      }
    }
    const paymentPath = path.includes("/api/v1/payments/pay_test");
    const isRefundRequest = paymentPath && options?.method === "POST" && path.endsWith("/refund");
    if (isRefundRequest) {
      await mockOptions.beforeRefund?.();
      refundedAmount = mockOptions.refundAmount ?? PRICE_USD;
    }
    const payment = {
        id: "pay_test",
        company: { id: "biz_test" },
        checkout_configuration_id: "checkout_test",
        status: paymentOverrides.status ?? (refundedAmount >= PRICE_USD ? "refunded" : "paid"),
        subtotal: PRICE_USD,
        total: PRICE_USD,
        tax_amount: 0,
        currency: "usd",
        refunded_amount: paymentOverrides.refunded_amount ?? refundedAmount,
        user: { email: "creator@example.test" },
        ...paymentOverrides,
      };
    const payload = paymentPath
      ? payment
      : path.startsWith("/api/v1/payments?")
        ? { data: [payment] }
      : path.startsWith("/api/v1/checkout_configurations?")
        ? { data: mockOptions.checkoutConfigurations ?? [], page_info: { has_next_page: false } }
      : options?.method === "POST"
        ? checkoutSession ?? { id: "checkout_test", purchase_url: "https://whop.com/checkout/test" }
        : plan;
    const failRequest = mockOptions.failRequest;
    const failed = Boolean(failRequest
      && failRequest.method === options?.method
      && path.endsWith(failRequest.pathSuffix));
    return new Response(JSON.stringify(payload), {
      status: failed ? failRequest!.status : 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await run(calls, () => checkoutCreationCount);
  } finally {
    ReplitConnectors.prototype.proxy = originalProxy;
  }
}

async function withReplicate(
  run: (calls: string[]) => Promise<void>,
): Promise<void> {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.replicate.com/")) {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return new Response(JSON.stringify({ id: "prediction_test", status: "processing" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
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

async function ownerRefundDecision(
  decision: "refund" | "decline" | "resolve_partial",
  cookie = ownerCookie(),
): Promise<Response> {
  return fetch(`${baseUrl}/studio/creator-refunds/${submissionId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ decision }),
  });
}

async function ownerRefundNotificationRetry(cookie = ownerCookie()): Promise<Response> {
  return fetch(`${baseUrl}/studio/creator-refunds/${submissionId}/notification-retry`, {
    method: "POST",
    headers: { Cookie: cookie },
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

test("pending and rejected cards cannot see an offer, create checkout, or start generation", async () => {
  for (const status of ["pending", "rejected"]) {
    resetTestState();
    resetCreatorCardState({
      status,
      creatorTokenHash: createHash("sha256").update(CREATOR_TOKEN).digest("hex"),
    });
    await withReplicate(async (generationCalls) => {
      await withWhop(approvedPlan(), async (calls) => {
        const accessResponse = await creatorCardAccess();
        assert.equal(accessResponse.status, 200);
        const access = await accessResponse.json() as {
          submissionStatus: string; offerAvailable: boolean; priceUsd: number | null;
        };
        assert.equal(access.submissionStatus, status);
        assert.equal(access.offerAvailable, false);
        assert.equal(access.priceUsd, null);
        const purchaseResponse = await checkout();
        assert.equal(purchaseResponse.status, 409);
        assert.equal(calls.length, 0, "unapproved cards must not contact Whop");
      });
      assert.equal(generationCalls.length, 0);
      assert.equal(creatorCardState().orders.length, 0);
    });
  }
});

test("approved card access does not depend on enabling or buying the optional reel", async () => {
  resetTestState();
  process.env.CREATOR_MOTION_SALES_APPROVED = "false";
  await withWhop(approvedPlan(), async (calls) => {
    const response = await creatorCardAccess();
    assert.equal(response.status, 200);
    const access = await response.json() as { submissionStatus: string; offerAvailable: boolean };
    assert.equal(access.submissionStatus, "approved");
    assert.equal(access.offerAvailable, false);
    assert.equal(calls.length, 0);
    assert.equal(creatorCardState().orders.length, 0);
  });
});

test("mismatched, recurring, unverified-tax, and adaptive Whop plans never create checkout", async () => {
  const invalidPlans: Array<[string, Record<string, unknown>]> = [
    ["different price", { initial_price: 10 }],
    ["different plan", { id: "plan_not_approved" }],
    ["different owner account", { company: { id: "biz_not_approved" } }],
    ["different currency", { currency: "eur" }],
    ["recurring", { plan_type: "renewal", billing_period: 1 }],
    ["unknown tax collection", { collect_tax: undefined }],
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
      assert.match(calls[0].path, /\/api\/v1\/plans\//);
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

test("tax-enabled one-time plan creates checkout without changing the approved base price", async () => {
  resetTestState("plan_taxenabled");
  await withWhop(approvedPlan({ collect_tax: true }), async () => {
    const response = await checkout();
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { priceUsd: number }).priceUsd, PRICE_USD);
  });
  assert.equal(creatorCardState().orders[0].priceUsd, PRICE_USD);
});

test("refunding only the base price of a taxed payment remains a partial refund", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  await withWhop(approvedPlan({ collect_tax: true }), async (calls) => {
    const response = await ownerRefundDecision("refund");
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { refundRequestStatus: string }).refundRequestStatus, "partial_review");
    assert.equal(calls.some(call => call.path.endsWith("/refund")), false);
  }, undefined, { tax_amount: 0.8, total: PRICE_USD + 0.8, refunded_amount: PRICE_USD });
});

test("a full taxed refund is verified against the total rather than the base price", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  await withWhop(approvedPlan({ collect_tax: true }), async () => {
    const response = await ownerRefundDecision("refund");
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { refundRequestStatus: string }).refundRequestStatus, "completed");
  }, undefined, { tax_amount: 0.8, total: PRICE_USD + 0.8 }, { refundAmount: PRICE_USD + 0.8 });
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

test("overlapping checkouts create one Whop session and keep the winning order", async () => {
  resetTestState();
  let markCheckoutStarted!: () => void;
  let releaseCheckout!: () => void;
  const checkoutStarted = new Promise<void>((resolve) => {
    markCheckoutStarted = resolve;
  });
  const holdCheckout = new Promise<void>((resolve) => {
    releaseCheckout = resolve;
  });

  await withWhop(approvedPlan(), async (calls) => {
    const firstRequest = checkout();
    await checkoutStarted;

    const secondResponse = await checkout();
    assert.equal(secondResponse.status, 409);
    assert.match((await secondResponse.json() as { error: string }).error, /being prepared/);
    releaseCheckout();

    const firstResponse = await firstRequest;
    assert.equal(firstResponse.status, 200);
    assert.equal((await firstResponse.json() as { motionStatus: string }).motionStatus, "checkout_pending");
    assert.equal(calls.filter((call) => call.path.includes("/api/v1/checkout_configurations") && call.method === "POST").length, 1);
  }, async () => {
    markCheckoutStarted();
    await holdCheckout;
  });

  const [order] = creatorCardState().orders;
  assert.equal(creatorCardState().orders.length, 1);
  assert.equal(order.status, "pending");
  assert.equal(order.priceUsd, PRICE_USD);
  assert.equal(order.checkoutConfigurationId, "checkout_test");
  assert.equal(order.checkoutUrl, "https://whop.com/checkout/test");
});

test("retry recovers a Whop checkout created before the response timed out", async () => {
  resetTestState();

  await withWhop(approvedPlan(), async (calls, getCheckoutCreationCount) => {
    const timedOutResponse = await checkout();
    assert.equal(timedOutResponse.status, 503);
    assert.equal(creatorCardState().orders[0]?.status, "failed");
    assert.equal(creatorCardState().orders[0]?.checkoutConfigurationId, null);

    const retryResponse = await checkout();
    assert.equal(retryResponse.status, 200);
    assert.deepEqual(await retryResponse.json(), {
      motionStatus: "checkout_pending",
      checkoutUrl: "https://whop.com/checkout/test",
      priceUsd: PRICE_USD,
    });

    const checkoutCalls = calls.filter((call) =>
      call.path === "/api/v1/checkout_configurations" && call.method === "POST",
    );
    assert.equal(checkoutCalls.length, 2, "the retry must call Whop with the same idempotency key");
    assert.equal(checkoutCalls[0].idempotencyKey, checkoutCalls[1].idempotencyKey);
    assert.equal(getCheckoutCreationCount(), 1, "Whop must create only one hosted session");
  }, undefined, {}, { timeoutAfterCheckoutCreated: true });

  const [order] = creatorCardState().orders;
  assert.equal(creatorCardState().orders.length, 1);
  assert.equal(order.status, "pending");
  assert.equal(order.checkoutConfigurationId, "checkout_test");
  assert.equal(order.checkoutUrl, "https://whop.com/checkout/test");
  assert.equal(order.priceUsd, PRICE_USD);
});

test("stale checkout reservations reconcile Whop before recovering the saved order", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    status: "creating",
    checkoutConfigurationId: null,
    checkoutUrl: null,
    paymentId: null,
    priceUsd: PRICE_USD,
    createdAt: new Date(Date.now() - 10 * 60_000),
    paidAt: null,
  });

  await withWhop(approvedPlan(), async (calls) => {
    const response = await checkout();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      motionStatus: "checkout_pending",
      checkoutUrl: "https://whop.com/checkout/test",
      priceUsd: PRICE_USD,
    });
    const lookupIndex = calls.findIndex((call) => call.path.startsWith("/api/v1/checkout_configurations?"));
    const createIndex = calls.findIndex((call) =>
      call.path === "/api/v1/checkout_configurations" && call.method === "POST",
    );
    assert.ok(lookupIndex >= 0, "stale reservations must be checked with Whop");
    assert.ok(createIndex > lookupIndex, "Whop must be checked before retrying checkout creation");
  }, undefined, {}, {
    checkoutConfigurations: [{
      id: "checkout_test",
      metadata: { source: "signature-move-showdown", submission_id: submissionId },
    }],
  });

  const [order] = creatorCardState().orders;
  assert.equal(order.status, "pending");
  assert.equal(order.checkoutConfigurationId, "checkout_test");
  assert.equal(order.checkoutUrl, "https://whop.com/checkout/test");
  assert.equal(order.priceUsd, PRICE_USD);
  assert.equal(order.paymentId, null);
});

test("invalid Whop payments never mark a checkout paid or start reel generation", async () => {
  const invalidPayments: Array<[string, Record<string, unknown>]> = [
    ["wrong amount", { subtotal: PRICE_USD + 1 }],
    ["wrong currency", { currency: "eur" }],
    ["wrong checkout configuration", { checkout_configuration_id: "checkout_other" }],
    ["fully refunded", { status: "refunded", refunded_amount: PRICE_USD }],
    ["partially refunded", { refunded_amount: 1 }],
  ];

  for (const [label, payment] of invalidPayments) {
    resetTestState();
    await withReplicate(async (generationCalls) => {
      await withWhop(approvedPlan(), async (whopCalls) => {
        const checkoutResponse = await checkout();
        assert.equal(checkoutResponse.status, 200, `${label}: hosted checkout should be created`);

        const accessResponse = await creatorCardAccess();
        assert.equal(accessResponse.status, 200, `${label}: access should remain available`);
        const access = await accessResponse.json() as {
          motionStatus: string;
          generationStatus: string;
        };
        assert.equal(access.motionStatus, "checkout_pending", `${label}: order must remain pending`);
        assert.equal(access.generationStatus, "not_started", `${label}: generation must not start`);
        assert.equal(whopCalls.filter((call) => call.path.startsWith("/api/v1/payments?")).length, 1);
      }, undefined, payment);
      const [order] = creatorCardState().orders;
      assert.equal(order.status, "pending", `${label}: invalid payment must not mark order paid`);
      assert.equal(order.paymentId, null, `${label}: invalid payment must not be stored`);
      assert.equal(order.generationStatus, "not_started", `${label}: generation must remain unstarted`);
      assert.deepEqual(generationCalls, [], `${label}: provider must not receive a generation request`);
    });
  }
});

test("a matching, non-refunded USD payment marks the order paid and starts generation", async () => {
  resetTestState();
  await withReplicate(async (generationCalls) => {
    await withWhop(approvedPlan(), async (whopCalls) => {
      const checkoutResponse = await checkout();
      assert.equal(checkoutResponse.status, 200);

      const accessResponse = await creatorCardAccess();
      assert.equal(accessResponse.status, 200);
      const access = await accessResponse.json() as {
        motionStatus: string;
        generationStatus: string;
      };
      assert.equal(access.motionStatus, "paid");
      assert.equal(access.generationStatus, "processing");
      assert.equal(whopCalls.filter((call) => call.path.startsWith("/api/v1/payments?")).length, 1);
    });
    const [order] = creatorCardState().orders;
    assert.equal(order.status, "paid");
    assert.equal(order.paymentId, "pay_test");
    assert.equal(order.generationStatus, "processing");
    assert.equal(order.generationPredictionId, "prediction_test");
    assert.equal(generationCalls.length, 1);
    assert.match(generationCalls[0], /^POST https:\/\/api\.replicate\.com\/v1\/models\//);
  });
});

test("verified tax-inclusive payment grants access at the approved base price", async () => {
  resetTestState("plan_paidtax");
  await withReplicate(async (generationCalls) => {
    await withWhop(approvedPlan({ collect_tax: true }), async () => {
      assert.equal((await checkout()).status, 200);
      const response = await creatorCardAccess();
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { motionStatus: string }).motionStatus, "paid");
    }, undefined, { tax_amount: 0.8, total: PRICE_USD + 0.8 });
    assert.equal(creatorCardState().orders[0].priceUsd, PRICE_USD);
    assert.equal(generationCalls.length, 1);
  });
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
    const result = await response.json() as { refundRequestStatus: string; notificationStatus: string };
    assert.equal(result.refundRequestStatus, "completed");
    assert.equal(result.notificationStatus, "sent");
    assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "GET"]);
    assert.match(calls[1].path, /\/api\/v1\/payments\/pay_test\/refund$/);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].path, "/emails");
    assert.equal(sentEmails[0].body.to, "creator@example.test");
    assert.equal(sentEmails[0].body.subject, "Update on your creator reel refund request");
    assert.equal(sentEmails[0].body.text, "Your refund request for the optional creator reel has been completed.");
    assert.doesNotMatch(JSON.stringify(sentEmails[0].body), new RegExp(`${submissionId}|${CREATOR_TOKEN}|Creator|Spin move`));
  });
  const state = creatorCardState();
  assert.equal(state.orders[0].refundRequestStatus, "completed");
  assert.equal(state.submission.status, before.status);
  assert.deepEqual(state.writes, ["creator_motion_orders"]);
});

test("owner refund stays open when Whop payment identity or amount does not match", async () => {
  const mismatches: Array<Record<string, unknown>> = [
    { id: "pay_other" },
    { company: { id: "biz_other" } },
    { checkout_configuration_id: "checkout_other" },
    { currency: "eur" },
    { subtotal: PRICE_USD + 1 },
  ];

  for (const overrides of mismatches) {
    resetTestState();
    seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
    await withWhop(approvedPlan(), async (calls) => {
      const response = await ownerRefundDecision("refund");
      assert.equal(response.status, 409);
      assert.deepEqual(calls.map((call) => call.method), ["GET"]);
    }, undefined, overrides);
    const order = creatorCardState().orders[0];
    assert.equal(order.refundRequestStatus, "requested");
    assert.equal(order.refundProcessingAt, null);
  }
});

test("a partial Whop refund is queued with its verified amount and can be safely acknowledged", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  await withWhop(approvedPlan(), async (calls) => {
    const response = await ownerRefundDecision("refund");
    assert.equal(response.status, 200);
    const detected = await response.json() as {
      refundRequestStatus: string;
      refundVerifiedAmountUsd: number | null;
    };
    assert.equal(detected.refundRequestStatus, "partial_review");
    assert.equal(detected.refundVerifiedAmountUsd, 2.5);
    assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "GET"]);

    const queueResponse = await fetch(`${baseUrl}/studio/creator-refunds`, { headers: { Cookie: ownerCookie() } });
    assert.equal(queueResponse.status, 200);
    const [request] = await queueResponse.json() as Array<{
      refundRequestStatus: string;
      refundVerifiedAmountUsd: number | null;
    }>;
    assert.equal(request.refundRequestStatus, "partial_review");
    assert.equal(request.refundVerifiedAmountUsd, 2.5);

    const unsafeRetry = await ownerRefundDecision("refund");
    assert.equal(unsafeRetry.status, 409);
    assert.match((await unsafeRetry.json() as { error: string }).error, /partial refund/i);
    assert.equal(calls.filter((call) => call.path.endsWith("/refund")).length, 1);

    const resolvedResponse = await ownerRefundDecision("resolve_partial");
    assert.equal(resolvedResponse.status, 200);
    const resolved = await resolvedResponse.json() as {
      refundRequestStatus: string;
      refundVerifiedAmountUsd: number | null;
      notificationStatus: string;
    };
    assert.equal(resolved.refundRequestStatus, "partial_resolved");
    assert.equal(resolved.refundVerifiedAmountUsd, 2.5);
    assert.equal(resolved.notificationStatus, "sent");
    assert.equal(calls.filter((call) => call.path.endsWith("/refund")).length, 1);
    assert.match(String(sentEmails[0].body.text), /partial refund of \$2\.50 USD; this is not a full refund/);

    const refreshedQueue = await fetch(`${baseUrl}/studio/creator-refunds`, { headers: { Cookie: ownerCookie() } });
    assert.deepEqual(await refreshedQueue.json(), []);

    const creatorResponse = await creatorCardAccess();
    assert.equal(creatorResponse.status, 200);
    const creator = await creatorResponse.json() as {
      refundRequestStatus: string;
      refundVerifiedAmountUsd: number | null;
      motionStatus: string;
    };
    assert.equal(creator.refundRequestStatus, "partial_resolved");
    assert.equal(creator.refundVerifiedAmountUsd, 2.5);
    assert.equal(creator.motionStatus, "unavailable");
  }, undefined, {}, { refundAmount: 2.5 });
  const order = creatorCardState().orders[0];
  assert.equal(order.refundRequestStatus, "partial_resolved");
  assert.equal(order.refundVerifiedAmountUsd, 2.5);
  assert.equal(order.refundProcessingAt, null);
});

test("a pre-existing partial refund is recorded without issuing another Whop refund", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  await withWhop(approvedPlan(), async (calls) => {
    const response = await ownerRefundDecision("refund");
    assert.equal(response.status, 200);
    const result = await response.json() as {
      refundRequestStatus: string;
      refundVerifiedAmountUsd: number | null;
    };
    assert.equal(result.refundRequestStatus, "partial_review");
    assert.equal(result.refundVerifiedAmountUsd, 1.25);
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
    const queue = await fetch(`${baseUrl}/studio/creator-refunds`, { headers: { Cookie: ownerCookie() } });
    const [request] = await queue.json() as Array<{ statusCheckedAt: string }>;
    assert.equal(request.statusCheckedAt, creatorCardState().orders[0].refundStatusCheckedAt?.toISOString());
    assert.ok(Date.now() - Date.parse(request.statusCheckedAt) < 5000);
  }, undefined, { refunded_amount: 1.25 });

  const [order] = creatorCardState().orders;
  assert.equal(order.refundRequestStatus, "partial_review");
  assert.equal(order.refundVerifiedAmountUsd, 1.25);
});

test("Whop provider failures leave the refund in processing until it can be reconciled", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  await withWhop(approvedPlan(), async (calls) => {
    const response = await ownerRefundDecision("refund");
    assert.equal(response.status, 503);
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);

    const queue = await fetch(`${baseUrl}/studio/creator-refunds`, { headers: { Cookie: ownerCookie() } });
    const [request] = await queue.json() as Array<{ statusCheckedAt: string }>;
    assert.equal(request.statusCheckedAt, creatorCardState().orders[0].refundStatusCheckedAt?.toISOString());
    assert.ok(Date.now() - Date.parse(request.statusCheckedAt) < 5000);

    const creatorResponse = await creatorCardAccess();
    assert.equal(creatorResponse.status, 503);
    assert.doesNotMatch(await creatorResponse.text(), /motionVideoUrl/);
  }, undefined, {}, {
    failRequest: { method: "GET", pathSuffix: "/payments/pay_test", status: 504 },
  });
  assert.equal(creatorCardState().orders[0].refundRequestStatus, "processing");

  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  await withWhop(approvedPlan(), async (calls) => {
    const response = await ownerRefundDecision("refund");
    assert.equal(response.status, 503);
    assert.deepEqual(calls.map((call) => call.method), ["GET", "POST"]);

    const creatorResponse = await creatorCardAccess();
    assert.equal(creatorResponse.status, 200);
    assert.equal((await creatorResponse.json() as { refundRequestStatus: string }).refundRequestStatus, "processing");
  }, undefined, {}, {
    failRequest: { method: "POST", pathSuffix: "/refund", status: 504 },
  });
  assert.equal(creatorCardState().orders[0].refundRequestStatus, "processing");

  resetTestState();
  seedCreatorMotionOrder({
    refundRequestStatus: "processing",
    refundRequestedAt: new Date(),
    refundProcessingAt: new Date(Date.now() - 121_000),
  });
  await withWhop(approvedPlan(), async (calls) => {
    const response = await ownerRefundDecision("refund");
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { refundRequestStatus: string }).refundRequestStatus, "completed");
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
  }, undefined, { status: "refunded", refunded_amount: PRICE_USD });
  assert.equal(creatorCardState().orders[0].refundRequestStatus, "completed");
});

test("loading the owner refund queue completes a confirmed stale refund without retrying it", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    refundRequestStatus: "processing",
    refundRequestedAt: new Date(),
    refundProcessingAt: new Date(Date.now() - 121_000),
  });

  await withWhop(approvedPlan(), async (calls) => {
    const response = await fetch(`${baseUrl}/studio/creator-refunds`, {
      headers: { Cookie: ownerCookie() },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
    assert.equal(calls.some((call) => call.path.endsWith("/refund")), false);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].body.text, "Your refund request for the optional creator reel has been completed.");
  }, undefined, { status: "refunded", refunded_amount: PRICE_USD });

  const [order] = creatorCardState().orders;
  assert.equal(order.refundRequestStatus, "completed");
  assert.equal(order.refundProcessingAt, null);
});

test("creator card access reconciles a full refund confirmed after a restart", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    refundRequestStatus: "processing",
    refundRequestedAt: new Date(),
    refundProcessingAt: new Date(Date.now() - 121_000),
  });

  await withWhop(approvedPlan(), async (calls) => {
    const response = await creatorCardAccess();
    assert.equal(response.status, 200);
    const result = await response.json() as { refundRequestStatus: string };
    assert.equal(result.refundRequestStatus, "completed");
    assert.equal(calls.some((call) => call.path.endsWith("/refund")), false);
  }, undefined, { status: "refunded", refunded_amount: PRICE_USD });

  assert.equal(creatorCardState().orders[0].refundRequestStatus, "completed");
});

test("stale refund claims stay protected when Whop cannot verify them", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    refundRequestStatus: "processing",
    refundRequestedAt: new Date(),
    refundProcessingAt: new Date(Date.now() - 121_000),
  });

  await withWhop(approvedPlan(), async (calls) => {
    const queueResponse = await fetch(`${baseUrl}/studio/creator-refunds`, {
      headers: { Cookie: ownerCookie() },
    });
    assert.equal(queueResponse.status, 200);
    const [request] = await queueResponse.json() as Array<{
      refundRequestStatus: string;
      statusCheckUnverified: boolean;
      statusCheckedAt: string;
      paymentId?: string;
      providerStatus?: number;
    }>;
    assert.equal(request.refundRequestStatus, "processing");
    assert.equal(request.statusCheckUnverified, true);
    assert.equal(request.statusCheckedAt, creatorCardState().orders[0].refundStatusCheckedAt?.toISOString());
    assert.ok(Date.now() - Date.parse(request.statusCheckedAt) < 5000);
    assert.equal("paymentId" in request, false);
    assert.equal("providerStatus" in request, false);

    const previousCheck = new Date("2026-01-01T00:00:00Z");
    seedCreatorMotionOrder({ ...creatorCardState().orders[0], refundStatusCheckedAt: previousCheck });
    const retryResponse = await ownerRefundDecision("refund");
    assert.equal(retryResponse.status, 503);
    assert.ok(creatorCardState().orders[0].refundStatusCheckedAt!.getTime() > previousCheck.getTime());
    assert.equal(calls.some((call) => call.path.endsWith("/refund")), false);
  }, undefined, {}, {
    failRequest: { method: "GET", pathSuffix: "/payments/pay_test", status: 504 },
  });

  assert.equal(creatorCardState().orders[0].refundRequestStatus, "processing");
});

test("fresh processing refunds show no recorded check and do not contact Whop", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    refundRequestStatus: "processing",
    refundRequestedAt: new Date(),
    refundProcessingAt: new Date(),
  });
  await withWhop(approvedPlan(), async (calls) => {
    const response = await fetch(`${baseUrl}/studio/creator-refunds`, {
      headers: { Cookie: ownerCookie() },
    });
    assert.equal(response.status, 200);
    const [request] = await response.json() as Array<{ statusCheckedAt: string | null }>;
    assert.equal(request.statusCheckedAt, null);
    assert.equal(calls.length, 0);
  });
});

test("an unchanged verified payment safely reopens a stale claim without refunding", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    refundRequestStatus: "processing",
    refundRequestedAt: new Date(),
    refundProcessingAt: new Date(Date.now() - 121_000),
  });

  await withWhop(approvedPlan(), async (calls) => {
    const response = await fetch(`${baseUrl}/studio/creator-refunds`, {
      headers: { Cookie: ownerCookie() },
    });
    assert.equal(response.status, 200);
    const [request] = await response.json() as Array<{ refundRequestStatus: string }>;
    assert.equal(request.refundRequestStatus, "requested");
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
    assert.equal(calls.some((call) => call.path.endsWith("/refund")), false);
  });

  const [order] = creatorCardState().orders;
  assert.equal(order.refundRequestStatus, "requested");
  assert.equal(order.refundProcessingAt, null);
});

test("a stale claim with a different Whop payment identity remains processing", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    refundRequestStatus: "processing",
    refundRequestedAt: new Date(),
    refundProcessingAt: new Date(Date.now() - 121_000),
  });

  await withWhop(approvedPlan(), async (calls) => {
    const response = await fetch(`${baseUrl}/studio/creator-refunds`, {
      headers: { Cookie: ownerCookie() },
    });
    assert.equal(response.status, 200);
    const [request] = await response.json() as Array<{ refundRequestStatus: string }>;
    assert.equal(request.refundRequestStatus, "processing");
    assert.equal(calls.some((call) => call.path.endsWith("/refund")), false);
  }, undefined, { id: "pay_other", status: "refunded", refunded_amount: PRICE_USD });

  assert.equal(creatorCardState().orders[0].refundRequestStatus, "processing");
});

test("a stale partial refund is recorded for review without another refund", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    refundRequestStatus: "processing",
    refundRequestedAt: new Date(),
    refundProcessingAt: new Date(Date.now() - 121_000),
  });

  await withWhop(approvedPlan(), async (calls) => {
    const response = await fetch(`${baseUrl}/studio/creator-refunds`, {
      headers: { Cookie: ownerCookie() },
    });
    assert.equal(response.status, 200);
    const [request] = await response.json() as Array<{
      refundRequestStatus: string;
      refundVerifiedAmountUsd: number | null;
    }>;
    assert.equal(request.refundRequestStatus, "partial_review");
    assert.equal(request.refundVerifiedAmountUsd, 2.5);
    assert.equal(calls.some((call) => call.path.endsWith("/refund")), false);
  }, undefined, { refunded_amount: 2.5 });

  const [order] = creatorCardState().orders;
  assert.equal(order.refundRequestStatus, "partial_review");
  assert.equal(order.refundVerifiedAmountUsd, 2.5);
  assert.equal(order.refundProcessingAt, null);
});

test("overlapping owner refund decisions can issue only one Whop refund", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  let markRefundStarted!: () => void;
  let releaseRefund!: () => void;
  const refundStarted = new Promise<void>((resolve) => { markRefundStarted = resolve; });
  const refundGate = new Promise<void>((resolve) => { releaseRefund = resolve; });

  await withWhop(approvedPlan(), async (calls) => {
    const firstDecision = ownerRefundDecision("refund");
    await refundStarted;
    const secondResponse = await ownerRefundDecision("refund");
    assert.equal(secondResponse.status, 409);
    assert.equal(calls.filter((call) => call.path.endsWith("/refund")).length, 1);

    releaseRefund();
    const firstResponse = await firstDecision;
    assert.equal(firstResponse.status, 200);
    assert.equal((await firstResponse.json() as { refundRequestStatus: string }).refundRequestStatus, "completed");
    assert.equal(calls.filter((call) => call.path.endsWith("/refund")).length, 1);
  }, undefined, {}, {
    beforeRefund: async () => {
      markRefundStarted();
      await refundGate;
    },
  });
  assert.equal(creatorCardState().orders[0].refundRequestStatus, "completed");
});

test("owner can decline a refund request without issuing a Whop refund", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  await withWhop(approvedPlan(), async (calls) => {
    const response = await ownerRefundDecision("decline");
    assert.equal(response.status, 200);
    const rawResponse = await response.text();
    const result = JSON.parse(rawResponse) as { refundRequestStatus: string; notificationStatus: string };
    assert.equal(result.refundRequestStatus, "declined");
    assert.equal(result.notificationStatus, "sent");
    assert.doesNotMatch(rawResponse, /creator@example\.test/);
    assert.deepEqual(calls.map((call) => call.method), ["GET"]);
    assert.equal(sentEmails.length, 1);
    assert.equal(sentEmails[0].body.to, "creator@example.test");
    assert.equal(sentEmails[0].body.text, "Your refund request for the optional creator reel has been declined.");
  });
  assert.equal(creatorCardState().orders[0].refundRequestStatus, "declined");
});

test("email delivery failure does not undo the completed refund", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });

  await withWhop(approvedPlan(), async () => {
    const response = await ownerRefundDecision("refund");
    assert.equal(response.status, 200);
    const result = await response.json() as { refundRequestStatus: string; notificationStatus: string };
    assert.equal(result.refundRequestStatus, "completed");
    assert.equal(result.notificationStatus, "failed");
  }, undefined, {}, { failEmail: true });

  assert.equal(creatorCardState().orders[0].refundRequestStatus, "completed");
  assert.equal(creatorCardState().orders[0].refundNotificationStatus, "failed");
  assert.equal(sentEmails.length, 1);
});

test("owner can retry only a failed completed-refund email without refunding twice", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });

  await withWhop(approvedPlan(), async (calls) => {
    const initial = await ownerRefundDecision("refund");
    assert.equal(initial.status, 200);
    assert.deepEqual(await initial.json(), {
      refundRequestStatus: "completed",
      refundVerifiedAmountUsd: null,
      refundRequestedAt: creatorCardState().orders[0].refundRequestedAt?.toISOString(),
      notificationStatus: "failed",
    });
    assert.equal(creatorCardState().orders[0].refundNotificationStatus, "failed");
    assert.equal(sentEmails.length, 1);

    const queueResponse = await fetch(`${baseUrl}/studio/creator-refunds`, {
      headers: { Cookie: ownerCookie() },
    });
    assert.equal(queueResponse.status, 200);
    const [request] = await queueResponse.json() as Array<{
      refundRequestStatus: string;
      notificationStatus: string;
    }>;
    assert.equal(request.refundRequestStatus, "completed");
    assert.equal(request.notificationStatus, "failed");

    const anonymousRetry = await ownerRefundNotificationRetry("");
    assert.equal(anonymousRetry.status, 401);

    const retry = await ownerRefundNotificationRetry();
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), { notificationStatus: "sent" });
    assert.equal(creatorCardState().orders[0].refundRequestStatus, "completed");
    assert.equal(creatorCardState().orders[0].refundNotificationStatus, "sent");
    assert.equal(sentEmails.length, 2);
    assert.equal(sentEmails[1].body.text, sentEmails[0].body.text);
    assert.equal(sentEmails[1].idempotencyKey, sentEmails[0].idempotencyKey);
    assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "GET", "GET"]);
    assert.equal(calls.filter((call) => call.path.endsWith("/refund")).length, 1);

    const repeatedRetry = await ownerRefundNotificationRetry();
    assert.equal(repeatedRetry.status, 200);
    assert.deepEqual(await repeatedRetry.json(), { notificationStatus: "sent" });
    assert.equal(sentEmails.length, 2);
    assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "GET", "GET"]);
  }, undefined, {}, { emailFailures: 1 });
});

test("overlapping refund email retries send one creator notification", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    refundRequestStatus: "completed",
    refundNotificationStatus: "failed",
    refundRequestedAt: new Date(),
  });

  await withWhop(approvedPlan(), async (calls) => {
    const responses = await Promise.all([
      ownerRefundNotificationRetry(),
      ownerRefundNotificationRetry(),
    ]);
    assert(responses.every((response) => response.status === 200 || response.status === 409));
    assert(responses.some((response) => response.status === 200));
    assert.equal(sentEmails.length, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls.some((call) => call.path.endsWith("/refund")), false);
  });
  assert.equal(creatorCardState().orders[0].refundNotificationStatus, "sent");
});

test("an email connector failure does not undo the completed refund", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });

  await withWhop(approvedPlan(), async () => {
    const response = await ownerRefundDecision("refund");
    assert.equal(response.status, 200);
    const result = await response.json() as { refundRequestStatus: string; notificationStatus: string };
    assert.equal(result.refundRequestStatus, "completed");
    assert.equal(result.notificationStatus, "failed");
  }, undefined, {}, { throwEmail: true });

  assert.equal(creatorCardState().orders[0].refundRequestStatus, "completed");
});

test("missing verified buyer email does not expose contact data or undo a decline", async () => {
  resetTestState();
  seedCreatorMotionOrder({ refundRequestStatus: "requested", refundRequestedAt: new Date() });
  const unavailableAddress = "not-an-email";

  await withWhop(approvedPlan(), async () => {
    const response = await ownerRefundDecision("decline");
    assert.equal(response.status, 200);
    const rawResponse = await response.text();
    const result = JSON.parse(rawResponse) as { refundRequestStatus: string; notificationStatus: string };
    assert.equal(result.refundRequestStatus, "declined");
    assert.equal(result.notificationStatus, "not_sent");
    assert.doesNotMatch(rawResponse, new RegExp(unavailableAddress));
  }, undefined, { user: { email: unavailableAddress } });

  assert.equal(creatorCardState().orders[0].refundRequestStatus, "declined");
  assert.equal(sentEmails.length, 0);
});

test("private reel playback accepts a valid ticket and serves private byte ranges", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    generationStatus: "succeeded",
    generationObjectPath: `creator-motion/${submissionId}.mp4`,
  });
  resetCreatorMotionVideo(Buffer.from("0123456789"));

  await withWhop(approvedPlan(), async (calls) => {
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
    assert.equal(calls.filter((call) => call.path.endsWith("/payments/pay_test")).length, 1);
  });
});

test("private reel playback serves suffix and open-ended byte ranges", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    generationStatus: "succeeded",
    generationObjectPath: `creator-motion/${submissionId}.mp4`,
  });
  resetCreatorMotionVideo(Buffer.from("0123456789"));

  await withWhop(approvedPlan(), async () => {
    const suffix = await playCreatorMotionVideo(videoTicket(), "bytes=-3");
    assert.equal(suffix.status, 206);
    assert.equal(await suffix.text(), "789");
    assert.equal(suffix.headers.get("content-range"), "bytes 7-9/10");
    assert.equal(suffix.headers.get("content-length"), "3");

    const oversizedSuffix = await playCreatorMotionVideo(videoTicket(), "bytes=-50");
    assert.equal(oversizedSuffix.status, 206);
    assert.equal(await oversizedSuffix.text(), "0123456789");
    assert.equal(oversizedSuffix.headers.get("content-range"), "bytes 0-9/10");

    const openEnded = await playCreatorMotionVideo(videoTicket(), "bytes=7-");
    assert.equal(openEnded.status, 206);
    assert.equal(await openEnded.text(), "789");
    assert.equal(openEnded.headers.get("content-range"), "bytes 7-9/10");
    assert.deepEqual(creatorMotionVideoState().streamRanges, [
      { start: 7, end: 9 },
      { start: 0, end: 9 },
      { start: 7, end: 9 },
    ]);
  });
});

test("invalid private reel byte ranges return 416 without opening a stream", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    generationStatus: "succeeded",
    generationObjectPath: `creator-motion/${submissionId}.mp4`,
  });
  resetCreatorMotionVideo(Buffer.from("0123456789"));

  await withWhop(approvedPlan(), async () => {
    for (const range of ["bytes=-0", "bytes=-", "bytes=10-", "bytes=5-2", "bytes=1-2,4-5", "items=1-2"]) {
      const response = await playCreatorMotionVideo(videoTicket(), range);
      assert.equal(response.status, 416, `range ${range}`);
      assert.equal(response.headers.get("content-range"), "bytes */10", `range ${range}`);
      assert.equal(await response.text(), "", `range ${range}`);
    }
    assert.deepEqual(creatorMotionVideoState().streamRanges, []);
  });
});

test("refunded purchases cannot receive or use a creator-reel playback ticket", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    generationStatus: "succeeded",
    generationObjectPath: `creator-motion/${submissionId}.mp4`,
  });
  resetCreatorMotionVideo(Buffer.from("private-video"));

  await withWhop(approvedPlan(), async () => {
    const response = await creatorCardAccess();
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      motionStatus: string;
      motionVideoUrl: string | null;
      offerAvailable: boolean;
      priceUsd: number | null;
    };
    assert.equal(payload.motionStatus, "unavailable");
    assert.equal(payload.motionVideoUrl, null);
    assert.equal(payload.offerAvailable, false);
    assert.equal(payload.priceUsd, null);
  }, undefined, { status: "refunded", refunded_amount: PRICE_USD });

  await withWhop(approvedPlan(), async () => {
    const response = await playCreatorMotionVideo();
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(creatorMotionVideoState().metadataReads, 0);
    assert.deepEqual(creatorMotionVideoState().streamRanges, []);
  }, undefined, { status: "refunded", refunded_amount: PRICE_USD });

  await withWhop(approvedPlan(), async () => {
    const response = await playCreatorMotionVideo();
    assert.equal(response.status, 403);
    assert.equal(creatorMotionVideoState().metadataReads, 0);
    assert.deepEqual(creatorMotionVideoState().streamRanges, []);
  }, undefined, { status: "paid", refunded_amount: 1 });
});

test("Whop verification failures block ticket issuance and stored video playback", async () => {
  resetTestState();
  seedCreatorMotionOrder({
    generationStatus: "succeeded",
    generationObjectPath: `creator-motion/${submissionId}.mp4`,
  });
  resetCreatorMotionVideo(Buffer.from("private-video"));
  const failure = { method: "GET", pathSuffix: "/payments/pay_test", status: 504 };

  await withWhop(approvedPlan(), async () => {
    const response = await creatorCardAccess();
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /motionVideoUrl/);
  }, undefined, {}, { failRequest: failure });

  await withWhop(approvedPlan(), async () => {
    const response = await playCreatorMotionVideo();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(creatorMotionVideoState().metadataReads, 0);
    assert.deepEqual(creatorMotionVideoState().streamRanges, []);
  }, undefined, {}, { failRequest: failure });
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

  await withWhop(approvedPlan(), async () => {
    const response = await playCreatorMotionVideo();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    assert.equal(creatorMotionVideoState().metadataReads, 1);
    assert.deepEqual(creatorMotionVideoState().streamRanges, []);
  });
});
