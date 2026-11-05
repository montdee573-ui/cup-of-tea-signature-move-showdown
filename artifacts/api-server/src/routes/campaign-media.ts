import { Router } from "express";
import { cardsBracketsCampaignFile } from "../lib/studio-object-storage";

const router = Router();

// Express also routes HEAD here. Safari uses byte ranges for MP4 metadata/seeking.
router.get("/campaign-media/cards-brackets.mp4", async (req, res) => {
  try {
    const file = cardsBracketsCampaignFile();
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size);
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error("Invalid media size");
    res.set({
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    let start = 0;
    let end = size - 1;
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        res.status(416).set("Content-Range", `bytes */${size}`).end();
        return;
      }
      if (!match[1]) {
        const suffix = Number(match[2]);
        start = Math.max(0, size - suffix);
        if (!Number.isSafeInteger(suffix) || suffix <= 0) start = size;
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start < 0 || end < start) {
        res.status(416).set("Content-Range", `bytes */${size}`).end();
        return;
      }
      res.status(206).set("Content-Range", `bytes ${start}-${end}/${size}`);
    }
    res.set("Content-Length", String(end - start + 1));
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = file.createReadStream({ start, end });
    res.on("close", () => stream.destroy());
    stream.on("error", (error) => {
      req.log.error({ err: error }, "Campaign video stream failed");
      if (!res.headersSent) res.status(503).removeHeader("Content-Length");
      res.destroy();
    });
    stream.pipe(res);
  } catch (error) {
    req.log.error({ err: error }, "Campaign video unavailable");
    res.status(503).json({ error: "Campaign video is temporarily unavailable." });
  }
});

export default router;
