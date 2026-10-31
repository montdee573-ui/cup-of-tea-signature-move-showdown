import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, moveSubmissionsTable } from "@workspace/db";
import {
  GetCommunityCardParams,
  GetCommunityCardResponse,
  ListCommunityCardsResponse,
} from "@workspace/api-zod";
import { moveSubmissionVideoFile } from "../lib/studio-object-storage";
import { encodeCommunityCard } from "../lib/move-submission-contract";

const router: IRouter = Router();

router.get("/community-cards", async (req, res): Promise<void> => {
  const cards = await db
    .select()
    .from(moveSubmissionsTable)
    .where(eq(moveSubmissionsTable.status, "approved"))
    .orderBy(asc(moveSubmissionsTable.createdAt));
  res.json(ListCommunityCardsResponse.parse(cards.map(encodeCommunityCard)));
});

router.get("/community-cards/:id", async (req, res): Promise<void> => {
  const params = GetCommunityCardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid community card ID." });
    return;
  }
  const [card] = await db
    .select()
    .from(moveSubmissionsTable)
    .where(eq(moveSubmissionsTable.id, params.data.id));
  if (!card || card.status !== "approved") {
    res.status(404).json({ error: "Community card not found." });
    return;
  }
  res.json(GetCommunityCardResponse.parse(encodeCommunityCard(card)));
});

router.get("/community-cards/:id/video", async (req, res): Promise<void> => {
  const params = GetCommunityCardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid community card ID." });
    return;
  }
  const [card] = await db
    .select()
    .from(moveSubmissionsTable)
    .where(eq(moveSubmissionsTable.id, params.data.id));
  if (!card || card.status !== "approved") {
    res.status(404).json({ error: "Approved video not found." });
    return;
  }

  try {
    const file = moveSubmissionVideoFile(card.id);
    const size = card.videoSizeBytes;
    const range = req.headers.range;
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", card.videoContentType);
    res.setHeader("Cache-Control", "public, max-age=3600");
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
        req.log.error({ err: error, submissionId: card.id }, "Unable to stream approved community video");
        if (!res.headersSent) res.status(500).json({ error: "Unable to stream this video." });
        else res.destroy();
      }).pipe(res);
      return;
    }
    res.setHeader("Content-Length", String(size));
    file.createReadStream().on("error", (error: unknown) => {
      req.log.error({ err: error, submissionId: card.id }, "Unable to stream approved community video");
      if (!res.headersSent) res.status(500).json({ error: "Unable to stream this video." });
      else res.destroy();
    }).pipe(res);
  } catch (error) {
    req.log.error({ err: error, submissionId: card.id }, "Unable to stream approved community video");
    res.status(500).json({ error: "Unable to stream this video." });
  }
});

export default router;
