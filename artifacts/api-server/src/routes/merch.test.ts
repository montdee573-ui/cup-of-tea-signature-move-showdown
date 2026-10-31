import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import cookieParser from "cookie-parser";
import express, { type Request } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import merchRouter from "./merch";

const SESSION_SECRET = "test-session-secret";
const ADMIN_PASSWORD = "test-owner-password";
const calls: Array<{ connector: string; path: string; method: string }> = [];
const app = express();
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
const originalProxy = ReplitConnectors.prototype.proxy;

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

function printfulResponse(path: string, method: string): Response {
  if (path === "/products/42" && method === "GET") {
    return Response.json({
      result: {
        product: { id: 42, title: "Test product" },
        variants: [{ id: 7, name: "Black / M", color: "Black", size: "M" }],
      },
    });
  }
  if (path === "/mockup-generator/printfiles/42" && method === "GET") {
    return Response.json({ result: { available_placements: { front: "Front", back: "Back" } } });
  }
  if (path === "/mockup-generator/create-task/42" && method === "POST") {
    return Response.json({ result: { task_key: "task_123", status: "pending" } });
  }
  if (path === "/mockup-generator/task?task_key=task_123" && method === "GET") {
    return Response.json({
      result: {
        status: "completed",
        error: null,
        mockups: [
          {
            display_name: "Front preview",
            placement: "front",
            variant_ids: [7],
            mockup_url: "https://images.example.test/front.png",
            extra: [
              { title: "Back preview", url: "https://images.example.test/back.png" },
              { title: "Local host", url: "https://localhost/private.png" },
              { title: "Plain HTTP", url: "http://images.example.test/unsafe.png" },
              { title: "IP address", url: "https://192.168.1.1/private.png" },
              { title: "Credentials", url: "https://user:secret@images.example.test/private.png" },
            ],
            source_file: "private-artwork.png",
          },
        ],
      },
    });
  }
  return Response.json({ error: `Unexpected Printful request: ${method} ${path}` }, { status: 500 });
}

before(async () => {
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.REEL_STUDIO_ADMIN_PASSWORD = ADMIN_PASSWORD;
  ReplitConnectors.prototype.proxy = async function proxy(connector, path, options = {}) {
    const method = options.method ?? "GET";
    calls.push({ connector, path, method });
    return printfulResponse(path, method);
  };

  app.use(express.json());
  app.use(cookieParser());
  app.use((req: Request, _res, next) => {
    Object.defineProperty(req, "log", {
      value: {
        warn: () => undefined,
        error: () => undefined,
      },
    });
    next();
  });
  app.use(merchRouter);

  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  calls.length = 0;
});

after(async () => {
  ReplitConnectors.prototype.proxy = originalProxy;
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

test("private product details, task creation, and task retrieval require owner access", async () => {
  const operations = [
    request("/merch/catalog/42/details"),
    request("/merch/catalog/42/mockups", {
      method: "POST",
      body: JSON.stringify({ variantIds: [7], placements: ["front"], artworkUrl: "https://images.example/art.png" }),
    }),
    request("/merch/mockups/task_123"),
  ];

  for (const response of await Promise.all(operations)) {
    assert.equal(response.status, 401);
  }
  assert.deepEqual(calls, []);
});

test("malformed product IDs and task keys are rejected before provider requests", async () => {
  const invalidProduct = await request("/merch/catalog/not-a-number/details", {}, true);
  const invalidTaskKey = await request("/merch/mockups/bad%24key", {}, true);
  const overlongTaskKey = await request(`/merch/mockups/${"a".repeat(101)}`, {}, true);

  assert.equal(invalidProduct.status, 400);
  assert.equal(invalidTaskKey.status, 400);
  assert.equal(overlongTaskKey.status, 400);
  assert.deepEqual(calls, []);
});

test("artwork URLs must be public HTTPS URLs without local hosts or credentials", async () => {
  const invalidUrls = [
    "http://images.example.test/art.png",
    "https://localhost/private.png",
    "https://192.168.1.1/private.png",
    "https://user:secret@images.example.test/art.png",
  ];
  for (const artworkUrl of invalidUrls) {
    const response = await request("/merch/catalog/42/mockups", {
      method: "POST",
      body: JSON.stringify({ variantIds: [7], placements: ["front"], artworkUrl }),
    }, true);
    assert.equal(response.status, 400, artworkUrl);
  }
  assert.deepEqual(calls, []);
});

test("unavailable and duplicate variants or placements never create a task", async () => {
  const invalidBodies = [
    { variantIds: [999], placements: ["front"], artworkUrl: "https://images.example.test/art.png" },
    { variantIds: [7, 7], placements: ["front"], artworkUrl: "https://images.example.test/art.png" },
    { variantIds: [7], placements: ["unknown"], artworkUrl: "https://images.example.test/art.png" },
    { variantIds: [7], placements: ["front", "front"], artworkUrl: "https://images.example.test/art.png" },
  ];

  for (const body of invalidBodies) {
    const response = await request("/merch/catalog/42/mockups", {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
    assert.equal(response.status, 400);
  }
  assert.equal(calls.filter(({ path, method }) => method === "POST" || path.includes("create-task")).length, 0);
});

test("successful generation creates only a temporary mockup task", async () => {
  const response = await request("/merch/catalog/42/mockups", {
    method: "POST",
    body: JSON.stringify({
      variantIds: [7],
      placements: ["front"],
      artworkUrl: "https://images.example.test/art.png",
    }),
  }, true);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    taskKey: "task_123",
    status: "pending",
    productId: 42,
    variantIds: [7],
    placements: ["front"],
  });
  assert.deepEqual(calls.map(({ path, method }) => [method, path]), [
    ["GET", "/products/42"],
    ["GET", "/mockup-generator/printfiles/42"],
    ["POST", "/mockup-generator/create-task/42"],
  ]);
  assert.equal(
    calls.some(({ path, method }) => method === "POST" && (/^\/products(?:\/|$)/.test(path) || /^\/orders(?:\/|$)/.test(path))),
    false,
  );
});

test("task results include only safe HTTPS previews and no raw Printful fields", async () => {
  const response = await request("/merch/mockups/task_123", {}, true);
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, unknown>;

  assert.deepEqual(Object.keys(body).sort(), ["error", "mockups", "status", "taskKey"]);
  assert.deepEqual(body.mockups, [
    {
      title: "Front preview",
      placement: "front",
      variantIds: [7],
      imageUrl: "https://images.example.test/front.png",
    },
    {
      title: "Back preview",
      placement: "front",
      variantIds: [7],
      imageUrl: "https://images.example.test/back.png",
    },
  ]);
  assert.equal(JSON.stringify(body).includes("private-artwork.png"), false);
  assert.deepEqual(calls.map(({ path, method }) => [method, path]), [
    ["GET", "/mockup-generator/task?task_key=task_123"],
  ]);
});
