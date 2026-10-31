import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import cookieParser from "cookie-parser";
import express, { type Request } from "express";
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
      value: { info: () => undefined },
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

test("unauthenticated requests cannot list, create, or clear contest results", async () => {
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

  assert.deepEqual([list.status, create.status, clearResult.status], [401, 401, 401]);
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
