import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import cookieParser from "cookie-parser";
import express, { type Request } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import contestResultsRouter from "./contest-results";
import resendWebhookRouter from "./resend-webhook";
import studioRouter from "./studio";
import {
  getContestResultRowsForTest,
  resetContestResultRows,
  resetStudioLoginAttempts,
  setStudioLoginAttempt,
} from "./contest-results-test-db";

const SESSION_SECRET = "contest-results-test-session-secret";
const ADMIN_PASSWORD = "contest-results-test-owner-password";
const app = express();
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let observedClientIp = "";

function ownerCookie(): string {
  const payload = Buffer.from(JSON.stringify({
    role: "owner",
    exp: Date.now() + 60_000,
  })).toString("base64url");
  const signature = createHmac("sha256", `${SESSION_SECRET}:${ADMIN_PASSWORD}`)
    .update(payload)
    .digest("base64url");
  return `reel_studio_owner=${payload}.${signature}`;
}

before(async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.REEL_STUDIO_ADMIN_PASSWORD = ADMIN_PASSWORD;
  app.set("trust proxy", true);

  app.use("/webhooks/resend", express.raw({ type: "application/json", limit: "64kb" }));
  app.use(express.json());
  app.use(cookieParser());
  app.use((req: Request, _res, next) => {
    observedClientIp = req.ip ?? "unknown";
    Object.defineProperty(req, "log", {
      value: { info: () => undefined, warn: () => undefined },
    });
    next();
  });
  app.use(contestResultsRouter);
  app.use(studioRouter);
  app.use(resendWebhookRouter);

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
});

async function request(path: string, init: RequestInit = {}, authenticated = false): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authenticated) headers.set("Cookie", ownerCookie());
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function login(password: string): Promise<Response> {
  return request("/studio/session", {
    method: "POST",
    headers: { "X-Forwarded-For": "127.0.0.1" },
    body: JSON.stringify({ password }),
  });
}

function createBody(winnerVotes = 10, runnerUpVotes = 5) {
  return {
    eventTitle: "Test event",
    division: "Open",
    winnerName: "Winner",
    winnerHandle: "@winner",
    runnerUpName: "Runner-up",
    winnerVotes,
    runnerUpVotes,
    base44Summary: "Verified in the original contest app.",
    viralReelSummary: "Verified in Viral Reel.",
  };
}

async function clear(id = 1, clearanceNote = "  Reviewed against both contest apps.  "): Promise<Response> {
  return request(`/studio/contest-results/${id}/clear`, {
    method: "POST",
    body: JSON.stringify({ confirm: true, clearanceNote }),
  }, true);
}

test("unauthenticated requests cannot list, create, clear, or email contest results", async () => {
  resetContestResultRows();
  const list = await request("/studio/contest-results");
  const create = await request("/studio/contest-results", {
    method: "POST",
    body: JSON.stringify(createBody()),
  });
  const clearResult = await request("/studio/contest-results/1/clear", {
    method: "POST",
    body: JSON.stringify({ confirm: true, clearanceNote: "Not authorized" }),
  });
  const emailResult = await request("/studio/contest-results/1/email", {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });

  assert.deepEqual([list.status, create.status, clearResult.status, emailResult.status], [401, 401, 401, 401]);
  const results = await request("/studio/contest-results", {}, true);
  assert.deepEqual((await results.json() as { results: unknown[] }).results, []);
});

test("owner login throttling persists failures, expires the window, and clears after success", async () => {
  resetStudioLoginAttempts();
  const simultaneousAttempts = await Promise.all(
    Array.from({ length: 8 }, () => login("incorrect-password")),
  );
  assert.deepEqual(
    simultaneousAttempts.map((response) => response.status).sort((left, right) => left - right),
    [401, 401, 401, 401, 401, 429, 429, 429],
  );

  resetStudioLoginAttempts();
  setStudioLoginAttempt(observedClientIp, 5, new Date(Date.now() - 1));
  const expired = await login("incorrect-password");
  assert.equal(expired.status, 401);
  assert.equal((await login(ADMIN_PASSWORD)).status, 200);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login("incorrect-password")).status, 401);
  }
  assert.equal((await login(ADMIN_PASSWORD)).status, 429);
});

test("only the authenticated owner receives the configured email destination", async () => {
  resetContestResultRows();
  process.env.CONTEST_RESULTS_EMAIL_TO = "results@example.test";
  process.env.CONTEST_RESULTS_EMAIL_FROM = "contest@example.test";
  try {
    const unauthorized = await request("/studio/contest-results");
    assert.equal(unauthorized.status, 401);
    assert.doesNotMatch(JSON.stringify(await unauthorized.json()), /results@example\.test/);

    const response = await request("/studio/contest-results", {}, true);
    const body = await response.json() as {
      emailRecipient: string | null;
      emailSenderConfigured: boolean;
      results: unknown[];
    };
    assert.equal(body.emailRecipient, "results@example.test");
    assert.equal(body.emailSenderConfigured, true);
    assert.deepEqual(body.results, []);
  } finally {
    delete process.env.CONTEST_RESULTS_EMAIL_TO;
    delete process.env.CONTEST_RESULTS_EMAIL_FROM;
  }
});

test("a tied or trailing vote count cannot be cleared", async () => {
  for (const [winnerVotes, runnerUpVotes] of [[5, 5], [4, 5]]) {
    resetContestResultRows([{ winnerVotes, runnerUpVotes }]);
    const response = await clear();
    assert.equal(response.status, 409);
    assert.match((await response.json() as { error: string }).error, /tied or trailing/);
  }
});

test("invalid clearance requests leave the result in draft", async () => {
  const invalidRequests: Array<{ path: string; body: Record<string, unknown> }> = [
    { path: "/studio/contest-results/not-an-id/clear", body: { confirm: true, clearanceNote: "Reviewed." } },
    { path: "/studio/contest-results/1.5/clear", body: { confirm: true, clearanceNote: "Reviewed." } },
    { path: "/studio/contest-results/1/clear", body: { clearanceNote: "Reviewed." } },
    { path: "/studio/contest-results/1/clear", body: { confirm: true, clearanceNote: "" } },
    { path: "/studio/contest-results/1/clear", body: { confirm: true, clearanceNote: " \t\n " } },
  ];

  for (const { path, body } of invalidRequests) {
    resetContestResultRows([{ winnerVotes: 10, runnerUpVotes: 5 }]);
    const response = await request(path, {
      method: "POST",
      body: JSON.stringify(body),
    }, true);

    assert.equal(response.status, 400);
    const results = await request("/studio/contest-results", {}, true);
    const [result] = (await results.json() as {
      results: Array<{ status: string; clearanceNote: string | null }>;
    }).results;
    assert.equal(result.status, "draft");
    assert.equal(result.clearanceNote, null);
  }
});

test("an owner can clear a winning result once and records the note and timestamp", async () => {
  resetContestResultRows([{ winnerVotes: 10, runnerUpVotes: 5 }]);

  const response = await clear();
  assert.equal(response.status, 200);
  const body = await response.json() as {
    status: string;
    clearanceNote: string | null;
    clearedAt: string;
  };
  assert.equal(body.status, "cleared");
  assert.equal(body.clearanceNote, "Reviewed against both contest apps.");
  assert.ok(Number.isFinite(Date.parse(body.clearedAt)));

  const secondResponse = await clear();
  assert.equal(secondResponse.status, 409);
  assert.match((await secondResponse.json() as { error: string }).error, /already been cleared/);
});

test("simultaneous clear requests produce one clearance using the winning request's details", async () => {
  resetContestResultRows([{ winnerVotes: 10, runnerUpVotes: 5 }]);

  const notes = ["First owner review.", "Second owner review."];
  const responses = await Promise.all(notes.map((note) => clear(1, note)));
  const successfulResponses = responses.filter((response) => response.status === 200);
  const conflicts = responses.filter((response) => response.status === 409);

  assert.equal(successfulResponses.length, 1);
  assert.equal(conflicts.length, 1);
  const successfulBody = await successfulResponses[0].json() as {
    status: string;
    clearanceNote: string | null;
    clearedAt: string;
  };
  assert.equal(successfulBody.status, "cleared");
  assert.ok(notes.includes(successfulBody.clearanceNote ?? ""));
  assert.ok(Number.isFinite(Date.parse(successfulBody.clearedAt)));

  const conflictBody = await conflicts[0].json() as { error: string };
  assert.match(conflictBody.error, /already been cleared|another session/);

  const results = await request("/studio/contest-results", {}, true);
  const [stored] = (await results.json() as { results: Array<{
    status: string;
    clearanceNote: string | null;
    clearedAt: string | null;
  }> }).results;
  assert.equal(stored.status, "cleared");
  assert.equal(stored.clearanceNote, successfulBody.clearanceNote);
  assert.equal(stored.clearedAt, successfulBody.clearedAt);
});

test("a draft cannot be emailed, even when the owner confirms", async () => {
  resetContestResultRows([{ status: "draft" }]);

  const response = await request("/studio/contest-results/1/email", {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  }, true);

  assert.equal(response.status, 409);
  assert.match((await response.json() as { error: string }).error, /Only an owner-cleared final/);
  const results = await request("/studio/contest-results", {}, true);
  assert.equal((await results.json() as { results: Array<{ emailDeliveryStatus: string }> }).results[0].emailDeliveryStatus, "not_sent");
});

test("an uncleared email configuration is reported without sending", async () => {
  resetContestResultRows([{
    status: "cleared",
    clearanceNote: "Verified against both apps.",
    clearedAt: new Date("2026-10-02T12:00:00.000Z"),
  }]);
  delete process.env.CONTEST_RESULTS_EMAIL_TO;
  delete process.env.CONTEST_RESULTS_EMAIL_FROM;

  const response = await request("/studio/contest-results/1/email", {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  }, true);

  assert.equal(response.status, 503);
  assert.match((await response.json() as { error: string }).error, /recipient is not configured/);
  const results = await request("/studio/contest-results", {}, true);
  const body = await results.json() as {
    emailRecipient: string | null;
    results: Array<{ emailDeliveryStatus: string }>;
  };
  assert.equal(body.emailRecipient, null);
  assert.equal(body.results[0].emailDeliveryStatus, "not_sent");
});

test("a missing sender is distinguished from provider delivery failure", async () => {
  resetContestResultRows([{
    status: "cleared",
    clearanceNote: "Verified against both apps.",
    clearedAt: new Date("2026-10-02T12:00:00.000Z"),
  }]);
  process.env.CONTEST_RESULTS_EMAIL_TO = "results@example.test";
  delete process.env.CONTEST_RESULTS_EMAIL_FROM;
  try {
    const response = await request("/studio/contest-results/1/email", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }, true);
    assert.equal(response.status, 503);
    assert.match((await response.json() as { error: string }).error, /sender is not configured/);
    const results = await request("/studio/contest-results", {}, true);
    const body = await results.json() as { results: Array<{ emailDeliveryStatus: string }> };
    assert.equal(body.results[0].emailDeliveryStatus, "not_sent");
  } finally {
    delete process.env.CONTEST_RESULTS_EMAIL_TO;
    delete process.env.CONTEST_RESULTS_EMAIL_FROM;
  }
});

test("an owner can email a cleared result once and sees the saved delivery status", async () => {
  resetContestResultRows([{
    status: "cleared",
    clearanceNote: "Verified against both apps.",
    clearedAt: new Date("2026-10-02T12:00:00.000Z"),
  }]);
  process.env.CONTEST_RESULTS_EMAIL_TO = "results@example.test";
  process.env.CONTEST_RESULTS_EMAIL_FROM = "contest@example.test";
  const originalProxy = ReplitConnectors.prototype.proxy;
  let sentRequest: { connectorName: string; path: string; options?: { method?: string; headers?: Record<string, string>; body?: unknown } } | undefined;
  ReplitConnectors.prototype.proxy = async function (connectorName, path, options) {
    sentRequest = { connectorName, path, options };
    return new Response(JSON.stringify({ id: "email_test_1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await request("/studio/contest-results/1/email", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }, true);
    assert.equal(response.status, 200);
  const body = await response.json() as { emailDeliveryStatus: string; emailSentAt: string | null };
    assert.equal(body.emailDeliveryStatus, "sent");
  assert.ok(Number.isFinite(Date.parse(body.emailSentAt ?? "")));
    assert.equal(body.emailDeliveryStatus, "sent");
    assert.equal(sentRequest?.connectorName, "resend");
    assert.equal(sentRequest?.path, "/emails");
    assert.equal(sentRequest?.options?.method, "POST");
    assert.equal(sentRequest?.options?.headers?.["Idempotency-Key"], "contest-result-1");
    const mail = sentRequest?.options?.body as { to: string; from: string; text: string };
    assert.equal(mail.to, "results@example.test");
    assert.equal(mail.from, "contest@example.test");
    assert.match(mail.text, /Vote winner: Winner/);
    assert.equal(getContestResultRowsForTest()[0].emailProviderId, "email_test_1");

    const secondResponse = await request("/studio/contest-results/1/email", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }, true);
    assert.equal(secondResponse.status, 409);
  } finally {
    ReplitConnectors.prototype.proxy = originalProxy;
    delete process.env.CONTEST_RESULTS_EMAIL_TO;
    delete process.env.CONTEST_RESULTS_EMAIL_FROM;
  }
});

test("simultaneous email requests send once and return a conflict to the losing owner", async () => {
  resetContestResultRows([{
    status: "cleared",
    clearanceNote: "Verified against both apps.",
    clearedAt: new Date("2026-10-02T12:00:00.000Z"),
  }]);
  process.env.CONTEST_RESULTS_EMAIL_TO = "results@example.test";
  process.env.CONTEST_RESULTS_EMAIL_FROM = "contest@example.test";
  const originalProxy = ReplitConnectors.prototype.proxy;
  let providerCalls = 0;
  let releaseProvider!: () => void;
  let signalProviderStarted!: () => void;
  const providerGate = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const providerStarted = new Promise<void>((resolve) => {
    signalProviderStarted = resolve;
  });
  ReplitConnectors.prototype.proxy = async function () {
    providerCalls += 1;
    signalProviderStarted();
    await providerGate;
    return new Response(JSON.stringify({ id: "email_concurrent_1" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const winningRequest = request("/studio/contest-results/1/email", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }, true);
    await providerStarted;

    const losingResponse = await request("/studio/contest-results/1/email", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }, true);
    assert.equal(losingResponse.status, 409);
    assert.match((await losingResponse.json() as { error: string }).error, /already being emailed|already been sent/);
    assert.equal(providerCalls, 1);

    releaseProvider();
    const winningResponse = await winningRequest;
    assert.equal(winningResponse.status, 200);
    assert.equal((await winningResponse.json() as { emailDeliveryStatus: string }).emailDeliveryStatus, "sent");
    assert.equal(providerCalls, 1);
    assert.equal(getContestResultRowsForTest()[0].emailProviderId, "email_concurrent_1");
  } finally {
    releaseProvider();
    ReplitConnectors.prototype.proxy = originalProxy;
    delete process.env.CONTEST_RESULTS_EMAIL_TO;
    delete process.env.CONTEST_RESULTS_EMAIL_FROM;
  }
});

function signedWebhookRequest(body: unknown, options: {
  eventId?: string;
  timestamp?: number;
  secret?: string;
  signatureOverride?: string;
} = {}): Promise<Response> {
  const eventId = options.eventId ?? "evt_test_1";
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify(body);
  const secret = options.secret ?? process.env.RESEND_WEBHOOK_SECRET!;
  const digest = createHmac("sha256", Buffer.from(secret.slice("whsec_".length), "base64"))
    .update(`${eventId}.${timestamp}.${rawBody}`)
    .digest("base64");
  const signature = options.signatureOverride ?? `v1,${digest}`;
  return fetch(`${baseUrl}/webhooks/resend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": eventId,
      "svix-timestamp": String(timestamp),
      "svix-signature": signature,
    },
    body: rawBody,
  });
}

test("verified Resend events update owner-visible delivery status and ignore old duplicates", async () => {
  resetContestResultRows([{
    status: "cleared",
    emailDeliveryStatus: "sent",
    emailProviderId: "email_tracking_1",
  }]);
  const testSecret = `whsec_${Buffer.from("test webhook signing secret with enough bytes").toString("base64")}`;
  process.env.RESEND_WEBHOOK_SECRET = testSecret;
  try {
    const delivered = { type: "email.delivered", created_at: "2026-10-31T12:00:01.000Z", data: { email_id: "email_tracking_1" } };
    const deliveredResponse = await signedWebhookRequest(delivered, { eventId: "evt_delivered" });
    assert.equal(deliveredResponse.status, 204);
    const deliveredResults = await request("/studio/contest-results", {}, true);
    const [deliveredOwnerView] = (await deliveredResults.json() as { results: Array<{ emailDeliveryStatus: string }> }).results;
    assert.equal(deliveredOwnerView.emailDeliveryStatus, "delivered");

    const newer = { type: "email.bounced", created_at: "2026-10-31T12:00:02.000Z", data: { email_id: "email_tracking_1" } };
    const newerResponse = await signedWebhookRequest(newer, { eventId: "evt_newer" });
    assert.equal(newerResponse.status, 204);

    const older = { type: "email.delivered", created_at: "2026-10-31T12:00:01.000Z", data: { email_id: "email_tracking_1" } };
    const olderResponse = await signedWebhookRequest(older, { eventId: "evt_older" });
    assert.equal(olderResponse.status, 204);

    const results = await request("/studio/contest-results", {}, true);
    const [ownerVisible] = (await results.json() as { results: Array<{ emailDeliveryStatus: string }> }).results;
    const stored = getContestResultRowsForTest()[0];
    assert.equal(ownerVisible.emailDeliveryStatus, "bounced");
    assert.equal(stored.emailDeliveryStatus, "bounced");

    const complained = { type: "email.complained", created_at: "2026-10-31T12:00:03.000Z", data: { email_id: "email_tracking_1" } };
    const complainedResponse = await signedWebhookRequest(complained, { eventId: "evt_complained" });
    assert.equal(complainedResponse.status, 204);
    const finalResults = await request("/studio/contest-results", {}, true);
    const [finalOwnerView] = (await finalResults.json() as { results: Array<{ emailDeliveryStatus: string }> }).results;
    const finalStored = getContestResultRowsForTest()[0];
    assert.equal(finalOwnerView.emailDeliveryStatus, "complained");
    assert.equal(finalStored.emailLastWebhookEventId, "evt_complained");
    assert.equal(finalStored.emailLastWebhookAt?.toISOString(), "2026-10-31T12:00:03.000Z");
  } finally {
    delete process.env.RESEND_WEBHOOK_SECRET;
  }
});

test("forged, stale, and unknown-message webhook events cannot change delivery status", async () => {
  resetContestResultRows([{
    status: "cleared",
    emailDeliveryStatus: "delivered",
    emailProviderId: "email_tracking_1",
  }]);
  const testSecret = `whsec_${Buffer.from("test webhook signing secret with enough bytes").toString("base64")}`;
  process.env.RESEND_WEBHOOK_SECRET = testSecret;
  try {
    const event = { type: "email.complained", created_at: "2026-10-31T12:00:02.000Z", data: { email_id: "email_tracking_1" } };
    const forged = await signedWebhookRequest(event, { signatureOverride: "v1,Zm9yZ2Vk" });
    assert.equal(forged.status, 401);
    const stale = await signedWebhookRequest(event, { timestamp: Math.floor(Date.now() / 1000) - 301 });
    assert.equal(stale.status, 401);
    const unknown = await signedWebhookRequest({
      ...event,
      data: { email_id: "not-a-result-email" },
    });
    assert.equal(unknown.status, 404);

    const results = await request("/studio/contest-results", {}, true);
    const [stored] = (await results.json() as { results: Array<{ emailDeliveryStatus: string }> }).results;
    assert.equal(stored.emailDeliveryStatus, "delivered");
  } finally {
    delete process.env.RESEND_WEBHOOK_SECRET;
  }
});

test("a provider rejection is visible and can be retried", async () => {
  resetContestResultRows([{
    status: "cleared",
    clearanceNote: "Verified against both apps.",
    clearedAt: new Date("2026-10-02T12:00:00.000Z"),
  }]);
  process.env.CONTEST_RESULTS_EMAIL_TO = "results@example.test";
  process.env.CONTEST_RESULTS_EMAIL_FROM = "contest@example.test";
  const originalProxy = ReplitConnectors.prototype.proxy;
  let attempt = 0;
  ReplitConnectors.prototype.proxy = async function () {
    attempt += 1;
    return new Response(JSON.stringify({ error: "Provider detail must stay private." }), { status: 503 });
  };

  try {
    const response = await request("/studio/contest-results/1/email", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }, true);
    assert.equal(response.status, 502);
    assert.match((await response.json() as { error: string }).error, /email service rejected/);
    const results = await request("/studio/contest-results", {}, true);
    const [result] = (await results.json() as { results: Array<{ emailDeliveryStatus: string; emailDeliveryError: string | null }> }).results;
    assert.equal(result.emailDeliveryStatus, "failed");
    assert.match(result.emailDeliveryError ?? "", /email service rejected/);
    assert.doesNotMatch(result.emailDeliveryError ?? "", /Provider detail/);

    ReplitConnectors.prototype.proxy = async function () {
      attempt += 1;
      return new Response(JSON.stringify({ id: "email_retry" }), { status: 200 });
    };
    const retry = await request("/studio/contest-results/1/email", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }, true);
    assert.equal(retry.status, 200);
    assert.equal(attempt, 2);
  } finally {
    ReplitConnectors.prototype.proxy = originalProxy;
    delete process.env.CONTEST_RESULTS_EMAIL_TO;
    delete process.env.CONTEST_RESULTS_EMAIL_FROM;
  }
});

test("an accepted delivery with a lost response can be retried with the same idempotency key", async () => {
  resetContestResultRows([{
    status: "cleared",
    clearanceNote: "Verified against both apps.",
    clearedAt: new Date("2026-10-02T12:00:00.000Z"),
  }]);
  process.env.CONTEST_RESULTS_EMAIL_TO = "results@example.test";
  process.env.CONTEST_RESULTS_EMAIL_FROM = "contest@example.test";
  const originalProxy = ReplitConnectors.prototype.proxy;
  const idempotencyKeys: string[] = [];
  let attempt = 0;
  ReplitConnectors.prototype.proxy = async function (_connectorName, _path, options) {
    attempt += 1;
    idempotencyKeys.push(options?.headers?.["Idempotency-Key"] ?? "");
    if (attempt === 1) {
      // The provider accepted the message, but the client never received its response.
      throw new Error("Provider response timed out after acceptance.");
    }
    return new Response(JSON.stringify({ id: "email_accepted_once" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const timedOut = await request("/studio/contest-results/1/email", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }, true);
    assert.equal(timedOut.status, 502);
    assert.match((await timedOut.json() as { error: string }).error, /could not send this result/);

    const afterTimeout = await request("/studio/contest-results", {}, true);
    const [failedResult] = (await afterTimeout.json() as {
      results: Array<{ emailDeliveryStatus: string; emailDeliveryError: string | null }>;
    }).results;
    assert.equal(failedResult.emailDeliveryStatus, "failed");
    assert.match(failedResult.emailDeliveryError ?? "", /could not send this result/);
    assert.equal(getContestResultRowsForTest()[0].emailDeliveryStatus, "failed");

    const retry = await request("/studio/contest-results/1/email", {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    }, true);
    assert.equal(retry.status, 200);
    const retryBody = await retry.json() as {
      emailDeliveryStatus: string;
      emailSentAt: string | null;
    };
    assert.equal(retryBody.emailDeliveryStatus, "sent");
    assert.ok(Number.isFinite(Date.parse(retryBody.emailSentAt ?? "")));

    assert.deepEqual(idempotencyKeys, ["contest-result-1", "contest-result-1"]);
    assert.equal(attempt, 2);
    const saved = getContestResultRowsForTest()[0];
    assert.equal(saved.emailDeliveryStatus, "sent");
    assert.equal(saved.emailProviderId, "email_accepted_once");
    assert.equal(saved.emailDeliveryError, null);
  } finally {
    ReplitConnectors.prototype.proxy = originalProxy;
    delete process.env.CONTEST_RESULTS_EMAIL_TO;
    delete process.env.CONTEST_RESULTS_EMAIL_FROM;
  }
});
