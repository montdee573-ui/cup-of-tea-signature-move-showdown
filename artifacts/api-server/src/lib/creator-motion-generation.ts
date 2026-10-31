import { createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";
import { creatorMotionOrdersTable, db } from "@workspace/db";
import { creatorMotionVideoFile, saveCreatorMotionVideo } from "./studio-object-storage";

const execFileAsync = promisify(execFile);
const MODEL = "google/veo-3.1-fast";
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const GENERATION_TIMEOUT_MS = 20 * 60 * 1000;
type MotionOrder = typeof creatorMotionOrdersTable.$inferSelect;
type Submission = {
  id: string;
  sport: string;
  moveName: string;
};

export type GenerationStatus = "not_started" | "starting" | "processing" | "succeeded" | "failed";

export function creatorMotionOffer() {
  const priceUsd = Number(process.env.CREATOR_MOTION_PRICE_USD);
  const approved = process.env.CREATOR_MOTION_SALES_APPROVED === "true"
    && process.env.CREATOR_MOTION_PAYMENT_PROVIDER === "whop"
    && Number.isFinite(priceUsd)
    && priceUsd >= 0.01
    && priceUsd <= 500
    && Math.round(priceUsd * 100) === priceUsd * 100
    && /^biz_[A-Za-z0-9]+$/.test(process.env.WHOP_COMPANY_ID ?? "")
    && /^plan_[A-Za-z0-9]+$/.test(process.env.WHOP_PLAN_ID ?? "")
    && Boolean(process.env.REPLICATE_API_TOKEN?.trim())
    && Boolean(process.env.SESSION_SECRET)
    && Boolean(process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID && process.env.PRIVATE_OBJECT_DIR);
  return { available: approved, priceUsd: approved ? priceUsd : null };
}

export function creatorMotionVideoUrl(submissionId: string): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const expires = Math.floor(Date.now() / 1000) + 5 * 60;
  const signature = createHmac("sha256", secret)
    .update(`${submissionId}:${expires}`)
    .digest("base64url");
  return `/api/creator-cards/${encodeURIComponent(submissionId)}/motion/video?expires=${expires}&signature=${signature}`;
}

export function verifyCreatorMotionVideoTicket(submissionId: string, expiresValue: string, signature: string): boolean {
  const expires = Number(expiresValue);
  const secret = process.env.SESSION_SECRET;
  if (!secret || !Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000) ||
      expires > Math.floor(Date.now() / 1000) + 6 * 60 || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret)
    .update(`${submissionId}:${expires}`)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function updateGeneration(
  submissionId: string,
  values: Partial<typeof creatorMotionOrdersTable.$inferInsert>,
): Promise<MotionOrder | null> {
  const [updated] = await db.update(creatorMotionOrdersTable)
    .set(values)
    .where(eq(creatorMotionOrdersTable.submissionId, submissionId))
    .returning();
  return updated ?? null;
}

async function failGeneration(submissionId: string, error: unknown): Promise<MotionOrder | null> {
  const message = error instanceof Error ? error.message : "The reel could not be completed.";
  return updateGeneration(submissionId, {
    generationStatus: "failed",
    generationError: message.slice(0, 500),
  });
}

async function replicateRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) throw new Error("Video generation is not configured.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  return fetch(`https://api.replicate.com${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
}

export async function startCreatorMotionGeneration(
  submission: Submission,
): Promise<MotionOrder | null> {
  const [claimed] = await db.update(creatorMotionOrdersTable)
    .set({
      generationStatus: "starting",
      generationStartedAt: new Date(),
      generationError: null,
      generationPredictionId: null,
      generationObjectPath: null,
    })
    .where(and(
      eq(creatorMotionOrdersTable.submissionId, submission.id),
      eq(creatorMotionOrdersTable.status, "paid"),
      eq(creatorMotionOrdersTable.generationStatus, "not_started"),
    ))
    .returning();
  if (!claimed) return null;

  const sport = submission.sport.replace(/[\u0000-\u001f\u007f"\\]/g, "").slice(0, 50) || "sports";
  const moveName = submission.moveName.replace(/[\u0000-\u001f\u007f"\\]/g, "").slice(0, 60) || "an original move";
  const prompt = [
    `Create a four-second cinematic sports highlight in vertical 9:16, inspired by an original ${sport} move called "${moveName}".`,
    "Show one fictional, non-identifiable athlete silhouette performing an expressive version of the move on an empty sports surface.",
    "Use realistic athletic motion, clear footwork, crisp camera movement, dramatic but tasteful lighting, and subtle native ambience.",
    "Do not show a real person's likeness, names, readable text, logos, team marks, branded uniforms, or existing footage.",
    "End on a clean frame suitable for a personal creator reel.",
  ].join(" ");
  try {
    const response = await replicateRequest(`/v1/models/${MODEL}/predictions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: {
          prompt,
          duration: 4,
          aspect_ratio: "9:16",
          resolution: "720p",
          generate_audio: true,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`The video provider could not start the reel (HTTP ${response.status}).`);
    }
    const prediction = await response.json() as { id?: string; status?: string };
    if (!prediction.id) throw new Error("The video provider returned no generation ID.");
    return updateGeneration(submission.id, {
      generationPredictionId: prediction.id,
      generationStatus: prediction.status === "processing" ? "processing" : "starting",
      generationError: null,
    });
  } catch (error) {
    return failGeneration(submission.id, error);
  }
}

export async function refreshCreatorMotionGeneration(order: MotionOrder): Promise<MotionOrder> {
  if (!["starting", "processing"].includes(order.generationStatus) || !order.generationPredictionId) return order;
  if (order.generationStartedAt && Date.now() - order.generationStartedAt.getTime() > GENERATION_TIMEOUT_MS) {
    return (await failGeneration(order.submissionId, new Error("Generation timed out. You can retry without paying again."))) ?? order;
  }
  try {
    const response = await replicateRequest(`/v1/predictions/${encodeURIComponent(order.generationPredictionId)}`, { method: "GET" });
    if (!response.ok) throw new Error(`Could not check reel generation (HTTP ${response.status}).`);
    const prediction = await response.json() as { status?: string; error?: string | null; output?: unknown };
    if (prediction.status === "failed" || prediction.status === "aborted" || prediction.status === "canceled") {
      return (await failGeneration(order.submissionId, prediction.error || "Generation did not complete. You can retry without paying again.")) ?? order;
    }
    if (prediction.status === "starting" || prediction.status === "processing") {
      const [updated] = await db.update(creatorMotionOrdersTable)
        .set({ generationStatus: prediction.status })
        .where(eq(creatorMotionOrdersTable.submissionId, order.submissionId))
        .returning();
      return updated ?? order;
    }
    if (prediction.status !== "succeeded") return order;

    const outputUrl = typeof prediction.output === "string"
      ? prediction.output
      : Array.isArray(prediction.output) && typeof prediction.output[0] === "string"
        ? prediction.output[0]
        : null;
    if (!outputUrl || !outputUrl.startsWith("https://")) throw new Error("The provider returned no downloadable reel.");
    const download = await fetch(outputUrl, { signal: AbortSignal.timeout(90_000) });
    if (!download.ok) throw new Error(`The generated reel could not be downloaded (HTTP ${download.status}).`);
    const announcedSize = Number(download.headers.get("content-length") ?? 0);
    if (announcedSize > MAX_VIDEO_BYTES) throw new Error("The generated reel exceeds the storage limit.");
    const bytes = Buffer.from(await download.arrayBuffer());
    if (bytes.byteLength < 16 || bytes.byteLength > MAX_VIDEO_BYTES || bytes.toString("ascii", 4, 8) !== "ftyp") {
      throw new Error("The provider result is not a valid MP4.");
    }
    const tempName = `/tmp/creator-motion-${order.id}-${Date.now()}.mp4`;
    try {
      const { writeFile, unlink } = await import("node:fs/promises");
      await writeFile(tempName, bytes);
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error", "-show_entries", "format=duration", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", tempName,
      ], { timeout: 20_000, maxBuffer: 1024 * 1024 });
      const metadata = JSON.parse(stdout) as {
        streams?: Array<{ width?: number; height?: number }>;
        format?: { duration?: string };
      };
      const stream = metadata.streams?.[0];
      const duration = Number(metadata.format?.duration ?? 0);
      if (!stream?.width || !stream.height || stream.width >= stream.height ||
          Math.abs(stream.width / stream.height - 9 / 16) > 0.01 || duration < 2 || duration > 6) {
        throw new Error("The result was not a playable four-second vertical reel.");
      }
      const objectPath = await saveCreatorMotionVideo(order.submissionId, bytes);
      return (await updateGeneration(order.submissionId, {
        generationStatus: "succeeded",
        generationObjectPath: objectPath,
        generationError: null,
      })) ?? order;
    } finally {
      const { unlink } = await import("node:fs/promises");
      await unlink(tempName).catch(() => undefined);
    }
  } catch (error) {
    return (await failGeneration(order.submissionId, error)) ?? order;
  }
}

export async function creatorMotionFileExists(submissionId: string): Promise<boolean> {
  try {
    const [metadata] = await creatorMotionVideoFile(submissionId).getMetadata();
    return Number(metadata.size ?? 0) > 0;
  } catch {
    return false;
  }
}
