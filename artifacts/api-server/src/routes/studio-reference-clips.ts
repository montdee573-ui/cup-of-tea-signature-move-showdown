import { randomUUID } from "node:crypto";
import express, { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { desc, eq } from "drizzle-orm";
import { db, studioReferenceClipsTable } from "@workspace/db";
import {
  DeleteStudioReferenceClipParams,
  ListStudioReferenceClipsQueryParams,
  ListStudioReferenceClipsResponse,
  UploadStudioReferenceClipHeader,
  UploadStudioReferenceClipResponse,
} from "@workspace/api-zod";
import { z } from "zod";
import { isStudioOwner } from "./studio";
import {
  deleteStudioReferenceClip,
  saveStudioReferenceClip,
  studioReferenceClipFile,
} from "../lib/studio-object-storage";

const router: IRouter = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  next();
});
const MAX_REFERENCE_CLIP_BYTES = 5 * 1024 * 1024;
const supportedContentTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const metadataSchema = z.object({
  title: z.string().trim().min(1).max(120),
  athleteName: z.string().trim().min(1).max(100),
  sport: z.string().trim().min(1).max(50),
  era: z.enum(["Classic", "Current"]),
  team: z.string().trim().max(100),
  sourceType: z.enum(["official", "user_clip"]),
  sourceLabel: z.string().trim().min(1).max(180),
  sourceUrl: z.string().url().nullable(),
  permissionConfirmed: z.literal(true),
});

function parseMetadata(req: Request) {
  const header = req.get("X-Reference-Clip-Metadata");
  if (!header || header.length > 4096) return null;
  try {
    const parsed = metadataSchema.safeParse(JSON.parse(Buffer.from(header, "base64url").toString("utf8")));
    if (!parsed.success || (parsed.data.sourceUrl && !parsed.data.sourceUrl.startsWith("https://"))) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function validVideoSignature(bytes: Buffer, contentType: string): boolean {
  if (contentType === "video/webm") return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
}

const videoBodyParser = express.raw({ type: () => true, limit: MAX_REFERENCE_CLIP_BYTES });

function parseVideoBody(req: Request, res: Response, next: NextFunction): void {
  videoBodyParser(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }
    const bodyError = error as { type?: string };
    if (bodyError.type === "entity.too.large") {
      res.status(413).json({ error: "Choose a reference clip that is 5 MB or smaller." });
      return;
    }
    req.log.warn({ err: error }, "Unable to read owner reference clip");
    res.status(400).json({ error: "The reference clip could not be read." });
  });
}

router.get("/studio/reference-clips", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const query = ListStudioReferenceClipsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Search text is invalid." });
    return;
  }
  const clips = await db.select().from(studioReferenceClipsTable).orderBy(desc(studioReferenceClipsTable.createdAt));
  const search = query.data.search?.trim().toLocaleLowerCase();
  const filtered = search
    ? clips.filter((clip) => `${clip.title} ${clip.athleteName} ${clip.sport} ${clip.team} ${clip.sourceLabel}`.toLocaleLowerCase().includes(search))
    : clips;
  res.json(ListStudioReferenceClipsResponse.parse(filtered));
});

router.post("/studio/reference-clips", (req, res, next) => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  parseVideoBody(req, res, next);
}, async (req, res): Promise<void> => {
  const header = UploadStudioReferenceClipHeader.safeParse({
    "X-Reference-Clip-Metadata": req.get("X-Reference-Clip-Metadata"),
  });
  const metadata = parseMetadata(req);
  const contentType = (req.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!header.success || !metadata || !supportedContentTypes.has(contentType)) {
    res.status(400).json({ error: "Provide valid clip details, confirmed rights, and an MP4, MOV, or WebM clip." });
    return;
  }
  if (bytes.length < 12 || !validVideoSignature(bytes, contentType)) {
    res.status(400).json({ error: "The reference clip is empty or not a valid supported video." });
    return;
  }

  const objectPath = `studio-reference-clips/${randomUUID()}`;
  try {
    await saveStudioReferenceClip(objectPath, bytes, contentType);
    const [clip] = await db.insert(studioReferenceClipsTable).values({
      ...metadata,
      contentType,
      sizeBytes: bytes.length,
      objectPath,
    }).returning();
    req.log.info({ clipId: clip.id, sizeBytes: bytes.length }, "Saved private sports reference clip");
    res.status(201).json(UploadStudioReferenceClipResponse.parse(clip));
  } catch (error) {
    try {
      await deleteStudioReferenceClip(objectPath);
    } catch (cleanupError) {
      req.log.error({ err: cleanupError }, "Unable to remove incomplete reference clip upload");
    }
    req.log.error({ err: error }, "Unable to save private reference clip");
    res.status(503).json({ error: "The reference clip could not be saved. Please try again." });
  }
});

router.get("/studio/reference-clips/:id/video", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const params = DeleteStudioReferenceClipParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Reference clip not found." });
    return;
  }
  const clips = await db.select().from(studioReferenceClipsTable).orderBy(desc(studioReferenceClipsTable.createdAt));
  const clip = clips.find((candidate) => candidate.id === params.data.id);
  if (!clip) {
    res.status(404).json({ error: "Reference clip not found." });
    return;
  }
  try {
    const file = studioReferenceClipFile(clip.objectPath);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", clip.contentType);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.status(416).end();
        return;
      }
      const suffixLength = !match[1] && match[2] ? Number(match[2]) : 0;
      const start = !match[1] && suffixLength > 0
        ? Math.max(clip.sizeBytes - suffixLength, 0)
        : match[1] ? Number(match[1]) : 0;
      const end = !match[1] && suffixLength > 0
        ? clip.sizeBytes - 1
        : match[2] ? Math.min(Number(match[2]), clip.sizeBytes - 1) : clip.sizeBytes - 1;
      if ((!match[1] && suffixLength <= 0) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= clip.sizeBytes) {
        res.status(416).end();
        return;
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${clip.sizeBytes}`);
      res.setHeader("Content-Length", String(end - start + 1));
      file.createReadStream({ start, end }).on("error", (error: unknown) => {
        req.log.error({ err: error, clipId: clip.id }, "Unable to stream private reference clip");
        if (!res.headersSent) res.status(500).json({ error: "Unable to stream this reference clip." });
        else res.destroy();
      }).pipe(res);
      return;
    }
    res.setHeader("Content-Length", String(clip.sizeBytes));
    file.createReadStream().on("error", (error: unknown) => {
      req.log.error({ err: error, clipId: clip.id }, "Unable to stream private reference clip");
      if (!res.headersSent) res.status(500).json({ error: "Unable to stream this reference clip." });
      else res.destroy();
    }).pipe(res);
  } catch (error) {
    req.log.error({ err: error, clipId: clip.id }, "Unable to access private reference clip");
    res.status(500).json({ error: "Unable to access this reference clip." });
  }
});

router.delete("/studio/reference-clips/:id", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const params = DeleteStudioReferenceClipParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Reference clip not found." });
    return;
  }
  const clips = await db.select().from(studioReferenceClipsTable).orderBy(desc(studioReferenceClipsTable.createdAt));
  const clip = clips.find((candidate) => candidate.id === params.data.id);
  if (!clip) {
    res.status(404).json({ error: "Reference clip not found." });
    return;
  }
  try {
    await deleteStudioReferenceClip(clip.objectPath);
    await db.delete(studioReferenceClipsTable).where(eq(studioReferenceClipsTable.id, clip.id));
    res.status(204).end();
  } catch (error) {
    req.log.error({ err: error, clipId: clip.id }, "Unable to remove private reference clip");
    res.status(503).json({ error: "The reference clip could not be removed." });
  }
});

export default router;
