import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import cookieParser from "cookie-parser";
import express, { type Request } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import merchRouter from "./merch";

const SESSION_SECRET = "test-session-secret";
const ADMIN_PASSWORD = "test-owner-password";
const calls: Array<{ connector: string; path: string; method: string; body?: string }> = [];
const app = express();
let server: ReturnType<typeof app.listen>;
let baseUrl: string;
const originalProxy = ReplitConnectors.prototype.proxy;

function sessionCookie(role: string, exp: number): string {
  const payload = Buffer.from(JSON.stringify({
    role,
    exp,
  })).toString("base64url");
  const signature = createHmac("sha256", `${SESSION_SECRET}:${ADMIN_PASSWORD}`)
    .update(payload)
    .digest("base64url");
  return `reel_studio_owner=${payload}.${signature}`;
}

function ownerCookie(): string {
  return sessionCookie("owner", Date.now() + 60_000);
}

function tamperedOwnerCookie(): string {
  return ownerCookie().replace(/\.[^.]+$/, ".invalid");
}

function printfulResponse(path: string, method: string): Response {
  if (path === "/products/42" && method === "GET") {
    return Response.json({
      result: {
        product: { id: 42, title: "Test product" },
        variants: Array.from({ length: 41 }, (_, index) => ({
          id: index + 7,
          name: index === 0 ? "Black / M" : index === 1 ? "White / L" : `Variant ${index + 1}`,
          color: index === 0 ? "Black" : "White",
          size: index === 0 ? "M" : "L",
        })),
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
            display_name: "Front view",
            placement: "front",
            variant_ids: [7],
            mockup_url: "https://images.example.test/front.png",
            extra: [
              { title: "Front detail", url: "https://images.example.test/front-detail.png" },
              { title: "Local host", url: "https://localhost/private.png" },
              { title: "Plain HTTP", url: "http://images.example.test/unsafe.png" },
              { title: "IP address", url: "https://192.168.1.1/private.png" },
              { title: "Credentials", url: "https://user:secret@images.example.test/private.png" },
            ],
            source_file: "private-artwork.png",
          },
          {
            display_name: "Back view",
            placement: "back",
            variant_ids: [7],
            mockup_url: "https://images.example.test/back.png",
          },
          {
            display_name: "Front view",
            placement: "front",
            variant_ids: [8],
            mockup_url: "https://images.example.test/white-front.png",
          },
          {
            display_name: "Back view",
            placement: "back",
            variant_ids: [8],
            mockup_url: "https://images.example.test/white-back.png",
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
    calls.push({
      connector,
      path,
      method,
      ...(typeof options.body === "string" ? { body: options.body } : {}),
    });
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

test("expired owner sessions are rejected before private mockup requests", async () => {
  const expiredCookie = sessionCookie("owner", Date.now() - 1);
  const operations: Array<{ path: string; init?: RequestInit }> = [
    { path: "/merch/catalog/42/details" },
    {
      path: "/merch/catalog/42/mockups",
      init: {
        method: "POST",
        body: JSON.stringify({ variantIds: [7], placements: ["front"], artworkUrl: "https://images.example/art.png" }),
      },
    },
    { path: "/merch/mockups/task_123" },
  ];

  for (const { path, init } of operations) {
    const headers = new Headers(init?.headers);
    headers.set("Cookie", expiredCookie);
    const response = await request(path, { ...init, headers });
    assert.equal(response.status, 401, path);
  }
  assert.deepEqual(calls, []);
});

test("modified signatures and non-owner sessions are rejected before private mockup requests", async () => {
  const invalidCookies = [
    tamperedOwnerCookie(),
    sessionCookie("participant", Date.now() + 60_000),
  ];
  const operations: Array<{ path: string; init?: RequestInit }> = [
    { path: "/merch/catalog/42/details" },
    {
      path: "/merch/catalog/42/mockups",
      init: {
        method: "POST",
        body: JSON.stringify({ variantIds: [7], placements: ["front"], artworkUrl: "https://images.example/art.png" }),
      },
    },
    { path: "/merch/mockups/task_123" },
  ];

  for (const cookie of invalidCookies) {
    for (const { path, init } of operations) {
      const headers = new Headers(init?.headers);
      headers.set("Cookie", cookie);
      const response = await request(path, { ...init, headers });
      assert.equal(response.status, 401, path);
    }
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

test("invalid and duplicate variants or placements never create a task", async () => {
  const invalidBodies = [
    { variantIds: [999], placements: ["front"], artworkUrl: "https://images.example.test/art.png" },
    { variantIds: [7, 999], placements: ["front"], artworkUrl: "https://images.example.test/art.png" },
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

test("allows exactly 40 variant-placement combinations and rejects more", async () => {
  const exactlyFortyVariantIds = Array.from({ length: 20 }, (_, index) => index + 7);
  const allowed = await request("/merch/catalog/42/mockups", {
    method: "POST",
    body: JSON.stringify({
      variantIds: exactlyFortyVariantIds,
      placements: ["front", "back"],
      artworkUrl: "https://images.example.test/art.png",
    }),
  }, true);

  assert.equal(allowed.status, 200);
  const creationCall = calls.find(({ method, path }) => method === "POST" && path.includes("create-task"));
  assert(creationCall?.body);
  assert.deepEqual(JSON.parse(creationCall.body), {
    variant_ids: exactlyFortyVariantIds,
    files: [
      { placement: "front", image_url: "https://images.example.test/art.png" },
      { placement: "back", image_url: "https://images.example.test/art.png" },
    ],
    format: "png",
    width: 1200,
  });

  calls.length = 0;
  const overForty = await request("/merch/catalog/42/mockups", {
    method: "POST",
    body: JSON.stringify({
      variantIds: Array.from({ length: 21 }, (_, index) => index + 7),
      placements: ["front", "back"],
      artworkUrl: "https://images.example.test/art.png",
    }),
  }, true);

  assert.equal(overForty.status, 400);
  assert.equal(calls.some(({ method, path }) => method === "POST" || path.includes("create-task")), false);
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
  assert.equal(calls.some(({ path }) => /^\/(?:orders|checkout|sales)(?:\/|$)/.test(path)), false);
  assert.equal(calls.some(({ path, method }) => method === "POST" && /^\/products(?:\/|$)/.test(path)), false);
  assert.equal(calls.filter(({ method }) => method === "POST").length, 1);
  assert.equal(calls.find(({ method }) => method === "POST")?.path, "/mockup-generator/create-task/42");
});

test("task results preserve variant-placement combinations and only return safe preview fields", async () => {
  const response = await request("/merch/mockups/task_123", {}, true);
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, unknown>;

  assert.deepEqual(Object.keys(body).sort(), ["error", "mockups", "status", "taskKey"]);
  assert.deepEqual(body.mockups, [
    {
      title: "Front view",
      placement: "front",
      variantIds: [7],
      imageUrl: "https://images.example.test/front.png",
    },
    {
      title: "Front detail",
      placement: "front",
      variantIds: [7],
      imageUrl: "https://images.example.test/front-detail.png",
    },
    {
      title: "Back view",
      placement: "back",
      variantIds: [7],
      imageUrl: "https://images.example.test/back.png",
    },
    {
      title: "Front view",
      placement: "front",
      variantIds: [8],
      imageUrl: "https://images.example.test/white-front.png",
    },
    {
      title: "Back view",
      placement: "back",
      variantIds: [8],
      imageUrl: "https://images.example.test/white-back.png",
    },
  ]);
  const returnedGroups = (body.mockups as Array<{ placement: string; variantIds: number[] }>)
    .map(({ variantIds, placement }) => `${variantIds.join(",")}|${placement}`);
  assert.deepEqual([...new Set(returnedGroups)], ["7|front", "7|back", "8|front", "8|back"]);
  assert.equal(JSON.stringify(body).includes("private-artwork.png"), false);
  assert.deepEqual(calls.map(({ path, method }) => [method, path]), [
    ["GET", "/mockup-generator/task?task_key=task_123"],
  ]);
  assert.equal(calls.some(({ path }) => /^\/(?:products|orders|checkout|sales)(?:\/|$)/.test(path)), false);
});
