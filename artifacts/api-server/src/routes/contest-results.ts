import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, contestResultsTable } from "@workspace/db";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  ClearStudioContestResultBody,
  ClearStudioContestResultParams,
  ClearStudioContestResultResponse,
  CreateStudioContestResultBody,
  CreateStudioContestResultResponse,
  EmailStudioContestResultBody,
  EmailStudioContestResultParams,
  EmailStudioContestResultResponse,
  ListStudioContestResultsResponse,
} from "@workspace/api-zod";
import { isStudioOwner } from "./studio";

const router: IRouter = Router();

function encodeResult(row: typeof contestResultsTable.$inferSelect) {
  return {
    ...row,
    status: row.status as "draft" | "cleared",
    emailDeliveryStatus: row.emailDeliveryStatus as "not_sent" | "sending" | "sent" | "failed",
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
  if (!parsed.data.clearanceNote.trim()) {
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

router.post("/studio/contest-results/:id/email", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const params = EmailStudioContestResultParams.safeParse(req.params);
  const parsed = EmailStudioContestResultBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Confirm the email action and provide a valid result ID." });
    return;
  }

  const [result] = await db.select().from(contestResultsTable)
    .where(eq(contestResultsTable.id, params.data.id));
  if (!result) {
    res.status(404).json({ error: "Contest result not found." });
    return;
  }
  if (result.status !== "cleared") {
    res.status(409).json({ error: "Only an owner-cleared final can be emailed." });
    return;
  }
  if (result.emailDeliveryStatus === "sent") {
    res.status(409).json({ error: "This final has already been emailed." });
    return;
  }
  if (result.emailDeliveryStatus === "sending") {
    res.status(409).json({ error: "This final is already being emailed." });
    return;
  }

  const recipient = process.env.CONTEST_RESULTS_EMAIL_TO?.trim();
  const sender = process.env.CONTEST_RESULTS_EMAIL_FROM?.trim();
  if (!recipient || !sender) {
    const [failed] = await db.update(contestResultsTable).set({
      emailDeliveryStatus: "failed",
      emailSentAt: null,
      emailDeliveryError: "Email recipient or sender is not configured.",
    }).where(and(
      eq(contestResultsTable.id, params.data.id),
      eq(contestResultsTable.status, "cleared"),
      inArray(contestResultsTable.emailDeliveryStatus, ["not_sent", "failed"]),
    )).returning();
    if (!failed) {
      res.status(409).json({ error: "This final is already being emailed or has already been sent." });
      return;
    }
    res.status(503).json({ error: "Configure the results email recipient and sender before sending." });
    return;
  }

  const [claimed] = await db.update(contestResultsTable).set({
    emailDeliveryStatus: "sending",
    emailSentAt: null,
    emailDeliveryError: null,
  }).where(and(
    eq(contestResultsTable.id, params.data.id),
    eq(contestResultsTable.status, "cleared"),
    inArray(contestResultsTable.emailDeliveryStatus, ["not_sent", "failed"]),
  )).returning();
  if (!claimed) {
    res.status(409).json({ error: "This final is already being emailed or has already been sent." });
    return;
  }

  try {
    const response = await new ReplitConnectors().proxy("resend", "/emails", {
      method: "POST",
      headers: { "Idempotency-Key": `contest-result-${claimed.id}` },
      body: {
        from: sender,
        to: recipient,
        subject: `Official contest result: ${claimed.eventTitle}`,
        text: [
          `${claimed.eventTitle} — ${claimed.division}`,
          "",
          `Vote winner: ${claimed.winnerName}${claimed.winnerHandle ? ` (${claimed.winnerHandle})` : ""}`,
          `Votes: ${claimed.winnerVotes}`,
          `Runner-up: ${claimed.runnerUpName}`,
          `Runner-up votes: ${claimed.runnerUpVotes}`,
          `C.O.R.E. technique score: ${claimed.coreScore === null ? "Not recorded" : `${claimed.coreScore}/100`}`,
          "",
          `Owner clearance: ${claimed.clearanceNote ?? ""}`,
          "",
          "Cup of Tea / Base44 notes:",
          claimed.base44Summary,
          "",
          "Viral Reel / Replit notes:",
          claimed.viralReelSummary,
        ].join("\n"),
      },
    });

    if (!response.ok) {
      req.log.warn({ resultId: claimed.id, statusCode: response.status }, "Results email provider rejected delivery");
      const [failed] = await db.update(contestResultsTable).set({
        emailDeliveryStatus: "failed",
        emailDeliveryError: "The email service rejected delivery. Check its configuration and retry.",
      }).where(and(
        eq(contestResultsTable.id, claimed.id),
        eq(contestResultsTable.emailDeliveryStatus, "sending"),
      )).returning();
      res.status(502).json({
        error: failed?.emailDeliveryError ?? "The email service rejected delivery. Check its configuration and retry.",
      });
      return;
    }

    const [sent] = await db.update(contestResultsTable).set({
      emailDeliveryStatus: "sent",
      emailSentAt: new Date(),
      emailDeliveryError: null,
    }).where(and(
      eq(contestResultsTable.id, claimed.id),
      eq(contestResultsTable.emailDeliveryStatus, "sending"),
    )).returning();
    if (!sent) {
      res.status(409).json({ error: "Email was accepted, but the delivery status could not be saved. Refresh before retrying." });
      return;
    }
    req.log.info({ resultId: sent.id }, "Owner sent cleared contest result email");
    res.json(EmailStudioContestResultResponse.parse(encodeResult(sent)));
  } catch {
    req.log.warn({ resultId: claimed.id }, "Results email delivery failed");
    await db.update(contestResultsTable).set({
      emailDeliveryStatus: "failed",
      emailDeliveryError: "The email service could not send this result. Check the connection and retry.",
    }).where(and(
      eq(contestResultsTable.id, claimed.id),
      eq(contestResultsTable.emailDeliveryStatus, "sending"),
    )).returning();
    res.status(502).json({ error: "The email service could not send this result. Check the connection and retry." });
  }
});

export default router;
