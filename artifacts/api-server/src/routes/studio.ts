import { createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import cookieParser from "cookie-parser";
import { Router, type IRouter, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, studioReelsTable } from "@workspace/db";
import {
  CreateStudioReelBody,
  CreateStudioReelResponse,
  CreateStudioSessionBody,
  CreateStudioSessionResponse,
  DeleteStudioSessionResponse,
  GetStudioReelVideoParams,
  GetStudioSessionResponse,
  GetStudioSettingsResponse,
  ListStudioReelsResponse,
} from "@workspace/api-zod";
import { reelVideoFile, saveReelVideo, verifyStorageAccess } from "../lib/studio-object-storage";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);
const MODEL = "google/veo-3.1-fast";
const COST_PER_OUTPUT_SECOND_USD = 0.15;
const COOKIE_NAME = "reel_studio_owner";
const COOKIE_TTL_SECONDS = 60 * 60 * 8;
const VALID_BRIEFS = {
  performance: {
    title: "Signature move performance",
    prompt:
      "Create a short, cinematic sports campaign film in vertical 9:16. Show one fictional, non-identifiable basketball player silhouette performing an original hesitation, change-of-direction, and explosive drive on an empty indoor court. No famous athlete likeness, logos, branded uniforms, team marks, or existing footage. Dramatic arena lighting, crisp footwork, realistic motion, tasteful camera movement, crowd ambience and subtle court sounds. End on a clean dark frame for a title overlay.",
  },
  "premium-card": {
    title: "Premium trading card",
    prompt:
      "Create a vertical 9:16 premium collectible sports-card reveal for a fictional athlete. An original card with abstract graphic details, metallic foil glints, sharp edge lighting, and no readable names, numbers, league marks, logos, or real athlete likeness. The card rotates slowly from a dark studio into a confident front-facing reveal. Elegant sound design with a soft foil shimmer.",
  },
  "card-showdown": {
    title: "Card-versus-card showdown",
    prompt:
      "Create a vertical 9:16 card-versus-card campaign moment with two original fictional sports cards facing each other across a dramatic center line. No famous athlete likenesses, logos, team marks, readable personal data, or league branding. The cards slide into frame, exchange a pulse of light, then settle side by side. Energetic but respectful, suggesting friendly community competition, not a purchase or wager.",
  },
  "enter-vote": {
    title: "How to enter and vote",
    prompt:
      "Create a vertical 9:16 social campaign visual for a community sports move contest. Show a fictional player submitting a move, then a clean voting moment represented by abstract cards and a simple ballot symbol; do not render legible text. Communicate that entering and voting are free, purchases never affect eligibility, votes, or winners, and the contest is open to the community. No logos or real athlete likenesses. Upbeat, welcoming native audio.",
  },
  "merch-tease": {
    title: "Planned merchandise collection",
    prompt:
      "Create a vertical 9:16 concept teaser for a planned sports-inspired merchandise collection: an unbranded hoodie, cap, and shirt with original abstract motion graphics, presented as future concepts only. No prices, checkout, shop buttons, logos, or claims that items are available. End with a clear visual pause suitable for adding a 'planned for Phase 2' title overlay. No real athlete likenesses.",
  },
} as const;

type ReelStatus = "starting" | "processing" | "succeeded" | "failed" | "aborted";
type SessionRequest = Request & { cookies?: Record<string, string> };

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
let providerCheck: { ready: boolean; checkedAt: number } | undefined;
let storageCheck: { ready: boolean; checkedAt: number } | undefined;

function hasReplicateToken(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN?.trim());
}

async function replicateRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) throw new Error("REPLICATE_API_TOKEN is not configured.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  return fetch(`https://api.replicate.com${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
}

function configured(): boolean {
  return Boolean(process.env.REEL_STUDIO_ADMIN_PASSWORD && process.env.SESSION_SECRET);
}

function signSession(payload: string): string {
  return createHmac(
    "sha256",
    `${process.env.SESSION_SECRET ?? ""}:${process.env.REEL_STUDIO_ADMIN_PASSWORD ?? ""}`,
  )
    .update(payload)
    .digest("base64url");
}

function isOwner(req: SessionRequest): boolean {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token || !process.env.SESSION_SECRET) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = signSession(payload);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: string; exp?: number };
    return session.role === "owner" && typeof session.exp === "number" && session.exp > Date.now();
  } catch {
    return false;
  }
}

function encodeReel(row: typeof studioReelsTable.$inferSelect) {
  return {
    id: row.id,
    briefId: row.briefId,
    title: row.title,
    status: row.status as ReelStatus,
    model: row.model,
    durationSeconds: row.durationSeconds,
    aspectRatio: row.aspectRatio,
    resolution: row.resolution,
    audioEnabled: row.audioEnabled,
    estimatedCostUsd: row.estimatedCostUsd,
    isTest: row.isTest,
    videoUrl: row.status === "succeeded" && row.objectPath ? `/api/studio/reels/${row.id}/video` : null,
    error: row.error,
    createdAt: row.createdAt,
  };
}

async function hasPassedTest(): Promise<boolean> {
  const [test] = await db
    .select({ id: studioReelsTable.id })
    .from(studioReelsTable)
    .where(and(eq(studioReelsTable.isTest, true), eq(studioReelsTable.status, "succeeded")))
    .limit(1);
  return Boolean(test);
}

async function providerIsReady(): Promise<boolean> {
  if (providerCheck && Date.now() - providerCheck.checkedAt < 30_000) return providerCheck.ready;
  if (!hasReplicateToken()) {
    providerCheck = { ready: false, checkedAt: Date.now() };
    return false;
  }
  try {
    const account = await replicateRequest("/v1/account", { method: "GET" });
    if (!account.ok) {
      providerCheck = { ready: false, checkedAt: Date.now() };
      return false;
    }
    const model = await replicateRequest(`/v1/models/${MODEL}`, { method: "GET" });
    providerCheck = { ready: model.ok, checkedAt: Date.now() };
  } catch {
    providerCheck = { ready: false, checkedAt: Date.now() };
  }
  return providerCheck.ready;
}

async function storageIsReady(req?: Request): Promise<boolean> {
  if (!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID || !process.env.PRIVATE_OBJECT_DIR) return false;
  if (storageCheck && Date.now() - storageCheck.checkedAt < 30_000) return storageCheck.ready;
  try {
    await verifyStorageAccess();
    storageCheck = { ready: true, checkedAt: Date.now() };
    return true;
  } catch (error) {
    req?.log.warn({ err: error }, "App Storage readiness probe failed");
    storageCheck = { ready: false, checkedAt: Date.now() };
    return false;
  }
}

async function refreshRun(row: typeof studioReelsTable.$inferSelect): Promise<typeof studioReelsTable.$inferSelect> {
  if (!row.predictionId || !["starting", "processing"].includes(row.status)) return row;
  try {
    const response = await replicateRequest(`/v1/predictions/${encodeURIComponent(row.predictionId)}`, { method: "GET" });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) providerCheck = { ready: false, checkedAt: Date.now() };
      const message = response.status === 401 || response.status === 403
        ? "Replicate rejected the server token; update REPLICATE_API_TOKEN in Secrets."
        : `Could not refresh the prediction (HTTP ${response.status}).`;
      const [updated] = await db.update(studioReelsTable)
        .set({ error: message })
        .where(eq(studioReelsTable.id, row.id))
        .returning();
      return updated ?? row;
    }
    const prediction = await response.json() as { status?: string; error?: string | null; output?: unknown };
    const nextStatus = prediction.status;
    if (nextStatus === "succeeded") {
      const outputUrl = typeof prediction.output === "string"
        ? prediction.output
        : Array.isArray(prediction.output) && typeof prediction.output[0] === "string"
          ? prediction.output[0]
          : null;
      if (!outputUrl || !outputUrl.startsWith("https://")) {
        const [failed] = await db.update(studioReelsTable).set({ status: "failed", error: "Replicate returned no downloadable video file." }).where(eq(studioReelsTable.id, row.id)).returning();
        return failed ?? row;
      }
      const download = await fetch(outputUrl, { signal: AbortSignal.timeout(90_000) });
      if (!download.ok) throw new Error(`Video download failed with status ${download.status}`);
      const announcedSize = Number(download.headers.get("content-length") ?? 0);
      if (announcedSize > 200 * 1024 * 1024) throw new Error("The generated video exceeds the 200 MB storage limit.");
      const bytes = Buffer.from(await download.arrayBuffer());
      if (bytes.byteLength < 16 || bytes.byteLength > 200 * 1024 * 1024 || bytes.toString("ascii", 4, 8) !== "ftyp") {
        throw new Error("The result was not a valid MP4 file.");
      }
      const tempName = `/tmp/studio-reel-${row.id}-${Date.now()}.mp4`;
      try {
        const { writeFile, unlink } = await import("node:fs/promises");
        await writeFile(tempName, bytes);
        const { stdout } = await execFileAsync("ffprobe", [
          "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
          "-of", "json", tempName,
        ], { timeout: 20_000, maxBuffer: 1024 * 1024 });
        const metadata = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> };
        const stream = metadata.streams?.[0];
        const width = stream?.width ?? 0;
        const height = stream?.height ?? 0;
        if (!width || !height || width >= height || Math.abs(width / height - 9 / 16) > 0.01) {
          throw new Error("The video is not a playable vertical 9:16 MP4.");
        }
        await saveReelVideo(row.id, bytes);
        const objectPath = `/objects/reel-studio/${row.id}.mp4`;
        const [saved] = await db.update(studioReelsTable)
          .set({ status: "succeeded", objectPath, error: null })
          .where(eq(studioReelsTable.id, row.id))
          .returning();
        return saved ?? row;
      } finally {
        const { unlink } = await import("node:fs/promises");
        await unlink(tempName).catch(() => undefined);
      }
    }
    if (nextStatus === "failed" || nextStatus === "aborted" || nextStatus === "canceled") {
      const status = nextStatus === "aborted" ? "aborted" : "failed";
      const [updated] = await db.update(studioReelsTable)
        .set({ status, error: typeof prediction.error === "string" ? prediction.error.slice(0, 500) : "The prediction did not complete." })
        .where(eq(studioReelsTable.id, row.id))
        .returning();
      return updated ?? row;
    }
    if (nextStatus === "starting" || nextStatus === "processing") {
      const [updated] = await db.update(studioReelsTable)
        .set({ status: nextStatus })
        .where(eq(studioReelsTable.id, row.id))
        .returning();
      return updated ?? row;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refresh the prediction.";
    const [updated] = await db.update(studioReelsTable)
      .set({ status: "failed", error: message.slice(0, 500) })
      .where(eq(studioReelsTable.id, row.id))
      .returning();
    return updated ?? row;
  }
  return row;
}

router.get("/studio/session", (req, res): void => {
  res.json(GetStudioSessionResponse.parse({ configured: configured(), authenticated: isOwner(req as SessionRequest) }));
});

router.post("/studio/session", (req, res): void => {
  const parsed = CreateStudioSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the studio password." });
    return;
  }
  if (!configured()) {
    res.status(503).json({ error: "Studio owner access is not configured." });
    return;
  }
  const now = Date.now();
  const key = req.ip ?? "unknown";
  const attempts = loginAttempts.get(key);
  if (attempts && attempts.resetAt > now && attempts.count >= 5) {
    res.status(429).json({ error: "Too many sign-in attempts. Try again in a minute." });
    return;
  }
  const password = process.env.REEL_STUDIO_ADMIN_PASSWORD ?? "";
  const actual = Buffer.from(parsed.data.password);
  const expected = Buffer.from(password);
  const matches = actual.length === expected.length && timingSafeEqual(actual, expected);
  if (!matches) {
    loginAttempts.set(key, attempts && attempts.resetAt > now
      ? { count: attempts.count + 1, resetAt: attempts.resetAt }
      : { count: 1, resetAt: now + 60_000 });
    res.status(401).json({ error: "That password did not match." });
    return;
  }
  loginAttempts.delete(key);
  const payload = Buffer.from(JSON.stringify({ role: "owner", exp: now + COOKIE_TTL_SECONDS * 1000 })).toString("base64url");
  res.cookie(COOKIE_NAME, `${payload}.${signSession(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_TTL_SECONDS * 1000,
    path: "/api/studio",
  });
  res.json(CreateStudioSessionResponse.parse({ configured: true, authenticated: true }));
});

router.delete("/studio/session", (_req, res): void => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/studio" });
  res.status(204).end();
  DeleteStudioSessionResponse.parse(undefined);
});

router.get("/studio/settings", async (req, res): Promise<void> => {
  const [firstTestPassed, storageReady, providerReady] = await Promise.all([
    hasPassedTest(),
    storageIsReady(req),
    providerIsReady(),
  ]);
  const canGenerate = configured() && storageReady && providerReady;
  const blockers = [
    !configured() ? "Set the studio owner password in Replit Secrets." : null,
    !providerReady
      ? hasReplicateToken()
        ? "Replicate authentication or model access failed; check REPLICATE_API_TOKEN."
        : "Add REPLICATE_API_TOKEN in Project Editor Tools → Secrets."
      : null,
    !storageReady ? "App Storage is not available to the API server." : null,
  ].filter((item): item is string => item !== null);
  const message = blockers.length ? blockers.join(" ") : "Owner access, Replicate, and durable video storage are ready.";
  res.json(GetStudioSettingsResponse.parse({
    model: MODEL,
    durationOptions: [4, 6, 8],
    aspectRatio: "9:16",
    resolution: "720p",
    audioEnabled: true,
    costPerSecondUsd: COST_PER_OUTPUT_SECOND_USD,
    storageReady,
    providerReady,
    firstTestPassed,
    canGenerate,
    message,
  }));
});

router.get("/studio/reels", async (_req, res): Promise<void> => {
  const runs = await db.select().from(studioReelsTable).orderBy(desc(studioReelsTable.createdAt));
  const refreshed = await Promise.all(runs.map(refreshRun));
  res.json(ListStudioReelsResponse.parse({
    reels: refreshed.map(encodeReel),
    firstTestPassed: refreshed.some((row) => row.isTest && row.status === "succeeded"),
  }));
});

router.post("/studio/reels", async (req, res): Promise<void> => {
  if (!isOwner(req as SessionRequest)) {
    res.status(401).json({ error: "Sign in as the studio owner before generating a reel." });
    return;
  }
  const parsed = CreateStudioReelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The selected reel settings are invalid." });
    return;
  }
  const input = parsed.data;
  const estimate = Number((input.durationSeconds * COST_PER_OUTPUT_SECOND_USD).toFixed(2));
  if (input.model !== MODEL || input.aspectRatio !== "9:16" || input.resolution !== "720p" ||
      input.audioEnabled !== true || input.confirmCost !== true ||
      Math.abs(input.estimatedCostUsd - estimate) > 0.001) {
    res.status(400).json({ error: "The approved model, output format, and estimate must match the current studio settings." });
    return;
  }
  const [providerReady, storageReady] = await Promise.all([providerIsReady(), storageIsReady(req)]);
  if (!providerReady || !storageReady) {
    res.status(503).json({ error: "Replicate and App Storage must both be ready before a paid run can start." });
    return;
  }
  const [testPassed] = await Promise.all([hasPassedTest()]);
  const isTest = !testPassed;
  if (isTest && (input.briefId !== "performance" || input.durationSeconds !== 4)) {
    res.status(400).json({ error: "The first approved run must be the 4-second signature-move test reel." });
    return;
  }
  if (!isTest && input.briefId === "performance") {
    res.status(400).json({ error: "The signature-move performance reel is already the approved test reel." });
    return;
  }
  const existingSuccessful = await db.select({ id: studioReelsTable.id })
    .from(studioReelsTable)
    .where(and(eq(studioReelsTable.briefId, input.briefId), eq(studioReelsTable.status, "succeeded")))
    .limit(1);
  if (existingSuccessful.length) {
    res.status(409).json({ error: "This reel has already been completed." });
    return;
  }
  const brief = VALID_BRIEFS[input.briefId];
  const [created] = await db.insert(studioReelsTable).values({
    briefId: input.briefId,
    title: brief.title,
    model: MODEL,
    status: "starting",
    durationSeconds: input.durationSeconds,
    aspectRatio: "9:16",
    resolution: "720p",
    audioEnabled: true,
    estimatedCostUsd: estimate,
    isTest,
  }).returning();
  try {
    const response = await replicateRequest(`/v1/models/${MODEL}/predictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: {
          prompt: brief.prompt,
          duration: input.durationSeconds,
          aspect_ratio: "9:16",
          resolution: "720p",
          generate_audio: true,
        },
      }),
    });
    if (!response.ok) {
      const safeMessage = response.status === 401 || response.status === 403
        ? "Replicate rejected the server token. Check REPLICATE_API_TOKEN in Secrets."
        : `Replicate could not start the run (HTTP ${response.status}).`;
      const [failed] = await db.update(studioReelsTable)
        .set({ status: "failed", error: safeMessage })
        .where(eq(studioReelsTable.id, created.id))
        .returning();
      res.status(503).json({ error: safeMessage });
      void failed;
      return;
    }
    const prediction = await response.json() as { id?: string; status?: string };
    if (!prediction.id) throw new Error("Replicate did not return a prediction ID.");
    const status = prediction.status === "processing" ? "processing" : "starting";
    const [updated] = await db.update(studioReelsTable)
      .set({ predictionId: prediction.id, status })
      .where(eq(studioReelsTable.id, created.id))
      .returning();
    res.status(201).json(CreateStudioReelResponse.parse(encodeReel(updated ?? created)));
  } catch (error) {
    const safeMessage = error instanceof Error ? error.message.slice(0, 500) : "Replicate could not start the run.";
    const [failed] = await db.update(studioReelsTable)
      .set({ status: "failed", error: safeMessage })
      .where(eq(studioReelsTable.id, created.id))
      .returning();
    res.status(503).json({ error: safeMessage });
    void failed;
  }
});

router.get("/studio/reels/:id/video", async (req, res): Promise<void> => {
  const params = GetStudioReelVideoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid reel ID." });
    return;
  }
  const [row] = await db.select().from(studioReelsTable).where(eq(studioReelsTable.id, params.data.id));
  if (!row || row.status !== "succeeded" || !row.objectPath) {
    res.status(404).json({ error: "Reel video is not available." });
    return;
  }
  try {
    const file = reelVideoFile(row.id);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    const range = req.headers.range;
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (range && size > 0) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.status(416).end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start > end || start >= size) {
        res.status(416).end();
        return;
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", String(end - start + 1));
      file.createReadStream({ start, end }).pipe(res);
      return;
    }
    if (size) res.setHeader("Content-Length", String(size));
    file.createReadStream().pipe(res);
  } catch (error) {
    req.log.error({ err: error, reelId: params.data.id }, "Unable to stream stored reel");
    res.status(500).json({ error: "Unable to stream the stored reel." });
  }
});

export default router;
