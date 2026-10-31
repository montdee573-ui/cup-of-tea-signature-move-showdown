import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import cookieParser from "cookie-parser";
import express, { type Request } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import contestResultsRouter from "./contest-results";
import { resetContestResultRows } from "./contest-results-test-db";

const SESSION_SECRET = "contest-results-test-session-secret";
const ADMIN_PASSWORD = "contest-results-test-owner-password";
const app = express();
let server: ReturnType<typeof app.listen>;
let baseUrl: string;

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

  app.use(express.json());
  app.use(cookieParser());
  app.use((req: Request, _res, next) => {
    Object.defineProperty(req, "log", {
      value: { info: () => undefined, warn: () => undefined },
    });
    next();
  });
  app.use(contestResultsRouter);

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
  assert.deepEqual(await results.json(), []);
});

test("a tied or trailing vote count cannot be cleared", async () => {
  for (const [winnerVotes, runnerUpVotes] of [[5, 5], [4, 5]]) {
    resetContestResultRows([{ winnerVotes, runnerUpVotes }]);
    const response = await clear();
    assert.equal(response.status, 409);
    assert.match((await response.json() as { error: string }).error, /tied or trailing/);
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

test("a draft cannot be emailed, even when the owner confirms", async () => {
  resetContestResultRows([{ status: "draft" }]);

  const response = await request("/studio/contest-results/1/email", {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  }, true);

  assert.equal(response.status, 409);
  assert.match((await response.json() as { error: string }).error, /Only an owner-cleared final/);
  const results = await request("/studio/contest-results", {}, true);
  assert.equal((await results.json() as Array<{ emailDeliveryStatus: string }>)[0].emailDeliveryStatus, "not_sent");
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
  assert.match((await response.json() as { error: string }).error, /recipient and sender/);
  const results = await request("/studio/contest-results", {}, true);
  const [result] = await results.json() as Array<{ emailDeliveryStatus: string; emailDeliveryError: string | null }>;
  assert.equal(result.emailDeliveryStatus, "failed");
  assert.match(result.emailDeliveryError ?? "", /not configured/);
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
    assert.equal(sentRequest?.connectorName, "resend");
    assert.equal(sentRequest?.path, "/emails");
    assert.equal(sentRequest?.options?.method, "POST");
    assert.equal(sentRequest?.options?.headers?.["Idempotency-Key"], "contest-result-1");
    const mail = sentRequest?.options?.body as { to: string; from: string; text: string };
    assert.equal(mail.to, "results@example.test");
    assert.equal(mail.from, "contest@example.test");
    assert.match(mail.text, /Vote winner: Winner/);

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
    const [result] = await results.json() as Array<{ emailDeliveryStatus: string; emailDeliveryError: string | null }>;
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
