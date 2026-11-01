import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { after, before, test } from "node:test";
import { chromium } from "playwright-core";

const recipient = "private-results@example.test";
const privateWinner = "PRIVATE OWNER-ONLY WINNER";
const fixture = {
  emailRecipient: recipient,
  emailSenderConfigured: true,
  ownerNotificationConfigured: true,
  results: [{
    id: 101,
    eventTitle: "PRIVATE OWNER-ONLY FINAL",
    division: "Private division",
    winnerName: privateWinner,
    winnerHandle: "@private",
    runnerUpName: "Private runner-up",
    winnerVotes: 20,
    runnerUpVotes: 7,
    coreScore: 91,
    base44Summary: "Private Base44 notes.",
    viralReelSummary: "Private Viral Reel notes.",
    status: "cleared",
    clearanceNote: "Private owner clearance.",
    createdAt: "2026-10-01T12:00:00.000Z",
    clearedAt: "2026-10-02T12:00:00.000Z",
    emailDeliveryStatus: "not_sent",
    emailSentAt: null,
    emailDeliveryError: null,
    history: [],
  }],
};

let browser;
let devServer;
let baseUrl;

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startDevServer() {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  devServer = spawn("pnpm", [
    "exec", "vite", "--config", "vite.config.ts", "--host", "127.0.0.1",
    "--port", String(port), "--strictPort",
  ], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), BASE_PATH: "/" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  devServer.stderr.setEncoding("utf8");
  devServer.stderr.on("data", (chunk) => { stderr += chunk; });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (devServer.exitCode !== null) {
      throw new Error(`Vite exited before becoming ready: ${stderr}`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The Vite listener is not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready within 30 seconds: ${stderr}`);
}

before(async () => {
  await startDevServer();
  const executablePath = process.env.CHROMIUM_PATH ??
    ["/repl/tools/bin/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser"]
      .find((path) => existsSync(path));
  if (!executablePath) {
    throw new Error("Chromium was not found. Set CHROMIUM_PATH to a Chromium executable.");
  }
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox"],
  });
}, { timeout: 60_000 });

after(async () => {
  await browser?.close();
  if (devServer && devServer.exitCode === null) {
    devServer.kill("SIGTERM");
    await new Promise((resolve) => devServer.once("exit", resolve));
  }
});

async function setupPage(page, sessionState) {
  const state = { authenticated: sessionState, resultsRequests: 0, sessionRequests: 0 };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/studio/session" && request.method() === "GET") {
      state.sessionRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ configured: true, authenticated: state.authenticated }),
      });
    }
    if (path === "/api/studio/session" && request.method() === "DELETE") {
      state.authenticated = false;
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === "/api/studio/contest-results" && request.method() === "GET") {
      state.resultsRequests += 1;
      return state.authenticated
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) })
        : route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ error: "Owner login required." }),
        });
    }
    return route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "No test fixture for this endpoint." }),
    });
  });
  return state;
}

async function expectPrivateResultsVisible(page) {
  await page.getByTestId("result-email-destination").waitFor();
  await page.getByTestId("result-record-101").waitFor();
  assert.match(await page.locator("body").innerText(), new RegExp(privateWinner));
  assert.match(await page.locator("body").innerText(), new RegExp(recipient.replaceAll(".", "\\.")));
}

async function expectPrivateResultsHidden(page) {
  await page.getByTestId("input-result-owner-password").waitFor();
  const visibleText = await page.locator("body").innerText();
  assert.doesNotMatch(visibleText, /PRIVATE OWNER-ONLY FINAL|PRIVATE OWNER-ONLY WINNER|Private Base44 notes|Private Viral Reel notes|private-results@example\.test/);
}

test("owner refund queue distinguishes normal processing from an unverified stale check", { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await setupPage(page, true);
    await page.route("**/api/studio/creator-refunds", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([false, true].map((statusCheckUnverified) => ({
        submissionId: statusCheckUnverified ? "stale-refund" : "recent-refund",
        creatorName: "Test Creator",
        moveName: "Test Move",
        priceUsd: 2,
        requestedAt: new Date().toISOString(),
        refundRequestStatus: "processing",
        statusCheckUnverified,
        statusCheckedAt: statusCheckUnverified ? new Date().toISOString() : null,
        notificationStatus: "not_sent",
      }))),
    }));
    await page.goto(`${baseUrl}/review`);
    const recent = page.getByTestId("refund-request-recent-refund");
    const stale = page.getByTestId("refund-request-stale-refund");
    await recent.waitFor();
    await stale.waitFor();
    const normalMessage = "Refund processing. Check the status again later if it remains pending.";
    const warningMessage = "This refund is taking longer than expected, and its status could not be verified. Keep the request open and retry the status check later.";
    assert.ok((await recent.innerText()).includes(normalMessage));
    assert.ok(!(await recent.innerText()).includes(warningMessage));
    assert.equal(await recent.getByRole("button", { name: "Check refund status", exact: true }).count(), 1);
    assert.equal(await recent.getByRole("button", { name: "Retry status check", exact: true }).count(), 0);
    assert.equal(await stale.getByRole("status").innerText(), warningMessage);
    assert.ok(!(await stale.innerText()).includes(normalMessage));
    assert.equal(await stale.getByRole("button", { name: "Retry status check", exact: true }).count(), 1);
    assert.equal(await stale.getByRole("button", { name: "Check refund status", exact: true }).count(), 0);
  } finally {
    await context.close();
  }
});

test("signing out hides and removes the cached recipient and private results", { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const state = await setupPage(page, true);
    await page.goto(`${baseUrl}/studio/results`);
    await expectPrivateResultsVisible(page);
    assert.equal(state.resultsRequests, 1);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expectPrivateResultsHidden(page);
    assert.equal(state.resultsRequests, 1, "results must not be fetched again after sign-out");

    await page.goto(baseUrl);
    await page.goBack();
    await expectPrivateResultsHidden(page);
    assert.equal(state.resultsRequests, 1, "browser history must not restore the signed-out result view");
  } finally {
    await context.close();
  }
});

test("an expired session hides and removes private results after the session check", { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.clock.install();
    const state = await setupPage(page, true);
    await page.goto(`${baseUrl}/studio/results`);
    await expectPrivateResultsVisible(page);

    state.authenticated = false;
    await page.clock.fastForward(60_001);
    await expectPrivateResultsHidden(page);
    assert.ok(state.sessionRequests >= 2, "the owner session must be rechecked while the page is open");
    assert.equal(state.resultsRequests, 1, "expired owner data must not be requested again");
  } finally {
    await context.close();
  }
});

test("public archive pages and unauthenticated result requests never expose the recipient", { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const state = await setupPage(page, false);
    await page.goto(baseUrl);
    await page.locator("body").waitFor();
    assert.doesNotMatch(await page.locator("body").innerText(), /private-results@example\.test/);
    assert.equal(state.resultsRequests, 0, "the public archive must not request owner-only results");

    const unauthenticated = await page.evaluate(async () => {
      const response = await fetch("/api/studio/contest-results");
      return { status: response.status, body: await response.text() };
    });
    assert.equal(unauthenticated.status, 401);
    assert.doesNotMatch(unauthenticated.body, /private-results@example\.test/);
  } finally {
    await context.close();
  }
});
