import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  creatorMotionOrdersTable,
  db,
  moveSubmissionsTable,
} from "@workspace/db";
import {
  CreateCreatorMotionCardCheckoutBody,
  CreateCreatorMotionCardCheckoutParams,
  CreateCreatorMotionCardCheckoutResponse,
  GetCreatorCardAccessBody,
  GetCreatorCardAccessParams,
  GetCreatorCardAccessResponse,
  ListCreatorMotionRefundRequestsResponse,
  RequestCreatorMotionRefundBody,
  RequestCreatorMotionRefundParams,
  RequestCreatorMotionRefundResponse,
  RetryCreatorMotionRefundNotificationParams,
  RetryCreatorMotionRefundNotificationResponse,
  ResolveCreatorMotionRefundRequestBody,
  ResolveCreatorMotionRefundRequestParams,
  ResolveCreatorMotionRefundRequestResponse,
  RetryCreatorMotionGenerationBody,
  RetryCreatorMotionGenerationParams,
  RetryCreatorMotionGenerationResponse,
} from "@workspace/api-zod";
import { getWhopClient } from "../lib/whop-client";
import { RefundQueueChecks } from "../lib/refund-queue-checks";
import { paymentMatchesBasePrice } from "../lib/whop-payment-amounts";
import { isStudioOwner } from "./studio";
import {
  creatorMotionOffer,
  creatorMotionVideoUrl,
  refreshCreatorMotionGeneration,
  startCreatorMotionGeneration,
  verifyCreatorMotionVideoTicket,
} from "../lib/creator-motion-generation";
import { creatorMotionVideoFile } from "../lib/studio-object-storage";

const router: IRouter = Router();
const rateWindows = new Map<string, { count: number; resetAt: number }>();
let approvedPlanCache: { key: string; ready: boolean; checkedAt: number } | undefined;

type WhopPayment = {
  id?: string;
  status?: string;
  subtotal?: number | string | null;
  total?: number | string | null;
  tax_amount?: number | string | null;
  currency?: string;
  checkout_configuration_id?: string | null;
  refunded_amount?: number | string | null;
  created_at?: string | null;
  company?: { id?: string } | null;
  user?: { email?: string | null } | null;
};

type WhopCheckout = {
  id?: string;
  purchase_url?: string;
};

type WhopCheckoutConfiguration = {
  id?: string;
  metadata?: Record<string, unknown> | null;
};

type WhopVariant = {
  id?: string;
  company?: { id?: string } | null;
  initial_price?: number | string;
  currency?: string;
  plan_type?: string;
  billing_period?: number | null;
  collect_tax?: boolean;
  adaptive_pricing_enabled?: boolean;
};

const staleCheckoutReservationMs = 5 * 60_000;
const staleRefundProcessingMs = 120_000;
const refundQueueChecks = new RefundQueueChecks();

function withinRateLimit(req: Request, res: Response, limit: number): boolean {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  let bucket = rateWindows.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + 60_000 };
    rateWindows.set(ip, bucket);
  }
  bucket.count += 1;
  if (rateWindows.size > 5000) {
    for (const [key, value] of rateWindows) {
      if (value.resetAt <= now) rateWindows.delete(key);
    }
  }
  if (bucket.count <= limit) return true;
  res.status(429).json({ error: "Please wait a moment before trying again." });
  return false;
}

function creatorTokenMatches(storedHash: string | null, token: string): boolean {
  if (!storedHash || token.length < 43 || token.length > 128) return false;
  const actualHash = createHash("sha256").update(token).digest();
  const expectedHash = Buffer.from(storedHash, "hex");
  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
}

function whopConfiguration(): { companyId: string; planId: string } | null {
  const companyId = process.env.WHOP_COMPANY_ID ?? "";
  const planId = process.env.WHOP_PLAN_ID ?? "";
  if (!/^biz_[A-Za-z0-9]+$/.test(companyId) || !/^plan_[A-Za-z0-9]+$/.test(planId)) return null;
  return { companyId, planId };
}

async function whopJson<T>(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
): Promise<T> {
  const response = await getWhopClient().request(path, init);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("Whop request failed.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

async function whopPlanMatchesApprovedOffer(
  companyId: string,
  planId: string,
  priceUsd: number,
  forceRefresh = false,
): Promise<boolean> {
  const key = `${companyId}:${planId}:${priceUsd.toFixed(2)}`;
  if (!forceRefresh && approvedPlanCache?.key === key && Date.now() - approvedPlanCache.checkedAt < 30_000) {
    return approvedPlanCache.ready;
  }
  try {
    const plan = await whopJson<WhopVariant>(
      `/api/v1/plans/${encodeURIComponent(planId)}`,
      { method: "GET" },
    );
    const ready = plan.id === planId
      && plan.company?.id === companyId
      && plan.plan_type === "one_time"
      && plan.billing_period === null
      && plan.currency?.toLowerCase() === "usd"
      && typeof plan.collect_tax === "boolean"
      && plan.adaptive_pricing_enabled === false
      && Number.isFinite(Number(plan.initial_price))
      && Math.round(Number(plan.initial_price) * 100) === Math.round(priceUsd * 100);
    approvedPlanCache = { key, ready, checkedAt: Date.now() };
    return ready;
  } catch {
    approvedPlanCache = { key, ready: false, checkedAt: Date.now() };
    return false;
  }
}

function safeReturnUrl(req: Request, id: string, token: string): string | null {
  const origin = req.get("origin");
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || req.get("host");
  if (!origin || !requestHost) return null;
  try {
    const parsedOrigin = new URL(origin);
    if (
      parsedOrigin.protocol !== "https:"
      && !(process.env.NODE_ENV === "development" && parsedOrigin.protocol === "http:")
    ) return null;
    if (parsedOrigin.host.toLowerCase() !== requestHost.toLowerCase()) return null;
    const basePath = (process.env.BASE_PATH ?? "/").replace(/\/+$/, "");
    const path = `${basePath}/creator-cards/${encodeURIComponent(id)}` || `/creator-cards/${encodeURIComponent(id)}`;
    const redirect = new URL(path.startsWith("/") ? path : `/${path}`, parsedOrigin.origin);
    redirect.hash = new URLSearchParams({ token }).toString();
    return redirect.toString();
  } catch {
    return null;
  }
}

function privateCard(row: typeof moveSubmissionsTable.$inferSelect) {
  return {
    id: row.id,
    displayName: row.displayName,
    handle: row.handle,
    sport: row.sport,
    moveName: row.moveName,
    team: row.team,
    design: row.design as "holo" | "court",
  };
}

async function readOrder(submissionId: string) {
  const [order] = await db.select().from(creatorMotionOrdersTable)
    .where(eq(creatorMotionOrdersTable.submissionId, submissionId));
  return order ?? null;
}

async function findVerifiedPayment(
  order: NonNullable<Awaited<ReturnType<typeof readOrder>>>,
  companyId: string,
): Promise<WhopPayment | null> {
  if (!order.checkoutConfigurationId) return null;
  const query = new URLSearchParams({
    company_id: companyId,
    first: "20",
  });
  query.append("checkout_configuration_ids[]", order.checkoutConfigurationId);
  query.append("statuses[]", "paid");
  const payload = await whopJson<{ data?: WhopPayment[] }>(
    `/api/v1/payments?${query.toString()}`,
    { method: "GET" },
  );
  const payment = payload.data?.find((item) =>
    item.checkout_configuration_id === order.checkoutConfigurationId
    && item.company?.id === companyId
    && item.status === "paid"
    && item.currency?.toLowerCase() === "usd"
    && order.priceUsd !== null
    && paymentMatchesBasePrice(item, order.priceUsd)
    && Number(item.refunded_amount ?? 0) === 0
    && typeof item.id === "string",
  );
  return payment ?? null;
}

async function findExistingCheckoutConfiguration(
  order: NonNullable<Awaited<ReturnType<typeof readOrder>>>,
  companyId: string,
  planId: string,
): Promise<string | null> {
  const query = new URLSearchParams({
    company_id: companyId,
    plan_id: planId,
    created_after: order.createdAt.toISOString(),
    direction: "desc",
    first: "100",
  });
  let pagesRead = 0;
  while (pagesRead < 25) {
    const payload = await whopJson<{
      data?: WhopCheckoutConfiguration[];
      page_info?: { has_next_page?: boolean; end_cursor?: string | null };
    }>(`/api/v1/checkout_configurations?${query.toString()}`, { method: "GET" });
    if (!Array.isArray(payload.data) || typeof payload.page_info?.has_next_page !== "boolean") {
      throw new Error("Whop returned an unreadable checkout configuration list.");
    }
    const match = payload.data.find((checkout) =>
      checkout.metadata?.source === "signature-move-showdown"
      && checkout.metadata?.submission_id === order.submissionId,
    );
    if (match) {
      if (typeof match.id !== "string" || !match.id) {
        throw new Error("Whop returned a checkout configuration without an ID.");
      }
      return match.id;
    }
    if (!payload.page_info.has_next_page) return null;
    if (typeof payload.page_info.end_cursor !== "string" || !payload.page_info.end_cursor) {
      throw new Error("Whop returned incomplete checkout configuration pagination.");
    }
    query.set("after", payload.page_info.end_cursor);
    pagesRead += 1;
  }
  throw new Error("Whop checkout configuration lookup exceeded its safe page limit.");
}

async function readVerifiedStoredPayment(
  order: NonNullable<Awaited<ReturnType<typeof readOrder>>>,
  companyId: string,
): Promise<WhopPayment | null> {
  if (!order.paymentId || !order.checkoutConfigurationId || order.priceUsd === null) return null;
  const payment = await whopJson<WhopPayment>(
    `/api/v1/payments/${encodeURIComponent(order.paymentId)}`,
    { method: "GET" },
  );
  const refundedAmount = Number(payment.refunded_amount ?? 0);
  if (
    payment.id !== order.paymentId
    || payment.company?.id !== companyId
    || payment.checkout_configuration_id !== order.checkoutConfigurationId
    || (payment.status !== "paid" && !(refundedAmount > 0))
    || payment.currency?.toLowerCase() !== "usd"
    || !paymentMatchesBasePrice(payment, order.priceUsd)
    || !Number.isFinite(refundedAmount)
    || refundedAmount < 0
    || Math.round(refundedAmount * 100) > Math.round(Number(payment.total) * 100)
  ) return null;
  return payment;
}

async function readCurrentlyPaidStoredPayment(
  order: NonNullable<Awaited<ReturnType<typeof readOrder>>>,
  companyId: string,
): Promise<WhopPayment | null> {
  const payment = await readVerifiedStoredPayment(order, companyId);
  if (
    !payment
    || payment.status !== "paid"
    || Number(payment.refunded_amount ?? 0) !== 0
  ) return null;
  return payment;
}

type RefundNotificationStatus = "sent" | "failed" | "not_sent";
type StoredRefundNotificationStatus = RefundNotificationStatus | "sending";

async function notifyCreatorRefundResolution(
  req: Request,
  order: NonNullable<Awaited<ReturnType<typeof readOrder>>>,
  status: "completed" | "declined" | "partial_resolved",
  companyId: string,
  verifiedPayment?: WhopPayment,
): Promise<RefundNotificationStatus> {
  const sender = process.env.CONTEST_RESULTS_EMAIL_FROM?.trim();
  if (!sender) {
    req.log.warn({ submissionId: order.submissionId }, "Creator refund notification skipped because the email sender is not configured");
    return "not_sent";
  }

  try {
    const payment = verifiedPayment ?? await readVerifiedStoredPayment(order, companyId);
    const recipient = payment?.user?.email?.trim();
    if (!recipient || recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      req.log.warn({ submissionId: order.submissionId }, "Creator refund notification skipped because the verified payment has no usable email");
      return "not_sent";
    }

    const response = await new ReplitConnectors().proxy("resend", "/emails", {
      method: "POST",
      headers: { "Idempotency-Key": `creator-refund-${order.submissionId}-${status}` },
      body: {
        from: sender,
        to: recipient,
        subject: "Update on your creator reel refund request",
        text: status === "completed"
          ? "Your refund request for the optional creator reel has been completed."
          : status === "partial_resolved"
            ? `The owner reviewed your refund request. Whop confirmed a partial refund of $${(order.refundVerifiedAmountUsd ?? 0).toFixed(2)} USD; this is not a full refund.`
            : "Your refund request for the optional creator reel has been declined.",
      },
    });
    if (!response.ok) {
      req.log.warn({ submissionId: order.submissionId, statusCode: response.status }, "Creator refund notification was rejected by the email service");
      return "failed";
    }
    return "sent";
  } catch (error) {
    req.log.warn({
      submissionId: order.submissionId,
      providerStatus: (error as { status?: number }).status,
    }, "Creator refund notification could not be sent");
    return "failed";
  }
}

async function sendClaimedCompletedRefundNotification(
  req: Request,
  order: NonNullable<Awaited<ReturnType<typeof readOrder>>>,
  companyId: string,
  verifiedPayment?: WhopPayment,
): Promise<RefundNotificationStatus> {
  const notificationStatus = await notifyCreatorRefundResolution(
    req,
    order,
    "completed",
    companyId,
    verifiedPayment,
  );
  try {
    await db.update(creatorMotionOrdersTable)
      .set({ refundNotificationStatus: notificationStatus })
      .where(eq(creatorMotionOrdersTable.submissionId, order.submissionId));
  } catch (error) {
    req.log.warn({
      submissionId: order.submissionId,
      providerStatus: (error as { status?: number }).status,
    }, "Unable to save creator refund notification status");
  }
  return notificationStatus;
}

function refundRequestStatus(
  value: string | undefined,
): "none" | "requested" | "processing" | "partial_review" | "partial_resolved" | "completed" | "declined" {
  return value === "requested" || value === "processing" || value === "partial_review"
    || value === "partial_resolved" || value === "completed" || value === "declined"
    ? value
    : "none";
}

async function recordPartialRefund(submissionId: string, refundedAmountUsd: number) {
  const [updated] = await db.update(creatorMotionOrdersTable)
    .set({
      refundRequestStatus: "partial_review",
      refundVerifiedAmountUsd: refundedAmountUsd,
      refundProcessingAt: null,
    })
    .where(and(
      eq(creatorMotionOrdersTable.submissionId, submissionId),
      eq(creatorMotionOrdersTable.refundRequestStatus, "processing"),
    ))
    .returning();
  return updated ?? null;
}

async function reopenRefundRequest(submissionId: string) {
  const [updated] = await db.update(creatorMotionOrdersTable)
    .set({ refundRequestStatus: "requested", refundProcessingAt: null })
    .where(and(
      eq(creatorMotionOrdersTable.submissionId, submissionId),
      eq(creatorMotionOrdersTable.refundRequestStatus, "processing"),
    ))
    .returning();
  return updated ?? null;
}

type StalledRefundReconciliation =
  | { outcome: "not_stale" | "unverified" | "unchanged" | "changed"; order: NonNullable<Awaited<ReturnType<typeof readOrder>>> }
  | {
      outcome: "completed";
      order: NonNullable<Awaited<ReturnType<typeof readOrder>>>;
      notificationStatus: RefundNotificationStatus;
    }
  | { outcome: "partial_review"; order: NonNullable<Awaited<ReturnType<typeof readOrder>>> };

async function reconcileStalledRefund(
  order: NonNullable<Awaited<ReturnType<typeof readOrder>>>,
  companyId: string,
  req: Request,
): Promise<StalledRefundReconciliation> {
  const processingAt = order.refundProcessingAt?.getTime() ?? 0;
  if (
    refundRequestStatus(order.refundRequestStatus) !== "processing"
    || Date.now() - processingAt < staleRefundProcessingMs
    || order.priceUsd === null
  ) return { outcome: "not_stale", order };

  // Persist the attempt before contacting Whop so failures still have a timestamp.
  const [checkedOrder] = await db.update(creatorMotionOrdersTable)
    .set({ refundStatusCheckedAt: new Date() })
    .where(and(
      eq(creatorMotionOrdersTable.submissionId, order.submissionId),
      eq(creatorMotionOrdersTable.refundRequestStatus, "processing"),
    ))
    .returning();
  if (!checkedOrder) return { outcome: "changed", order: (await readOrder(order.submissionId)) ?? order };
  order = checkedOrder;
  const payment = await readVerifiedStoredPayment(order, companyId);
  if (!payment) return { outcome: "unverified", order };
  const refunded = Number(payment.refunded_amount ?? 0);
  if (Math.round(refunded * 100) >= Math.round(Number(payment.total) * 100)) {
    const [completed] = await db.update(creatorMotionOrdersTable)
      .set({
        refundRequestStatus: "completed",
        refundProcessingAt: null,
        refundNotificationStatus: "sending",
      })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, order.submissionId),
        eq(creatorMotionOrdersTable.refundRequestStatus, "processing"),
      ))
      .returning();
    if (!completed) return { outcome: "changed", order: (await readOrder(order.submissionId)) ?? order };
    const notificationStatus = await sendClaimedCompletedRefundNotification(
      req,
      completed,
      companyId,
      payment,
    );
    return { outcome: "completed", order: completed, notificationStatus };
  }
  if (refunded > 0) {
    const partial = await recordPartialRefund(order.submissionId, refunded);
    return partial
      ? { outcome: "partial_review", order: partial }
      : { outcome: "changed", order: (await readOrder(order.submissionId)) ?? order };
  }
  const reopened = await reopenRefundRequest(order.submissionId);
  return reopened
    ? { outcome: "unchanged", order: reopened }
    : { outcome: "changed", order: (await readOrder(order.submissionId)) ?? order };
}

async function refreshOrderStatus(
  order: NonNullable<Awaited<ReturnType<typeof readOrder>>>,
  companyId: string,
) {
  if (order.status === "paid") return order;
  if (order.status !== "pending") return order;
  const payment = await findVerifiedPayment(order, companyId);
  if (!payment?.id) return order;
  const [updated] = await db.update(creatorMotionOrdersTable)
    .set({
      status: "paid",
      paymentId: payment.id,
      paidAt: payment.created_at ? new Date(payment.created_at) : new Date(),
    })
    .where(and(
      eq(creatorMotionOrdersTable.submissionId, order.submissionId),
      eq(creatorMotionOrdersTable.status, "pending"),
    ))
    .returning();
  return updated ?? (await readOrder(order.submissionId)) ?? order;
}

async function authorizedSubmission(
  id: string,
  token: string,
  res: Response,
) {
  const [row] = await db.select().from(moveSubmissionsTable)
    .where(eq(moveSubmissionsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Submission not found." });
    return null;
  }
  if (!creatorTokenMatches(row.creatorTokenHash, token)) {
    res.status(403).json({ error: "This private creator link is invalid." });
    return null;
  }
  return row;
}

router.post("/creator-cards/:id/access", async (req, res): Promise<void> => {
  if (!withinRateLimit(req, res, 60)) return;
  const params = GetCreatorCardAccessParams.safeParse(req.params);
  const body = GetCreatorCardAccessBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid private creator link is required." });
    return;
  }
  const row = await authorizedSubmission(params.data.id, body.data.creatorToken, res);
  if (!row) return;

  let motionStatus: "unavailable" | "not_purchased" | "checkout_pending" | "paid" = "unavailable";
  const config = whopConfiguration();
  const offer = creatorMotionOffer();
  const offerAvailable = row.status === "approved"
    && offer.available
    && offer.priceUsd !== null
    && Boolean(config && await whopPlanMatchesApprovedOffer(config.companyId, config.planId, offer.priceUsd));
  let order = await readOrder(row.id);
  if (
    row.status === "approved"
    && order
    && config
    && refundRequestStatus(order.refundRequestStatus) === "processing"
    && (order.refundProcessingAt?.getTime() ?? 0) <= Date.now() - staleRefundProcessingMs
  ) {
    try {
      order = (await reconcileStalledRefund(order, config.companyId, req)).order;
    } catch (error) {
      req.log.warn(
        { submissionId: row.id, providerStatus: (error as { status?: number }).status },
        "Unable to reconcile creator refund during private card access",
      );
    }
  }
  if (row.status === "approved" && order && config && order.status === "pending") {
    try {
      order = await refreshOrderStatus(order, config.companyId);
    } catch (error) {
      const status = (error as { status?: number }).status;
      req.log.warn({ submissionId: row.id, providerStatus: status }, "Unable to verify creator-reel payment");
      res.status(503).json({ error: "Payment status could not be verified. Please try again." });
      return;
    }
  }
  let paymentCurrentlyPaid = false;
  if (
    row.status === "approved"
    && order?.status === "paid"
    && refundRequestStatus(order.refundRequestStatus) !== "partial_review"
    && refundRequestStatus(order.refundRequestStatus) !== "partial_resolved"
  ) {
    if (!config) {
      res.status(503).json({ error: "Payment status could not be verified. Please try again." });
      return;
    }
    try {
      paymentCurrentlyPaid = Boolean(await readCurrentlyPaidStoredPayment(order, config.companyId));
    } catch (error) {
      req.log.warn({ submissionId: row.id, providerStatus: (error as { status?: number }).status }, "Unable to verify creator-reel payment before access");
      res.status(503).json({ error: "Payment status could not be verified. Please try again." });
      return;
    }
  }
  if (row.status === "approved" && order?.status === "paid" && paymentCurrentlyPaid) {
    if (order.generationStatus === "not_started") {
      await startCreatorMotionGeneration(row);
      order = await readOrder(row.id);
    } else {
      order = await refreshCreatorMotionGeneration(order);
    }
  }
  if (order?.status === "paid" && paymentCurrentlyPaid) motionStatus = "paid";
  else if (order?.status === "paid") motionStatus = "unavailable";
  else if (order?.status === "pending" || order?.status === "creating") motionStatus = "checkout_pending";
  else if (row.status === "approved" && offerAvailable) motionStatus = "not_purchased";

  const purchaseOfferAvailable = offerAvailable && order?.status !== "paid";
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.json(GetCreatorCardAccessResponse.parse({
    submissionStatus: row.status,
    motionStatus,
    offerAvailable: purchaseOfferAvailable,
    priceUsd: purchaseOfferAvailable ? offer.priceUsd : null,
    generationStatus: order?.generationStatus ?? "not_started",
    generationError: order?.generationError ?? null,
    motionVideoUrl: paymentCurrentlyPaid && order?.generationStatus === "succeeded" ? creatorMotionVideoUrl(row.id) : null,
    refundRequestStatus: refundRequestStatus(order?.refundRequestStatus),
    refundVerifiedAmountUsd: order?.refundVerifiedAmountUsd ?? null,
    refundRequestedAt: order?.refundRequestedAt ?? null,
    refundRequestAllowed: Boolean(
      order?.status === "paid"
      && paymentCurrentlyPaid
      && order.generationStatus === "failed"
      && order.generationRetryCount >= 1
      && refundRequestStatus(order.refundRequestStatus) === "none",
    ),
    card: row.status === "approved" ? privateCard(row) : null,
  }));
});

router.post("/creator-cards/:id/checkout", async (req, res): Promise<void> => {
  if (!withinRateLimit(req, res, 8)) return;
  const params = CreateCreatorMotionCardCheckoutParams.safeParse(req.params);
  const body = CreateCreatorMotionCardCheckoutBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid private creator link is required." });
    return;
  }
  const row = await authorizedSubmission(params.data.id, body.data.creatorToken, res);
  if (!row) return;
  if (row.status !== "approved") {
    res.status(409).json({ error: "Only approved cards can purchase the optional creator reel." });
    return;
  }
  const offer = creatorMotionOffer();
  if (!offer.available || offer.priceUsd === null) {
    res.status(503).json({ error: "Creator-reel sales are not enabled. The owner must approve Whop and the final price first." });
    return;
  }
  if (!body.data.confirmPurchase || Math.round(body.data.approvedPriceUsd * 100) !== Math.round(offer.priceUsd * 100)) {
    res.status(409).json({ error: "Confirm the current final price before checkout." });
    return;
  }
  const config = whopConfiguration();
  if (!config) {
    res.status(503).json({ error: "The approved Whop checkout is not configured yet." });
    return;
  }
  const planReady = await whopPlanMatchesApprovedOffer(config.companyId, config.planId, offer.priceUsd, true);
  if (!planReady) {
    res.status(503).json({ error: "The approved Whop plan could not be verified at the exact one-time USD price. No checkout was created." });
    return;
  }

  let order = await readOrder(row.id);
  let isStaleReservationRecovery = false;
  if (order) {
    try {
      order = await refreshOrderStatus(order, config.companyId);
    } catch (error) {
      const status = (error as { status?: number }).status;
      req.log.warn({ submissionId: row.id, providerStatus: status }, "Unable to verify motion-card payment before checkout");
      res.status(503).json({ error: "Payment status could not be verified. Please try again." });
      return;
    }
    if (order.status === "paid") {
      res.json(CreateCreatorMotionCardCheckoutResponse.parse({
        motionStatus: "paid",
        checkoutUrl: null,
        priceUsd: order.priceUsd ?? offer.priceUsd,
      }));
      return;
    }
    if (order.status === "pending" && order.checkoutUrl) {
      if (order.priceUsd === null || Math.round(order.priceUsd * 100) !== Math.round(offer.priceUsd * 100)) {
        res.status(409).json({ error: "A previous checkout has a different price. Do not complete it; contact the owner for help." });
        return;
      }
      res.json(CreateCreatorMotionCardCheckoutResponse.parse({
        motionStatus: "checkout_pending",
        checkoutUrl: order.checkoutUrl,
        priceUsd: order.priceUsd,
      }));
      return;
    }
    if (order.status === "creating") {
      const reservationIsStale = order.createdAt.getTime() <= Date.now() - staleCheckoutReservationMs;
      if (!reservationIsStale) {
        res.status(409).json({ error: "Checkout is being prepared. Please try again shortly." });
        return;
      }
      isStaleReservationRecovery = true;
      try {
        const existingCheckoutId = await findExistingCheckoutConfiguration(
          order,
          config.companyId,
          config.planId,
        );
        if (existingCheckoutId && order.priceUsd !== null
          && Math.round(order.priceUsd * 100) !== Math.round(offer.priceUsd * 100)) {
          res.status(409).json({ error: "A previous checkout has a different price. Do not complete it; contact the owner for help." });
          return;
        }
        // The existing idempotency key reuses a checkout Whop already created.
        // Keep its ID as an expectation so a different session cannot overwrite
        // the stale reservation's provider mapping.
        order = { ...order, checkoutConfigurationId: existingCheckoutId };
      } catch (error) {
        req.log.warn({
          submissionId: row.id,
          providerStatus: (error as { status?: number }).status,
        }, "Unable to reconcile stale motion-card checkout");
        res.status(503).json({ error: "Checkout status could not be verified. Please try again." });
        return;
      }
    }
    const [reopened] = await db.update(creatorMotionOrdersTable)
      .set({ status: "creating", priceUsd: offer.priceUsd })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, row.id),
        eq(creatorMotionOrdersTable.status, "failed"),
      ))
      .returning();
    if (!reopened && order.status === "failed") {
      res.status(409).json({ error: "Checkout is being prepared. Please try again shortly." });
      return;
    }
    if (reopened) order = reopened;
  } else {
    const [created] = await db.insert(creatorMotionOrdersTable)
      .values({ submissionId: row.id, status: "creating", priceUsd: offer.priceUsd })
      .onConflictDoNothing()
      .returning();
    order = created ?? await readOrder(row.id);
    if (!order) {
      res.status(503).json({ error: "Checkout could not be prepared. Please try again." });
      return;
    }
    if (!created && order.status === "creating") {
      res.status(409).json({ error: "Checkout is being prepared. Please try again shortly." });
      return;
    }
  }

  const redirectUrl = safeReturnUrl(req, row.id, body.data.creatorToken);
  if (!redirectUrl) {
    await db.update(creatorMotionOrdersTable)
      .set({ status: "failed" })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, row.id),
        eq(creatorMotionOrdersTable.status, "creating"),
      ));
    res.status(400).json({ error: "The checkout return address could not be verified." });
    return;
  }

  try {
    const checkout = await whopJson<WhopCheckout>("/api/v1/checkout_configurations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `creator-motion-${row.id}`,
      },
      body: JSON.stringify({
        plan_id: config.planId,
        redirect_url: redirectUrl,
        mode: "payment",
        metadata: { source: "signature-move-showdown", submission_id: row.id },
      }),
    });
    if (!checkout.id || !checkout.purchase_url) {
      throw new Error("Whop did not return a hosted checkout link.");
    }
    if (order.checkoutConfigurationId && checkout.id !== order.checkoutConfigurationId) {
      throw new Error("Whop returned a different checkout than the existing session.");
    }
    const [updated] = await db.update(creatorMotionOrdersTable)
      .set({
        checkoutConfigurationId: checkout.id,
        checkoutUrl: checkout.purchase_url,
        status: "pending",
        priceUsd: offer.priceUsd,
      })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, row.id),
        eq(creatorMotionOrdersTable.status, "creating"),
      ))
      .returning();
    if (!updated) throw new Error("The checkout mapping could not be saved.");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json(CreateCreatorMotionCardCheckoutResponse.parse({
      motionStatus: "checkout_pending",
      checkoutUrl: updated.checkoutUrl,
      priceUsd: offer.priceUsd,
    }));
  } catch (error) {
    const status = (error as { status?: number }).status;
    req.log.error({ submissionId: row.id, providerStatus: status }, "Unable to create hosted motion-card checkout");
    if (!isStaleReservationRecovery) {
      await db.update(creatorMotionOrdersTable)
        .set({ status: "failed" })
        .where(and(
          eq(creatorMotionOrdersTable.submissionId, row.id),
          eq(creatorMotionOrdersTable.status, "creating"),
        ));
    }
    res.status(503).json({ error: "Optional motion-card checkout could not be started. Please try again." });
  }
});

router.post("/creator-cards/:id/motion/retry", async (req, res): Promise<void> => {
  if (!withinRateLimit(req, res, 8)) return;
  const params = RetryCreatorMotionGenerationParams.safeParse(req.params);
  const body = RetryCreatorMotionGenerationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid private creator link is required." });
    return;
  }
  const row = await authorizedSubmission(params.data.id, body.data.creatorToken, res);
  if (!row) return;
  if (row.status !== "approved") {
    res.status(409).json({ error: "Only approved creator reels can be generated." });
    return;
  }
  const order = await readOrder(row.id);
  if (!order || order.status !== "paid") {
    res.status(409).json({ error: "A verified payment is required before generation or retry." });
    return;
  }
  if (order.generationStatus !== "failed") {
    res.status(409).json({ error: "Only a failed generation can be retried." });
    return;
  }
  if (refundRequestStatus(order.refundRequestStatus) !== "none") {
    res.status(409).json({ error: "Generation cannot be retried while a refund request is active or resolved." });
    return;
  }
  const [reset] = await db.update(creatorMotionOrdersTable)
    .set({
      generationStatus: "not_started",
      generationError: null,
      generationRetryCount: order.generationRetryCount + 1,
    })
    .where(and(
      eq(creatorMotionOrdersTable.submissionId, row.id),
      eq(creatorMotionOrdersTable.status, "paid"),
      eq(creatorMotionOrdersTable.generationStatus, "failed"),
    ))
    .returning();
  if (!reset) {
    res.status(409).json({ error: "The reel state changed. Refresh the page and try again." });
    return;
  }
  const started = await startCreatorMotionGeneration(row);
  const currentOrder = started ?? await readOrder(row.id);
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.json(RetryCreatorMotionGenerationResponse.parse({
    submissionStatus: row.status,
    motionStatus: "paid",
    offerAvailable: false,
    priceUsd: null,
    generationStatus: currentOrder?.generationStatus ?? "failed",
    generationError: currentOrder?.generationError ?? "The reel could not be started.",
    motionVideoUrl: currentOrder?.generationStatus === "succeeded" ? creatorMotionVideoUrl(row.id) : null,
    refundRequestStatus: refundRequestStatus(currentOrder?.refundRequestStatus),
    refundVerifiedAmountUsd: currentOrder?.refundVerifiedAmountUsd ?? null,
    refundRequestedAt: currentOrder?.refundRequestedAt ?? null,
    refundRequestAllowed: false,
    card: privateCard(row),
  }));
});

router.post("/creator-cards/:id/refund-request", async (req, res): Promise<void> => {
  if (!withinRateLimit(req, res, 5)) return;
  const params = RequestCreatorMotionRefundParams.safeParse(req.params);
  const body = RequestCreatorMotionRefundBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid private creator link is required." });
    return;
  }
  const row = await authorizedSubmission(params.data.id, body.data.creatorToken, res);
  if (!row) return;
  const order = await readOrder(row.id);
  if (!order || order.status !== "paid" || !order.paymentId) {
    res.status(409).json({ error: "A verified payment is required before requesting a refund." });
    return;
  }
  if (order.generationStatus !== "failed" || order.generationRetryCount < 1) {
    res.status(409).json({ error: "A refund request is available after a paid reel retry fails." });
    return;
  }
  const currentStatus = refundRequestStatus(order.refundRequestStatus);
  if (currentStatus !== "none") {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json(RequestCreatorMotionRefundResponse.parse({
      refundRequestStatus: currentStatus,
        refundVerifiedAmountUsd: order.refundVerifiedAmountUsd ?? null,
      refundRequestedAt: order.refundRequestedAt,
    }));
    return;
  }
  const config = whopConfiguration();
  if (!config) {
    res.status(503).json({ error: "Payment status could not be verified. Please try again." });
    return;
  }
  let payment: WhopPayment | null;
  try {
    payment = await readVerifiedStoredPayment(order, config.companyId);
  } catch (error) {
    req.log.warn({ submissionId: row.id, providerStatus: (error as { status?: number }).status }, "Unable to verify creator refund payment");
    res.status(503).json({ error: "Payment status could not be verified. Please try again." });
    return;
  }
  if (!payment || Number(payment.refunded_amount ?? 0) !== 0) {
    res.status(409).json({ error: "This payment is no longer eligible for a refund request." });
    return;
  }
  const requestedAt = new Date();
  const [updated] = await db.update(creatorMotionOrdersTable)
    .set({ refundRequestStatus: "requested", refundRequestedAt: requestedAt })
    .where(and(
      eq(creatorMotionOrdersTable.submissionId, row.id),
      eq(creatorMotionOrdersTable.status, "paid"),
      eq(creatorMotionOrdersTable.generationStatus, "failed"),
      eq(creatorMotionOrdersTable.generationRetryCount, order.generationRetryCount),
      eq(creatorMotionOrdersTable.refundRequestStatus, "none"),
    ))
    .returning();
  if (!updated) {
    res.status(409).json({ error: "The reel or refund state changed. Refresh the page and try again." });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.json(RequestCreatorMotionRefundResponse.parse({
    refundRequestStatus: "requested",
    refundVerifiedAmountUsd: updated.refundVerifiedAmountUsd ?? null,
    refundRequestedAt: updated.refundRequestedAt,
  }));
});

router.get("/studio/creator-refunds", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner session required." });
    return;
  }
  let orders = await db.select().from(creatorMotionOrdersTable)
    .where(inArray(creatorMotionOrdersTable.refundRequestStatus, ["requested", "processing", "partial_review", "completed"]));
  const staleOrders = orders.filter((order) =>
      refundRequestStatus(order.refundRequestStatus) === "processing"
      && order.priceUsd !== null
      && (order.refundProcessingAt?.getTime() ?? 0) <= Date.now() - staleRefundProcessingMs
  );
  const config = whopConfiguration();
  if (config && staleOrders.length) {
    // Oldest attempted checks go first so a repeatedly unverified row cannot
    // starve the rest of a large queue. Never hold the response for all checks.
    staleOrders.sort((a, b) =>
      (a.refundStatusCheckedAt?.getTime() ?? 0) - (b.refundStatusCheckedAt?.getTime() ?? 0));
    await refundQueueChecks.run(staleOrders.map((order) => ({
      id: order.submissionId,
      check: async () => {
        try {
          await reconcileStalledRefund(order, config.companyId, req);
        } catch (error) {
          req.log.warn(
            { submissionId: order.submissionId, providerStatus: (error as { status?: number }).status },
            "Unable to reconcile creator refund while loading the owner queue",
          );
        }
      },
    })));
    // Includes attempts still in flight and results saved by earlier requests.
    orders = await db.select().from(creatorMotionOrdersTable)
      .where(inArray(creatorMotionOrdersTable.refundRequestStatus, ["requested", "processing", "partial_review", "completed"]));
  }
  const requests = [];
  for (const currentOrder of orders) {
    const statusCheckUnverified = refundRequestStatus(currentOrder.refundRequestStatus) === "processing"
      && (currentOrder.refundProcessingAt?.getTime() ?? 0) <= Date.now() - staleRefundProcessingMs;
    const status = refundRequestStatus(currentOrder.refundRequestStatus);
    const notificationStatus = currentOrder.refundNotificationStatus as StoredRefundNotificationStatus;
    if (
      status !== "requested"
      && status !== "processing"
      && status !== "partial_review"
      && !(status === "completed" && notificationStatus !== "sent")
    ) continue;
    const [submission] = await db.select().from(moveSubmissionsTable)
      .where(eq(moveSubmissionsTable.id, currentOrder.submissionId));
    if (!submission || currentOrder.priceUsd === null || !currentOrder.refundRequestedAt) continue;
    requests.push({
      submissionId: currentOrder.submissionId,
      creatorName: submission.displayName,
      moveName: submission.moveName,
      priceUsd: currentOrder.priceUsd,
      requestedAt: currentOrder.refundRequestedAt,
      refundRequestStatus: status,
      refundVerifiedAmountUsd: currentOrder.refundVerifiedAmountUsd ?? null,
      processingAt: currentOrder.refundProcessingAt,
      statusCheckUnverified,
      statusCheckedAt: currentOrder.refundStatusCheckedAt ?? null,
      notificationStatus,
    });
  }
  requests.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.json(ListCreatorMotionRefundRequestsResponse.parse(requests));
});

router.post("/studio/creator-refunds/:id/notification-retry", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner session required." });
    return;
  }
  const params = RetryCreatorMotionRefundNotificationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "A valid completed refund is required." });
    return;
  }

  const order = await readOrder(params.data.id);
  if (!order || refundRequestStatus(order.refundRequestStatus) !== "completed") {
    res.status(404).json({ error: "Completed refund not found." });
    return;
  }
  if (order.refundNotificationStatus === "sent") {
    res.json(RetryCreatorMotionRefundNotificationResponse.parse({ notificationStatus: "sent" }));
    return;
  }
  if (order.refundNotificationStatus !== "failed") {
    res.status(409).json({ error: "This creator notification is not eligible for retry." });
    return;
  }

  const [claimed] = await db.update(creatorMotionOrdersTable)
    .set({ refundNotificationStatus: "sending" })
    .where(and(
      eq(creatorMotionOrdersTable.submissionId, params.data.id),
      eq(creatorMotionOrdersTable.refundRequestStatus, "completed"),
      eq(creatorMotionOrdersTable.refundNotificationStatus, "failed"),
    ))
    .returning();
  if (!claimed) {
    const latest = await readOrder(params.data.id);
    if (latest?.refundRequestStatus === "completed" && latest.refundNotificationStatus === "sent") {
      res.json(RetryCreatorMotionRefundNotificationResponse.parse({ notificationStatus: "sent" }));
      return;
    }
    res.status(409).json({ error: "This creator notification is already being retried or is no longer eligible." });
    return;
  }

  const config = whopConfiguration();
  if (!config) {
    await db.update(creatorMotionOrdersTable)
      .set({ refundNotificationStatus: "failed" })
      .where(eq(creatorMotionOrdersTable.submissionId, params.data.id));
    res.status(503).json({ error: "Whop could not verify the creator payment details." });
    return;
  }
  try {
    const payment = await readVerifiedStoredPayment(claimed, config.companyId);
    if (!payment) {
      await db.update(creatorMotionOrdersTable)
        .set({ refundNotificationStatus: "failed" })
        .where(eq(creatorMotionOrdersTable.submissionId, params.data.id));
      res.status(503).json({ error: "Whop could not verify the creator payment details." });
      return;
    }
    const notificationStatus = await sendClaimedCompletedRefundNotification(req, claimed, config.companyId, payment);
    res.json(RetryCreatorMotionRefundNotificationResponse.parse({ notificationStatus }));
  } catch (error) {
    await db.update(creatorMotionOrdersTable)
      .set({ refundNotificationStatus: "failed" })
      .where(eq(creatorMotionOrdersTable.submissionId, params.data.id));
    req.log.warn({
      submissionId: params.data.id,
      providerStatus: (error as { status?: number }).status,
    }, "Unable to verify creator refund notification recipient");
    res.status(503).json({ error: "Whop could not verify the creator payment details." });
  }
});

router.post("/studio/creator-refunds/:id/decision", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner session required." });
    return;
  }
  const params = ResolveCreatorMotionRefundRequestParams.safeParse(req.params);
  const body = ResolveCreatorMotionRefundRequestBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid refund decision is required." });
    return;
  }
  const order = await readOrder(params.data.id);
  if (!order || refundRequestStatus(order.refundRequestStatus) === "none") {
    res.status(404).json({ error: "Refund request not found." });
    return;
  }
  const status = refundRequestStatus(order.refundRequestStatus);
  if (body.data.decision === "resolve_partial") {
    if (status !== "partial_review") {
      res.status(409).json({ error: "There is no confirmed partial refund waiting for review." });
      return;
    }
    const verifiedAmount = order.refundVerifiedAmountUsd;
    const partialConfig = whopConfiguration();
    const partialPayment = partialConfig
      ? await readVerifiedStoredPayment(order, partialConfig.companyId).catch(() => null)
      : null;
    if (
      verifiedAmount === null
      || !Number.isFinite(verifiedAmount)
      || verifiedAmount <= 0
      || order.priceUsd === null
      || !partialPayment
      || Math.round(verifiedAmount * 100) !== Math.round(Number(partialPayment.refunded_amount) * 100)
      || Math.round(verifiedAmount * 100) >= Math.round(Number(partialPayment.total) * 100)
    ) {
      res.status(409).json({ error: "The verified partial refund amount is unavailable. Refresh the queue before resolving it." });
      return;
    }
    const [resolved] = await db.update(creatorMotionOrdersTable)
      .set({ refundRequestStatus: "partial_resolved", refundProcessingAt: null })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, params.data.id),
        eq(creatorMotionOrdersTable.refundRequestStatus, "partial_review"),
      ))
      .returning();
    if (!resolved) {
      res.status(409).json({ error: "The refund state changed. Refresh the queue and try again." });
      return;
    }
    const config = whopConfiguration();
    const notificationStatus = config
      ? await notifyCreatorRefundResolution(req, resolved, "partial_resolved", config.companyId)
      : "not_sent";
    res.json(ResolveCreatorMotionRefundRequestResponse.parse({
      refundRequestStatus: "partial_resolved",
      refundVerifiedAmountUsd: resolved.refundVerifiedAmountUsd,
      refundRequestedAt: resolved.refundRequestedAt,
      notificationStatus,
    }));
    return;
  }
  if (status === "partial_review" || status === "partial_resolved") {
    res.status(409).json({
      error: status === "partial_review"
        ? "This payment has a confirmed partial refund. Record its review instead of issuing another refund."
        : "This partial refund has already been reviewed.",
    });
    return;
  }
  if (body.data.decision === "decline") {
    if (status !== "requested") {
      res.status(409).json({ error: "This refund request is already being handled or resolved." });
      return;
    }
    const [declined] = await db.update(creatorMotionOrdersTable)
      .set({ refundRequestStatus: "declined", refundProcessingAt: null })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, params.data.id),
        eq(creatorMotionOrdersTable.refundRequestStatus, "requested"),
      ))
      .returning();
    if (!declined) {
      res.status(409).json({ error: "This refund request is already being handled or resolved." });
      return;
    }
    const config = whopConfiguration();
    const notificationStatus = config
      ? await notifyCreatorRefundResolution(req, order, "declined", config.companyId)
      : "not_sent";
    res.json(ResolveCreatorMotionRefundRequestResponse.parse({
      refundRequestStatus: "declined",
      refundVerifiedAmountUsd: declined.refundVerifiedAmountUsd ?? null,
      refundRequestedAt: declined.refundRequestedAt,
      notificationStatus,
    }));
    return;
  }
  if (status !== "requested" && status !== "processing") {
    res.status(409).json({ error: "This refund request is already resolved." });
    return;
  }
  if (!order.paymentId || !order.checkoutConfigurationId || order.priceUsd === null) {
    res.status(409).json({ error: "The verified Whop payment is not available for this request." });
    return;
  }
  const config = whopConfiguration();
  if (!config) {
    res.status(503).json({ error: "Whop could not complete or verify the refund. The request remains open." });
    return;
  }
  if (status === "processing") {
    if ((order.refundProcessingAt?.getTime() ?? 0) > Date.now() - staleRefundProcessingMs) {
      res.status(409).json({ error: "This refund is still being processed. Refresh the queue shortly." });
      return;
    }
    try {
      const reconciliation = await reconcileStalledRefund(order, config.companyId, req);
      if (reconciliation.outcome === "unverified") {
        res.status(409).json({ error: "Whop could not verify the original payment. The request remains open." });
        return;
      }
      if (reconciliation.outcome === "completed") {
        res.json(ResolveCreatorMotionRefundRequestResponse.parse({
          refundRequestStatus: "completed",
          refundVerifiedAmountUsd: reconciliation.order.refundVerifiedAmountUsd ?? null,
          refundRequestedAt: reconciliation.order.refundRequestedAt,
          notificationStatus: reconciliation.notificationStatus,
        }));
        return;
      }
      if (reconciliation.outcome === "partial_review") {
        const partial = reconciliation.order;
        res.json(ResolveCreatorMotionRefundRequestResponse.parse({
          refundRequestStatus: "partial_review",
          refundVerifiedAmountUsd: partial.refundVerifiedAmountUsd,
          refundRequestedAt: partial.refundRequestedAt,
          notificationStatus: "not_sent",
        }));
        return;
      }
      res.status(409).json({
        error: reconciliation.outcome === "unchanged"
          ? "No refund was recorded. The request is ready for a new decision."
          : "The refund state changed. Refresh the queue and try again.",
      });
      return;
    } catch (error) {
      req.log.warn({ submissionId: params.data.id, providerStatus: (error as { status?: number }).status }, "Unable to reconcile creator refund with Whop");
      res.status(503).json({ error: "Whop refund status could not be verified. The request remains open." });
      return;
    }
  }
  if (status === "requested") {
    const [claimed] = await db.update(creatorMotionOrdersTable)
      .set({ refundRequestStatus: "processing", refundProcessingAt: new Date(), refundStatusCheckedAt: new Date() })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, params.data.id),
        eq(creatorMotionOrdersTable.refundRequestStatus, "requested"),
      ))
      .returning();
    if (!claimed) {
      res.status(409).json({ error: "This refund request is already being handled or resolved." });
      return;
    }
  }
  try {
    const payment = await readVerifiedStoredPayment(order, config.companyId);
    if (!payment) {
      await reopenRefundRequest(params.data.id);
      res.status(409).json({ error: "Whop could not verify the original payment. The request remains open." });
      return;
    }
    const alreadyRefunded = Number(payment.refunded_amount ?? 0);
    if (alreadyRefunded < Number(payment.total)) {
      if (alreadyRefunded !== 0) {
        const partial = await recordPartialRefund(params.data.id, alreadyRefunded);
        if (!partial) {
          res.status(409).json({ error: "The refund state changed. Refresh the queue and try again." });
          return;
        }
        res.json(ResolveCreatorMotionRefundRequestResponse.parse({
          refundRequestStatus: "partial_review",
          refundVerifiedAmountUsd: partial.refundVerifiedAmountUsd,
          refundRequestedAt: partial.refundRequestedAt,
          notificationStatus: "not_sent",
        }));
        return;
      }
      await whopJson<WhopPayment>(
        `/api/v1/payments/${encodeURIComponent(order.paymentId)}/refund`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      );
    }
    await db.update(creatorMotionOrdersTable)
      .set({ refundStatusCheckedAt: new Date() })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, order.submissionId),
        eq(creatorMotionOrdersTable.refundRequestStatus, "processing"),
      ));
    const finalPayment = await whopJson<WhopPayment>(
      `/api/v1/payments/${encodeURIComponent(order.paymentId)}`,
      { method: "GET" },
    );
    const finalRefundedAmount = Number(finalPayment.refunded_amount ?? 0);
    if (
      finalPayment.id !== order.paymentId
      || finalPayment.company?.id !== config.companyId
      || finalPayment.checkout_configuration_id !== order.checkoutConfigurationId
      || finalPayment.currency?.toLowerCase() !== "usd"
      || !paymentMatchesBasePrice(finalPayment, order.priceUsd)
      || Number(finalPayment.total) !== Number(payment.total)
      || !Number.isFinite(finalRefundedAmount)
      || finalRefundedAmount < 0
      || finalRefundedAmount > Number(finalPayment.total)
    ) throw new Error("Whop did not confirm the full refund.");
    if (Math.round(finalRefundedAmount * 100) < Math.round(Number(finalPayment.total) * 100)) {
      if (finalRefundedAmount > 0) {
        const partial = await recordPartialRefund(params.data.id, finalRefundedAmount);
        if (!partial) throw new Error("The refund result could not be recorded for manual review.");
        res.json(ResolveCreatorMotionRefundRequestResponse.parse({
          refundRequestStatus: "partial_review",
          refundVerifiedAmountUsd: partial.refundVerifiedAmountUsd,
          refundRequestedAt: partial.refundRequestedAt,
          notificationStatus: "not_sent",
        }));
        return;
      }
      throw new Error("Whop did not confirm the full refund.");
    }
    const [completed] = await db.update(creatorMotionOrdersTable)
      .set({
        refundRequestStatus: "completed",
        refundProcessingAt: null,
        refundNotificationStatus: "sending",
      })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, params.data.id),
        eq(creatorMotionOrdersTable.refundRequestStatus, "processing"),
      ))
      .returning();
    if (!completed) throw new Error("The refund result could not be recorded.");
    const notificationStatus = await sendClaimedCompletedRefundNotification(req, completed, config.companyId, finalPayment);
    res.json(ResolveCreatorMotionRefundRequestResponse.parse({
      refundRequestStatus: "completed",
      refundVerifiedAmountUsd: completed.refundVerifiedAmountUsd ?? null,
      refundRequestedAt: completed.refundRequestedAt,
      notificationStatus,
    }));
  } catch (error) {
    req.log.error({ submissionId: params.data.id, providerStatus: (error as { status?: number }).status }, "Unable to complete creator refund through Whop");
    res.status(503).json({ error: "Whop could not complete or verify the refund. The request remains open." });
  }
});

router.get("/creator-cards/:id/motion/video", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  const params = GetCreatorCardAccessParams.safeParse(req.params);
  const expires = typeof req.query.expires === "string" ? req.query.expires : "";
  const signature = typeof req.query.signature === "string" ? req.query.signature : "";
  if (!params.success || !verifyCreatorMotionVideoTicket(params.data.id, expires, signature)) {
    res.status(403).json({ error: "This private video link has expired. Refresh your creator page." });
    return;
  }
  const [order] = await db.select().from(creatorMotionOrdersTable)
    .where(eq(creatorMotionOrdersTable.submissionId, params.data.id));
  if (!order || order.status !== "paid" || order.generationStatus !== "succeeded" || !order.generationObjectPath) {
    res.status(404).json({ error: "The generated creator reel is not available." });
    return;
  }
  const config = whopConfiguration();
  if (!config) {
    res.status(503).json({ error: "Payment status could not be verified. Please try again." });
    return;
  }
  try {
    const payment = await readCurrentlyPaidStoredPayment(order, config.companyId);
    if (!payment) {
      res.status(403).json({ error: "This private video is no longer available." });
      return;
    }
  } catch (error) {
    req.log.warn({ submissionId: params.data.id, providerStatus: (error as { status?: number }).status }, "Unable to verify creator-reel payment before playback");
    res.status(503).json({ error: "Payment status could not be verified. Please try again." });
    return;
  }
  try {
    const file = creatorMotionVideoFile(params.data.id);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    if (!Number.isSafeInteger(size) || size <= 0) {
      res.status(404).json({ error: "The generated creator reel is not available." });
      return;
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const invalidRange = () => {
        res.setHeader("Content-Range", `bytes */${size}`);
        res.status(416).end();
      };
      if (!match || (!match[1] && !match[2])) {
        invalidRange();
        return;
      }
      let start: number;
      let end: number;
      if (!match[1]) {
        const suffixLength = BigInt(match[2]);
        if (suffixLength === 0n) {
          invalidRange();
          return;
        }
        start = suffixLength >= BigInt(size) ? 0 : size - Number(suffixLength);
        end = size - 1;
      } else {
        const requestedStart = BigInt(match[1]);
        if (requestedStart >= BigInt(size)) {
          invalidRange();
          return;
        }
        start = Number(requestedStart);
        end = match[2] ? Math.min(Number(BigInt(match[2])), size - 1) : size - 1;
        if (start > end) {
          invalidRange();
          return;
        }
      }
      if (start > end) {
        invalidRange();
        return;
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      res.setHeader("Content-Length", String(end - start + 1));
      file.createReadStream({ start, end }).pipe(res);
      return;
    }
    res.setHeader("Content-Length", String(size));
    file.createReadStream().pipe(res);
  } catch (error) {
    if ((error as { code?: number }).code === 404) {
      res.status(404).json({ error: "The generated creator reel is not available." });
      return;
    }
    req.log.error({ err: error, submissionId: params.data.id }, "Unable to stream private creator reel");
    res.status(500).json({ error: "Unable to stream the generated creator reel." });
  }
});

export default router;
