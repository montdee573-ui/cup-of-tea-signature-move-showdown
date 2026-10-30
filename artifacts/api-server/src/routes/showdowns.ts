import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  moveSubmissionsTable,
  showdownsTable,
  showdownVotesTable,
} from "@workspace/db";
import {
  CreateShowdownBody,
  CreateShowdownResponse,
  ListShowdownsQueryParams,
  ListShowdownsResponse,
  VoteOnShowdownBody,
  VoteOnShowdownParams,
  VoteOnShowdownResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const voteRateWindows = new Map<string, { count: number; resetAt: number }>();
const createRateWindows = new Map<string, { count: number; resetAt: number }>();

function voterHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function hasDatabaseErrorCode(error: unknown, code: string, depth = 0): boolean {
  if (depth > 5 || typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; cause?: unknown };
  return record.code === code || hasDatabaseErrorCode(record.cause, code, depth + 1);
}

function withinRateLimit(
  windows: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  let bucket = windows.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    windows.set(key, bucket);
  }
  bucket.count += 1;
  if (windows.size > 5000) {
    for (const [storedKey, value] of windows) {
      if (value.resetAt <= now) windows.delete(storedKey);
    }
  }
  return bucket.count <= limit;
}

function cardForResponse(row: typeof moveSubmissionsTable.$inferSelect) {
  return {
    id: row.id,
    displayName: row.displayName,
    handle: row.handle,
    sport: row.sport,
    moveName: row.moveName,
    team: row.team,
    videoUrl: `/api/community-cards/${row.id}/video`,
  };
}

async function showdownResponse(
  row: typeof showdownsTable.$inferSelect,
  tokenHash?: string,
) {
  const [left, right] = await Promise.all([
    db.select().from(moveSubmissionsTable).where(eq(moveSubmissionsTable.id, row.leftSubmissionId)),
    db.select().from(moveSubmissionsTable).where(eq(moveSubmissionsTable.id, row.rightSubmissionId)),
  ]);
  if (!left[0] || !right[0]) return null;
  const counts = await db
    .select({ submissionId: showdownVotesTable.submissionId, total: count() })
    .from(showdownVotesTable)
    .where(eq(showdownVotesTable.showdownId, row.id))
    .groupBy(showdownVotesTable.submissionId);
  const totalByEntry = new Map(counts.map((item) => [item.submissionId, item.total]));
  let myVoteEntryId: string | null = null;
  if (tokenHash) {
    const [vote] = await db
      .select({ submissionId: showdownVotesTable.submissionId })
      .from(showdownVotesTable)
      .where(and(
        eq(showdownVotesTable.showdownId, row.id),
        eq(showdownVotesTable.voterHash, tokenHash),
      ));
    myVoteEntryId = vote?.submissionId ?? null;
  }
  return {
    id: row.id,
    mode: row.mode as "sport" | "exhibition",
    left: cardForResponse(left[0]),
    right: cardForResponse(right[0]),
    leftVotes: totalByEntry.get(row.leftSubmissionId) ?? 0,
    rightVotes: totalByEntry.get(row.rightSubmissionId) ?? 0,
    myVoteEntryId,
    createdAt: row.createdAt,
  };
}

router.get("/showdowns", async (req, res): Promise<void> => {
  const params = ListShowdownsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "A valid voter token is required." });
    return;
  }
  const rows = await db.select().from(showdownsTable).orderBy(desc(showdownsTable.createdAt));
  const tokenHash = voterHash(params.data.voterToken);
  const showdowns = await Promise.all(rows.map((row) => showdownResponse(row, tokenHash)));
  res.json(ListShowdownsResponse.parse(showdowns.filter((item) => item !== null)));
});

router.post("/showdowns", async (req, res): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!withinRateLimit(createRateWindows, ip, 20, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Matchup creation limit reached. Try again later." });
    return;
  }
  const parsed = CreateShowdownBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose two approved cards and a matchup type." });
    return;
  }
  if (parsed.data.firstEntryId === parsed.data.secondEntryId) {
    res.status(400).json({ error: "Choose two different cards." });
    return;
  }

  const entries = await db.select().from(moveSubmissionsTable).where(and(
    inArray(moveSubmissionsTable.id, [parsed.data.firstEntryId, parsed.data.secondEntryId]),
    eq(moveSubmissionsTable.status, "approved"),
  ));
  if (entries.length !== 2) {
    res.status(400).json({ error: "Only approved community cards can enter a matchup." });
    return;
  }
  const [first, second] = entries;
  const sameSport = first.sport.trim().toLocaleLowerCase() === second.sport.trim().toLocaleLowerCase();
  if ((parsed.data.mode === "sport" && !sameSport) || (parsed.data.mode === "exhibition" && sameSport)) {
    res.status(400).json({
      error: parsed.data.mode === "sport"
        ? "Sport matchups must use cards from the same sport."
        : "Cross-sport exhibitions must use cards from different sports.",
    });
    return;
  }

  const [leftId, rightId] = [parsed.data.firstEntryId, parsed.data.secondEntryId].sort();
  let [row] = await db
    .insert(showdownsTable)
    .values({
      leftSubmissionId: leftId,
      rightSubmissionId: rightId,
      mode: parsed.data.mode,
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    const [existing] = await db.select().from(showdownsTable).where(and(
      eq(showdownsTable.leftSubmissionId, leftId),
      eq(showdownsTable.rightSubmissionId, rightId),
      eq(showdownsTable.mode, parsed.data.mode),
    ));
    if (!existing) {
      res.status(500).json({ error: "The matchup could not be created." });
      return;
    }
    res.status(409).json({ error: "That matchup already exists." });
    return;
  }

  const response = await showdownResponse(row);
  if (!response) {
    res.status(500).json({ error: "The matchup cards could not be loaded." });
    return;
  }
  req.log.info({ showdownId: row.id, mode: row.mode }, "Created free community matchup");
  res.status(201).json(CreateShowdownResponse.parse(response));
});

router.post("/showdowns/:id/votes", async (req, res): Promise<void> => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  if (!withinRateLimit(voteRateWindows, ip, 60, 60 * 60 * 1000)) {
    res.status(429).json({ error: "Voting limit reached. Try again later." });
    return;
  }
  const params = VoteOnShowdownParams.safeParse(req.params);
  const body = VoteOnShowdownBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a card in this matchup and provide a valid voter token." });
    return;
  }
  const [matchup] = await db.select().from(showdownsTable)
    .where(eq(showdownsTable.id, params.data.id));
  if (!matchup) {
    res.status(404).json({ error: "Matchup not found." });
    return;
  }
  if (![matchup.leftSubmissionId, matchup.rightSubmissionId].includes(body.data.entryId)) {
    res.status(400).json({ error: "That card is not part of this matchup." });
    return;
  }

  const hash = voterHash(body.data.voterToken);
  try {
    await db.insert(showdownVotesTable).values({
      showdownId: matchup.id,
      submissionId: body.data.entryId,
      voterHash: hash,
    });
  } catch (error) {
    if (hasDatabaseErrorCode(error, "23505")) {
      res.status(409).json({ error: "This voter has already voted in this matchup." });
      return;
    }
    throw error;
  }

  const result = await showdownResponse(matchup, hash);
  if (!result) {
    res.status(500).json({ error: "The matchup results could not be loaded." });
    return;
  }
  req.log.info({ showdownId: matchup.id }, "Recorded free community vote");
  res.json(VoteOnShowdownResponse.parse({
    showdownId: result.id,
    leftVotes: result.leftVotes,
    rightVotes: result.rightVotes,
    myVoteEntryId: result.myVoteEntryId,
  }));
});

export default router;
