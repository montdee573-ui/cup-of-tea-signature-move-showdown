import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, contestResultsTable } from "@workspace/db";
import {
  ClearStudioContestResultBody,
  ClearStudioContestResultParams,
  ClearStudioContestResultResponse,
  CreateStudioContestResultBody,
  CreateStudioContestResultResponse,
  ListStudioContestResultsResponse,
} from "@workspace/api-zod";
import { isStudioOwner } from "./studio";

const router: IRouter = Router();

function encodeResult(row: typeof contestResultsTable.$inferSelect) {
  return {
    ...row,
    status: row.status as "draft" | "cleared",
  };
}

router.get("/studio/contest-results", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const rows = await db.select().from(contestResultsTable)
    .orderBy(desc(contestResultsTable.createdAt));
  res.json(ListStudioContestResultsResponse.parse(rows.map(encodeResult)));
});

router.post("/studio/contest-results", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const parsed = CreateStudioContestResultBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter the verified results from both contest apps." });
    return;
  }
  if (parsed.data.winnerName.trim().toLocaleLowerCase() === parsed.data.runnerUpName.trim().toLocaleLowerCase()) {
    res.status(400).json({ error: "Winner and runner-up must be different participants." });
    return;
  }

  const [row] = await db.insert(contestResultsTable).values({
    eventTitle: parsed.data.eventTitle.trim(),
    division: parsed.data.division.trim(),
    winnerName: parsed.data.winnerName.trim(),
    winnerHandle: parsed.data.winnerHandle.trim(),
    runnerUpName: parsed.data.runnerUpName.trim(),
    winnerVotes: parsed.data.winnerVotes,
    runnerUpVotes: parsed.data.runnerUpVotes,
    coreScore: parsed.data.coreScore ?? null,
    base44Summary: parsed.data.base44Summary.trim(),
    viralReelSummary: parsed.data.viralReelSummary.trim(),
    status: "draft",
  }).returning();

  req.log.info({ resultId: row.id }, "Saved contest result draft");
  res.status(201).json(CreateStudioContestResultResponse.parse(encodeResult(row)));
});

router.post("/studio/contest-results/:id/clear", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const params = ClearStudioContestResultParams.safeParse(req.params);
  const parsed = ClearStudioContestResultBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Confirm the result and add a clearance note." });
    return;
  }

  const [draft] = await db.select().from(contestResultsTable)
    .where(eq(contestResultsTable.id, params.data.id));
  if (!draft) {
    res.status(404).json({ error: "Contest result draft not found." });
    return;
  }
  if (draft.status !== "draft") {
    res.status(409).json({ error: "This result has already been cleared." });
    return;
  }
  if (draft.winnerVotes <= draft.runnerUpVotes) {
    res.status(409).json({ error: "A tied or trailing entry cannot be cleared as the vote winner." });
    return;
  }

  const [cleared] = await db.update(contestResultsTable).set({
    status: "cleared",
    clearanceNote: parsed.data.clearanceNote.trim(),
    clearedAt: new Date(),
  }).where(and(
    eq(contestResultsTable.id, params.data.id),
    eq(contestResultsTable.status, "draft"),
  )).returning();

  if (!cleared) {
    res.status(409).json({ error: "This result was cleared in another session." });
    return;
  }
  req.log.info({ resultId: cleared.id }, "Owner cleared official contest result");
  res.json(ClearStudioContestResultResponse.parse(encodeResult(cleared)));
});

export default router;
