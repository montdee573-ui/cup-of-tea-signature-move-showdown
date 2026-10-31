import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { db, contestResultHistoryTable, contestResultsTable } from "@workspace/db";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  ClearStudioContestResultBody,
  ClearStudioContestResultParams,
  ClearStudioContestResultResponse,
  CorrectStudioContestResultBody,
  CorrectStudioContestResultParams,
  CorrectStudioContestResultResponse,
  CreateStudioContestResultBody,
  CreateStudioContestResultResponse,
  EmailStudioContestResultBody,
  EmailStudioContestResultParams,
  EmailStudioContestResultResponse,
  ListStudioContestResultsResponse,
  UpdateStudioContestResultBody,
  UpdateStudioContestResultParams,
  UpdateStudioContestResultResponse,
} from "@workspace/api-zod";
import { isStudioOwner } from "./studio";

const router: IRouter = Router();

function encodeResult(row: typeof contestResultsTable.$inferSelect) {
  return {
    ...row,
    status: row.status as "draft" | "cleared",
    emailDeliveryStatus: row.emailDeliveryStatus as "not_sent" | "sending" | "sent" | "failed" | "delivered" | "bounced" | "complained",
    history: [] as Array<typeof contestResultHistoryTable.$inferSelect>,
  };
}

function resultSnapshot(row: typeof contestResultsTable.$inferSelect) {
  return {
    eventTitle: row.eventTitle,
    division: row.division,
    winnerName: row.winnerName,
    winnerHandle: row.winnerHandle,
    runnerUpName: row.runnerUpName,
    winnerVotes: row.winnerVotes,
    runnerUpVotes: row.runnerUpVotes,
    coreScore: row.coreScore,
    base44Summary: row.base44Summary,
    viralReelSummary: row.viralReelSummary,
  };
}

function encodeHistory(entry: typeof contestResultHistoryTable.$inferSelect) {
  return {
    ...entry,
    changeType: entry.changeType as "clearance" | "correction",
  };
}

router.get("/studio/contest-results", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const rows = await db.select().from(contestResultsTable)
    .orderBy(desc(contestResultsTable.createdAt));
  const historyByResult = new Map<number, Array<typeof contestResultHistoryTable.$inferSelect>>();
  await Promise.all(rows.map(async (row) => {
    const entries = await db.select().from(contestResultHistoryTable)
      .where(eq(contestResultHistoryTable.resultId, row.id))
      .orderBy(asc(contestResultHistoryTable.changedAt));
    historyByResult.set(row.id, entries);
  }));
  const emailRecipient = process.env.CONTEST_RESULTS_EMAIL_TO?.trim() || null;
  const emailSenderConfigured = Boolean(process.env.CONTEST_RESULTS_EMAIL_FROM?.trim());
  res.json(ListStudioContestResultsResponse.parse({
    emailRecipient,
    emailSenderConfigured,
    results: rows.map((row) => {
      const history = historyByResult.get(row.id) ?? [];
      // Retain a useful view of records cleared before the audit table existed.
      const visibleHistory = history.length || row.status !== "cleared" || !row.clearedAt
        ? history
        : [{
          id: 0,
          resultId: row.id,
          changeType: "clearance",
          snapshot: resultSnapshot(row),
          reason: row.clearanceNote ?? "Owner-cleared official result.",
          changedAt: row.clearedAt,
        }];
      return { ...encodeResult(row), history: visibleHistory.map(encodeHistory) };
    }),
  }));
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

router.patch("/studio/contest-results/:id", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const params = UpdateStudioContestResultParams.safeParse(req.params);
  const parsed = UpdateStudioContestResultBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Enter valid contest result details." });
    return;
  }
  if (parsed.data.winnerName.trim().toLocaleLowerCase() === parsed.data.runnerUpName.trim().toLocaleLowerCase()) {
    res.status(400).json({ error: "Winner and runner-up must be different participants." });
    return;
  }

  const [updated] = await db.update(contestResultsTable).set({
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
  }).where(and(
    eq(contestResultsTable.id, params.data.id),
    eq(contestResultsTable.status, "draft"),
  )).returning();

  if (!updated) {
    const [existing] = await db.select().from(contestResultsTable)
      .where(eq(contestResultsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Contest result draft not found." });
      return;
    }
    res.status(409).json({ error: "This result has already been cleared and cannot be edited." });
    return;
  }

  req.log.info({ resultId: updated.id }, "Owner updated contest result draft");
  res.json(UpdateStudioContestResultResponse.parse(encodeResult(updated)));
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

  const clearanceNote = parsed.data.clearanceNote.trim();
  const clearedAt = new Date();
  const clearedRecord = await db.transaction(async (transaction) => {
    const [cleared] = await transaction.update(contestResultsTable).set({
      status: "cleared",
      clearanceNote,
      clearedAt,
    }).where(and(
      eq(contestResultsTable.id, params.data.id),
      eq(contestResultsTable.status, "draft"),
    )).returning();
    if (!cleared) return null;
    const [auditEntry] = await transaction.insert(contestResultHistoryTable).values({
      resultId: cleared.id,
      changeType: "clearance",
      snapshot: resultSnapshot(cleared),
      reason: clearanceNote,
      changedAt: cleared.clearedAt ?? clearedAt,
    }).returning();
    return { cleared, auditEntry };
  });

  if (!clearedRecord) {
    res.status(409).json({ error: "This result was cleared in another session." });
    return;
  }
  const { cleared, auditEntry } = clearedRecord;
  req.log.info({ resultId: cleared.id }, "Owner cleared official contest result");
  res.json(ClearStudioContestResultResponse.parse({
    ...encodeResult(cleared),
    history: [encodeHistory(auditEntry)],
  }));
});

router.post("/studio/contest-results/:id/correct", async (req, res): Promise<void> => {
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner login required." });
    return;
  }
  const params = CorrectStudioContestResultParams.safeParse(req.params);
  const parsed = CorrectStudioContestResultBody.safeParse(req.body);
  if (!params.success || !parsed.success || !parsed.data.correctionReason.trim()) {
    res.status(400).json({ error: "Confirm the correction, provide a reason, and enter valid result details." });
    return;
  }
  if (parsed.data.winnerName.trim().toLocaleLowerCase() === parsed.data.runnerUpName.trim().toLocaleLowerCase()) {
    res.status(400).json({ error: "Winner and runner-up must be different participants." });
    return;
  }
  if (parsed.data.winnerVotes <= parsed.data.runnerUpVotes) {
    res.status(409).json({ error: "A tied or trailing entry cannot be corrected as the vote winner." });
    return;
  }

  const correctionReason = parsed.data.correctionReason.trim();
  const correction = await db.transaction(async (transaction) => {
    const [current] = await transaction.select().from(contestResultsTable)
      .where(eq(contestResultsTable.id, params.data.id));
    if (!current) return { kind: "missing" as const };
    if (current.status !== "cleared" || !current.clearedAt) return { kind: "not-cleared" as const };
    if (current.emailDeliveryStatus === "sending") return { kind: "conflict" as const };

    const existingHistory = await transaction.select().from(contestResultHistoryTable)
      .where(eq(contestResultHistoryTable.resultId, current.id))
      .orderBy(asc(contestResultHistoryTable.changedAt));
    const correctedAt = new Date(Math.max(Date.now(), current.clearedAt.getTime() + 1));
    const [updated] = await transaction.update(contestResultsTable).set({
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
      clearanceNote: correctionReason,
      clearedAt: correctedAt,
    }).where(and(
      eq(contestResultsTable.id, current.id),
      eq(contestResultsTable.status, "cleared"),
      eq(contestResultsTable.clearedAt, current.clearedAt),
      ne(contestResultsTable.emailDeliveryStatus, "sending"),
    )).returning();
    if (!updated) return { kind: "conflict" as const };

    const history = [...existingHistory];
    if (history.length === 0) {
      const [originalClearance] = await transaction.insert(contestResultHistoryTable).values({
        resultId: current.id,
        changeType: "clearance",
        snapshot: resultSnapshot(current),
        reason: current.clearanceNote ?? "Owner-cleared official result.",
        changedAt: current.clearedAt,
      }).returning();
      history.push(originalClearance);
    }
    const [auditEntry] = await transaction.insert(contestResultHistoryTable).values({
      resultId: updated.id,
      changeType: "correction",
      snapshot: resultSnapshot(updated),
      reason: correctionReason,
      changedAt: correctedAt,
    }).returning();
    history.push(auditEntry);
    return { kind: "corrected" as const, result: updated, history };
  });

  if (correction.kind === "missing") {
    res.status(404).json({ error: "Contest result not found." });
    return;
  }
  if (correction.kind === "not-cleared") {
    res.status(409).json({ error: "Only an owner-cleared result can be corrected." });
    return;
  }
  if (correction.kind === "conflict") {
    res.status(409).json({ error: "This result changed in another session. Refresh before correcting it." });
    return;
  }

  req.log.info({ resultId: correction.result.id }, "Owner corrected official contest result");
  res.json(CorrectStudioContestResultResponse.parse({
    ...encodeResult(correction.result),
    history: correction.history.map(encodeHistory),
  }));
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
  if (["sent", "delivered", "bounced", "complained"].includes(result.emailDeliveryStatus)) {
    res.status(409).json({ error: "This final has already been emailed." });
    return;
  }
  if (result.emailDeliveryStatus === "sending") {
    res.status(409).json({ error: "This final is already being emailed." });
    return;
  }

  const recipient = process.env.CONTEST_RESULTS_EMAIL_TO?.trim();
  const sender = process.env.CONTEST_RESULTS_EMAIL_FROM?.trim();
  if (!recipient) {
    res.status(503).json({ error: "The results email recipient is not configured. No email was sent." });
    return;
  }
  if (!sender) {
    res.status(503).json({ error: "The results email sender is not configured. No email was sent." });
    return;
  }

  const [claimed] = await db.update(contestResultsTable).set({
    emailDeliveryStatus: "sending",
    emailSentAt: null,
    emailDeliveryError: null,
    emailProviderId: null,
    emailLastWebhookEventId: null,
    emailLastWebhookAt: null,
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

    let providerResponse: unknown;
    try {
      providerResponse = await response.json();
    } catch {
      providerResponse = null;
    }
    const providerEmailId = providerResponse && typeof providerResponse === "object" &&
      "id" in providerResponse && typeof providerResponse.id === "string"
      ? providerResponse.id
      : null;
    if (!providerEmailId) {
      await db.update(contestResultsTable).set({
        emailDeliveryStatus: "failed",
        emailDeliveryError: "The email service accepted the request without a trackable message ID.",
      }).where(and(
        eq(contestResultsTable.id, claimed.id),
        eq(contestResultsTable.emailDeliveryStatus, "sending"),
      ));
      res.status(502).json({ error: "The email service did not return a trackable message ID." });
      return;
    }

    const [sent] = await db.update(contestResultsTable).set({
      emailDeliveryStatus: "sent",
      emailSentAt: new Date(),
      emailDeliveryError: null,
      emailProviderId: providerEmailId,
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
