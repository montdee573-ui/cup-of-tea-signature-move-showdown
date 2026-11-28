import { randomUUID } from "node:crypto";
import express, { Router, type IRouter, type Request } from "express";
import { and, asc, eq } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { db, moveCardsTable } from "@workspace/db";
import {
  GetMoveCardResponse,
  ListMoveCardsResponse,
  CreateStudioMoveCardDraftBody,
  UpdateStudioMoveCardBody,
} from "@workspace/api-zod";
import { z } from "zod";
import { isStudioOwner } from "./studio";
import { ensureSeeded } from "./move-cards";

const router: IRouter = Router();
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;
const MAX_ANALYSES_PER_HOUR = 5;
const analysisWindows = new Map<string, { count: number; resetAt: number }>();
const aiContextSchema = z.object({
  athleteName: z.string().trim().min(1).max(100),
  sport: z.string().trim().min(1).max(50),
  era: z.enum(["Classic", "Current"]),
  team: z.string().trim().max(100),
  sourceLabel: z.string().trim().min(1).max(180),
  sourceUrl: z.string().url().nullable(),
  permissionConfirmed: z.literal(true),
});
const aiSuggestionSchema = z.object({
  moveName: z.string().trim().min(2).max(100),
  tagline: z.string().trim().min(2).max(180),
  explanation: z.string().trim().min(10).max(2000),
  cues: z.array(z.string().trim().min(3).max(240)).min(1).max(8),
});

type MoveCardRow = typeof moveCardsTable.$inferSelect;

function makeSlug(athleteName: string, moveName: string): string {
  const base = `${athleteName}-${moveName}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 88) || "move-card";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function canPublish(input: z.infer<typeof UpdateStudioMoveCardBody>): string | null {
  if (!input.identityVerified) return "Verify the athlete and move details before publishing.";
  if (!input.mediaPermissionConfirmed) return "Confirm media permission before publishing.";
  if (!input.sourceUrl?.startsWith("https://")) return "Add an HTTPS reference source before publishing.";
  if (!input.sourceLabel.trim()) return "Add a source description before publishing.";
  return null;
}

function aiRequestContext(req: Request) {
  const header = req.get("X-Move-Card-Context");
  if (!header || header.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    const parsed = aiContextSchema.safeParse(value);
    if (!parsed.success) return null;
    if (parsed.data.sourceUrl && !parsed.data.sourceUrl.startsWith("https://")) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function consumeAnalysisSlot(req: Request): boolean {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  let bucket = analysisWindows.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + 60 * 60 * 1000 };
    analysisWindows.set(key, bucket);
  }
  bucket.count += 1;
  if (analysisWindows.size > 5_000) {
    for (const [ip, entry] of analysisWindows) {
      if (entry.resetAt <= now) analysisWindows.delete(ip);
    }
  }
  return bucket.count <= MAX_ANALYSES_PER_HOUR;
}

function validVideoSignature(video: Buffer, contentType: string): boolean {
  if (contentType === "video/webm") return video.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return video.length >= 12 && video.toString("ascii", 4, 8) === "ftyp";
}

function aiResponseText(response: { text?: string }): string {
  return typeof response.text === "string" ? response.text.trim() : "";
}

async function analyzeVideoWithRetry(video: Buffer, contentType: string, athleteName: string, sport: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  const ai = new GoogleGenAI({ apiKey });
  const prompt = [
    "Analyze only the visible movement mechanics in this short athlete reference clip.",
    "Return one JSON object with moveName, tagline, explanation, and cues (an array).",
    "Do not identify a person from their face, jersey, or appearance. Do not infer or verify identity, team, date, game, signature status, or media rights.",
    "Treat the supplied athlete and sport as unverified owner-entered context. Describe only what can be observed in the clip.",
    "If the movement is unclear, say so plainly in the suggestion and cues instead of inventing details.",
    `Owner-entered context: athlete ${athleteName}; sport ${sport}.`,
    "The output is a private draft suggestion that a human must verify and edit.",
  ].join(" ");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: contentType, data: video.toString("base64") } },
            { text: prompt },
          ],
        }],
        config: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
        },
      });
      const output = aiResponseText(response);
      return aiSuggestionSchema.parse(JSON.parse(output));
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status?: unknown }).status)
        : 0;
      if (attempt === 0 && (status === 429 || status === 503)) {
        await new Promise((resolve) => setTimeout(resolve, 650));
        continue;
      }
      throw error;
    }
  }
  throw new Error("AI_ANALYSIS_FAILED");
}

router.get("/studio/move-cards", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  await ensureSeeded();
  const cards = await db.select().from(moveCardsTable)
    .orderBy(asc(moveCardsTable.moderationStatus), asc(moveCardsTable.sortOrder), asc(moveCardsTable.id));
  res.json(ListMoveCardsResponse.parse(cards));
});

router.post("/studio/move-cards/drafts", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const input = CreateStudioMoveCardDraftBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "Complete the athlete, move, and source details before saving." });
    return;
  }
  const [card] = await db.insert(moveCardsTable).values({
    ...input.data,
    slug: makeSlug(input.data.athleteName, input.data.moveName),
    moderationStatus: "draft",
    identityVerified: false,
    mediaPermissionConfirmed: false,
    aiGenerated: false,
    aiReviewed: false,
  }).returning();
  res.status(201).json(GetMoveCardResponse.parse(card));
});

router.patch("/studio/move-cards/:id", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const id = Number(req.params.id);
  const input = UpdateStudioMoveCardBody.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !input.success) {
    res.status(400).json({ error: "Move card details are incomplete or invalid." });
    return;
  }
  const [existing] = await db.select().from(moveCardsTable).where(eq(moveCardsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Move card not found." });
    return;
  }
  if (input.data.action === "publish") {
    const publicationError = canPublish(input.data);
    if (publicationError) {
      res.status(400).json({ error: publicationError });
      return;
    }
  }

  const changedForAiReview = existing.aiGenerated && (
    existing.athleteName !== input.data.athleteName
    || existing.sport !== input.data.sport
    || existing.era !== input.data.era
    || existing.team !== input.data.team
    || existing.moveName !== input.data.moveName
    || existing.tagline !== input.data.tagline
    || existing.explanation !== input.data.explanation
    || JSON.stringify(existing.cues) !== JSON.stringify(input.data.cues)
    || existing.sourceLabel !== input.data.sourceLabel
    || existing.sourceUrl !== input.data.sourceUrl
    || existing.coverImageUrl !== input.data.coverImageUrl
  );
  if (input.data.action === "publish" && existing.aiGenerated && !existing.aiReviewed && !changedForAiReview) {
    res.status(400).json({ error: "Edit and save at least one AI-suggested detail before publishing." });
    return;
  }
  const moderationStatus = input.data.action === "publish"
    ? "published"
    : input.data.action === "unpublish" ? "draft" : existing.moderationStatus;
  const [updated] = await db.update(moveCardsTable).set({
    athleteName: input.data.athleteName.trim(),
    sport: input.data.sport.trim(),
    era: input.data.era,
    team: input.data.team.trim(),
    moveName: input.data.moveName.trim(),
    tagline: input.data.tagline.trim(),
    explanation: input.data.explanation.trim(),
    cues: input.data.cues.map((cue) => cue.trim()),
    sourceType: input.data.sourceType,
    sourceLabel: input.data.sourceLabel.trim(),
    sourceUrl: input.data.sourceUrl,
    coverImageUrl: input.data.coverImageUrl,
    identityVerified: input.data.identityVerified,
    mediaPermissionConfirmed: input.data.mediaPermissionConfirmed,
    moderationStatus,
    aiReviewed: existing.aiReviewed || changedForAiReview,
  }).where(eq(moveCardsTable.id, id)).returning();
  res.json(GetMoveCardResponse.parse(updated));
});

const aiVideoBody = express.raw({
  type: () => true,
  limit: MAX_REFERENCE_BYTES,
});

router.post("/studio/move-cards/ai-draft", (req, res, next) => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  aiVideoBody(req, res, (error?: unknown) => {
    if (!error) {
      next();
      return;
    }
    const bodyError = error as { type?: string };
    if (bodyError.type === "entity.too.large") {
      res.status(413).json({ error: "Use a reference clip that is 5 MB or smaller." });
      return;
    }
    req.log.warn({ err: error }, "Unable to read move-card analysis video");
    res.status(400).json({ error: "The reference video could not be read." });
  });
}, async (req, res): Promise<void> => {
  const context = aiRequestContext(req);
  const contentType = (req.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!context || !["video/mp4", "video/quicktime", "video/webm"].includes(contentType)) {
    res.status(400).json({ error: "Provide valid move-card details, permission confirmation, and an MP4, MOV, or WebM clip." });
    return;
  }
  const video = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (video.length < 12 || !validVideoSignature(video, contentType)) {
    res.status(400).json({ error: "The reference clip is empty or not a valid supported video." });
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: "AI suggestions are unavailable because Gemini is not configured." });
    return;
  }
  if (!consumeAnalysisSlot(req)) {
    res.status(429).json({ error: "The hourly analysis limit is reached. Try again later." });
    return;
  }

  try {
    const suggestion = await analyzeVideoWithRetry(video, contentType, context.athleteName, context.sport);
    const draft = {
      athleteName: context.athleteName,
      sport: context.sport,
      era: context.era,
      team: context.team,
      moveName: suggestion.moveName,
      tagline: suggestion.tagline,
      explanation: suggestion.explanation,
      cues: suggestion.cues,
      sourceType: "user_clip",
      sourceLabel: context.sourceLabel,
      sourceUrl: context.sourceUrl,
      coverImageUrl: null,
      slug: makeSlug(context.athleteName, suggestion.moveName),
      moderationStatus: "draft",
      identityVerified: false,
      mediaPermissionConfirmed: false,
      aiGenerated: true,
      aiReviewed: false,
    } as const;
    const [card] = await db.insert(moveCardsTable).values(draft).returning();
    req.log.info({ cardId: card.id, sport: card.sport }, "Created a private AI-assisted athlete move-card draft");
    res.status(201).json(GetMoveCardResponse.parse(card));
  } catch (error) {
    const providerStatus = typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 0;
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      req.log.warn({ err: error }, "Gemini move-card suggestion did not match the expected schema");
      res.status(503).json({ error: "The clip did not produce a usable draft. No card was published." });
      return;
    }
    req.log.error({ err: error, providerStatus }, "Gemini move-card analysis failed");
    res.status(503).json({ error: "AI analysis is temporarily unavailable. No card was published." });
  }
});

export default router;
