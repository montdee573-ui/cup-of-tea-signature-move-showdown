import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { db, contestResultsTable } from "@workspace/db";
import { ReplitConnectors } from "@replit/connectors-sdk";

const router: IRouter = Router();
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

type DeliveryStatus = "delivered" | "bounced" | "complained";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function verifyResendSignature(req: Request, rawBody: Buffer): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const webhookId = req.get("svix-id");
  const timestampHeader = req.get("svix-timestamp");
  const signatureHeader = req.get("svix-signature");
  if (!secret?.startsWith("whsec_") || !webhookId || !timestampHeader || !signatureHeader) return false;

  const timestamp = Number(timestampHeader);
  if (!Number.isSafeInteger(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > MAX_SIGNATURE_AGE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.slice("whsec_".length), "base64");
  if (secretBytes.length === 0) return false;
  const expected = createHmac("sha256", secretBytes)
    .update(`${webhookId}.${timestampHeader}.${rawBody.toString("utf8")}`)
    .digest();

  return signatureHeader.split(/\s+/).some((candidate) => {
    const [version, encoded] = candidate.split(",", 2);
    if (version !== "v1" || !encoded) return false;
    let provided: Buffer;
    try {
      provided = Buffer.from(encoded, "base64");
    } catch {
      return false;
    }
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

function parseDeliveryEvent(value: unknown): {
  emailId: string;
  eventAt: Date;
  status: DeliveryStatus;
} | null {
  if (!isRecord(value) || !isRecord(value.data)) return null;
  const statusByType: Record<string, DeliveryStatus> = {
    "email.delivered": "delivered",
    "email.bounced": "bounced",
    "email.complained": "complained",
  };
  const status = typeof value.type === "string" ? statusByType[value.type] : undefined;
  const emailId = value.data.email_id;
  const eventCreatedAt = value.created_at;
  if (!status || typeof emailId !== "string" || !emailId ||
    typeof eventCreatedAt !== "string" || !eventCreatedAt) return null;
  const eventAt = new Date(eventCreatedAt);
  if (!Number.isFinite(eventAt.getTime())) return null;

  return { emailId, status, eventAt };
}

router.post("/webhooks/resend", async (req, res): Promise<void> => {
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Invalid webhook request." });
    return;
  }
  if (!verifyResendSignature(req, req.body)) {
    res.status(401).json({ error: "Invalid webhook signature." });
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid webhook request." });
    return;
  }
  const event = parseDeliveryEvent(payload);
  if (!event) {
    res.status(400).json({ error: "Unsupported or invalid email event." });
    return;
  }
  const webhookEventId = req.get("svix-id");
  if (!webhookEventId) {
    res.status(401).json({ error: "Invalid webhook signature." });
    return;
  }

  const [result] = await db.select().from(contestResultsTable)
    .where(eq(contestResultsTable.emailProviderId, event.emailId));
  if (!result) {
    res.status(404).json({ error: "Email event not found." });
    return;
  }

  const [updated] = await db.update(contestResultsTable).set({
    emailDeliveryStatus: event.status,
    emailLastWebhookEventId: webhookEventId,
    emailLastWebhookAt: event.eventAt,
    emailDeliveryError: null,
  }).where(and(
    eq(contestResultsTable.emailProviderId, event.emailId),
    or(
      isNull(contestResultsTable.emailLastWebhookAt),
      lt(contestResultsTable.emailLastWebhookAt, event.eventAt),
    ),
  )).returning();

  if (updated && (event.status === "bounced" || event.status === "complained")) {
    const ownerEmail = process.env.CONTEST_RESULTS_OWNER_EMAIL?.trim();
    const sender = process.env.CONTEST_RESULTS_EMAIL_FROM?.trim();
    if (!ownerEmail || !sender) {
      req.log.warn(
        { resultId: updated.id },
        "Owner delivery alert skipped because its sender or destination is not configured",
      );
    } else {
      const idempotencySuffix = createHash("sha256").update(webhookEventId).digest("hex");
      try {
        const response = await new ReplitConnectors().proxy("resend", "/emails", {
          method: "POST",
          headers: { "Idempotency-Key": `contest-result-alert-${updated.id}-${idempotencySuffix}` },
          body: {
            from: sender,
            to: ownerEmail,
            subject: `Contest result email ${event.status}: ${updated.eventTitle}`,
            text: [
              `Resend reported that the official result email for ${updated.eventTitle} (${updated.division}) was ${event.status}.`,
              `Event time: ${event.eventAt.toISOString()}`,
              "Review delivery status in the contest results desk.",
            ].join("\n"),
          },
        });
        if (!response.ok) {
          req.log.warn(
            { resultId: updated.id, statusCode: response.status },
            "Owner delivery alert was rejected by the email service",
          );
        }
      } catch {
        req.log.warn({ resultId: updated.id }, "Owner delivery alert could not be sent");
      }
    }
  }

  res.status(204).end();
});

export default router;
