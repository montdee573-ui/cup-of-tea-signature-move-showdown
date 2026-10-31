import { createHash, randomBytes, randomUUID } from "node:crypto";
import express, { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, moveSubmissionsTable } from "@workspace/db";
import {
  CreateMoveSubmissionResponse,
  ListMoveSubmissionsForReviewResponse,
  GetMoveSubmissionVideoParams,
  ReviewMoveSubmissionBody,
  ReviewMoveSubmissionParams,
  ReviewMoveSubmissionResponse,
} from "@workspace/api-zod";
import {
  deleteMoveSubmissionVideo,
  moveSubmissionVideoFile,
  saveMoveSubmissionVideo,
} from "../lib/studio-object-storage";
import { isStudioOwner } from "./studio";
import {
  encodeMoveSubmissionForReview,
  parseSubmissionMetadataHeader,
  submissionFieldsFromMetadata,
} from "../lib/move-submission-contract";

const router: IRouter = Router();
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_ACTIVE_UPLOADS = 4;
const UPLOADS_PER_IP_PER_HOUR = 5;
const acceptedContentTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const rateWindows = new Map<string, { count: number; resetAt: number }>();
let activeUploads = 0;

function submissionRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  let bucket = rateWindows.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + 60 * 60 * 1000 };
    rateWindows.set(ip, bucket);
  }
  bucket.count += 1;

  if (rateWindows.size > 5000) {
    for (const [key, value] of rateWindows) {
      if (value.resetAt <= now) rateWindows.delete(key);
    }
  }

  if (bucket.count > UPLOADS_PER_IP_PER_HOUR) {
    res.status(429).json({ error: "Upload limit reached. Try again later." });
    return;
  }
  if (activeUploads >= MAX_ACTIVE_UPLOADS) {
    res.status(429).json({ error: "Uploads are busy right now. Please try again shortly." });
    return;
  }

  activeUploads += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeUploads = Math.max(0, activeUploads - 1);
  };
  res.once("finish", release);
  res.once("close", release);
  next();
}

const videoBodyParser = express.raw({
  type: () => true,
  limit: MAX_VIDEO_BYTES,
});

function parseVideoBody(req: Request, res: Response, next: NextFunction): void {
  videoBodyParser(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }
    const bodyError = error as { type?: string };
    if (bodyError.type === "entity.too.large") {
      res.status(413).json({ error: "This video is larger than the 100 MB limit." });
      return;
    }
    req.log.warn({ err: error }, "Unable to read move submission upload");
    res.status(400).json({ error: "The video upload could not be read." });
  });
}

router.post("/move-submissions", submissionRateLimit, parseVideoBody, async (req, res): Promise<void> => {
  const metadata = parseSubmissionMetadataHeader(req.get("X-Submission-Metadata"));
  if (!metadata) {
    res.status(400).json({ error: "Submission details or consent are missing or invalid." });
    return;
  }

  const contentType = (req.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!acceptedContentTypes.has(contentType)) {
    res.status(400).json({ error: "Choose an MP4, WebM, or MOV video." });
    return;
  }

  const video = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (video.length === 0) {
    res.status(400).json({ error: "Choose a video before submitting." });
    return;
  }
  if (video.length > MAX_VIDEO_BYTES) {
    res.status(413).json({ error: "This video is larger than the 100 MB limit." });
    return;
  }

  const id = randomUUID();
  const creatorAccessToken = randomBytes(32).toString("base64url");
  const creatorTokenHash = createHash("sha256").update(creatorAccessToken).digest("hex");
  const filename = (metadata.videoFileName ?? "move-video")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .slice(0, 150) || "move-video";
  let objectSaved = false;

  try {
    const objectPath = await saveMoveSubmissionVideo(id, video, contentType);
    objectSaved = true;
    const [row] = await db.insert(moveSubmissionsTable).values({
      id,
      ...submissionFieldsFromMetadata(metadata),
      videoObjectPath: objectPath,
      videoFileName: filename,
      videoContentType: contentType,
      videoSizeBytes: video.length,
      consentAt: new Date(),
      status: "pending",
      creatorTokenHash,
    }).returning();

    req.log.info({ submissionId: id, videoSizeBytes: video.length }, "Move video submitted for moderation");
    res.status(201).json(CreateMoveSubmissionResponse.parse({
      id: row.id,
      status: "pending",
      createdAt: row.createdAt,
      creatorAccessToken,
    }));
  } catch (error) {
    if (objectSaved) {
      try {
        await deleteMoveSubmissionVideo(id);
      } catch (cleanupError) {
        req.log.error({ err: cleanupError, submissionId: id }, "Unable to clean up failed submission upload");
      }
    }
    req.log.error({ err: error }, "Unable to save move submission");
    res.status(503).json({ error: "We could not save your submission. Please try again." });
  }
});

router.get("/studio/move-submissions/review", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const rows = await db.select().from(moveSubmissionsTable)
    .where(eq(moveSubmissionsTable.status, "pending"))
    .orderBy(desc(moveSubmissionsTable.createdAt));
  res.json(ListMoveSubmissionsForReviewResponse.parse(rows.map(encodeMoveSubmissionForReview)));
});

router.patch("/studio/move-submissions/:id/review", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const params = ReviewMoveSubmissionParams.safeParse(req.params);
  const body = ReviewMoveSubmissionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose approve or reject for a valid submission." });
    return;
  }
  const [row] = await db.update(moveSubmissionsTable)
    .set({ status: body.data.status, reviewedAt: new Date() })
    .where(and(
      eq(moveSubmissionsTable.id, params.data.id),
      eq(moveSubmissionsTable.status, "pending"),
    ))
    .returning();
  if (!row) {
    const [existing] = await db.select({ status: moveSubmissionsTable.status })
      .from(moveSubmissionsTable)
      .where(eq(moveSubmissionsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Submission not found." });
      return;
    }
    res.status(409).json({ error: "This submission has already been reviewed." });
    return;
  }
  req.log.info({ submissionId: row.id, status: row.status }, "Move submission moderation decision saved");
  res.json(ReviewMoveSubmissionResponse.parse(encodeMoveSubmissionForReview(row)));
});

router.get("/studio/move-submissions/:id/video", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const params = GetMoveSubmissionVideoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid submission ID." });
    return;
  }
  const [row] = await db.select().from(moveSubmissionsTable)
    .where(eq(moveSubmissionsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Submission video not found." });
    return;
  }

  try {
    const file = moveSubmissionVideoFile(row.id);
    const size = row.videoSizeBytes;
    const range = req.headers.range;
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", row.videoContentType);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.status(416).end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
        res.status(416).end();
        return;
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", String(end - start + 1));
      file.createReadStream({ start, end }).on("error", (error: unknown) => {
        req.log.error({ err: error, submissionId: row.id }, "Unable to stream private submission video");
        if (!res.headersSent) res.status(500).json({ error: "Unable to stream the submission video." });
        else res.destroy();
      }).pipe(res);
      return;
    }
    res.setHeader("Content-Length", String(size));
    file.createReadStream().on("error", (error: unknown) => {
      req.log.error({ err: error, submissionId: row.id }, "Unable to stream private submission video");
      if (!res.headersSent) res.status(500).json({ error: "Unable to stream the submission video." });
      else res.destroy();
    }).pipe(res);
  } catch (error) {
    req.log.error({ err: error, submissionId: row.id }, "Unable to stream private submission video");
    res.status(500).json({ error: "Unable to stream the submission video." });
  }
});

export default router;
