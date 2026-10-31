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
  ResolveCreatorMotionRefundRequestBody,
  ResolveCreatorMotionRefundRequestParams,
  ResolveCreatorMotionRefundRequestResponse,
  RetryCreatorMotionGenerationBody,
  RetryCreatorMotionGenerationParams,
  RetryCreatorMotionGenerationResponse,
} from "@workspace/api-zod";
import { getWhopClient } from "../lib/whop-client";
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
  amount?: number | string;
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

type WhopVariant = {
  id?: string;
  account?: { id?: string } | null;
  initial_price?: number | string;
  currency?: string;
  billing_type?: string;
  billing_period?: number | null;
  collect_tax?: boolean;
  adaptive_pricing_enabled?: boolean;
};

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
      `/api/v1/variants/${encodeURIComponent(planId)}`,
      { method: "GET" },
    );
    const ready = plan.id === planId
      && plan.account?.id === companyId
      && plan.billing_type === "one_time"
      && plan.billing_period === null
      && plan.currency?.toLowerCase() === "usd"
      && plan.collect_tax === false
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
    account_id: companyId,
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
    && item.status === "paid"
    && item.currency?.toLowerCase() === "usd"
    && order.priceUsd !== null
    && Number.isFinite(Number(item.amount))
    && Math.round(Number(item.amount) * 100) === Math.round(order.priceUsd * 100)
    && Number(item.refunded_amount ?? 0) === 0
    && typeof item.id === "string",
  );
  return payment ?? null;
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
  if (
    payment.id !== order.paymentId
    || payment.company?.id !== companyId
    || payment.checkout_configuration_id !== order.checkoutConfigurationId
    || (payment.status !== "paid" && Number(payment.refunded_amount ?? 0) < order.priceUsd)
    || payment.currency?.toLowerCase() !== "usd"
    || !Number.isFinite(Number(payment.amount))
    || Math.round(Number(payment.amount) * 100) !== Math.round(order.priceUsd * 100)
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

async function notifyCreatorRefundResolution(
  req: Request,
  order: NonNullable<Awaited<ReturnType<typeof readOrder>>>,
  status: "completed" | "declined",
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

function refundRequestStatus(
  value: string | undefined,
): "none" | "requested" | "processing" | "completed" | "declined" {
  return value === "requested" || value === "processing" || value === "completed" || value === "declined"
    ? value
    : "none";
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
  if (row.status === "approved" && order?.status === "paid") {
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
      res.status(409).json({ error: "Checkout is being prepared. Please try again shortly." });
      return;
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
    await db.update(creatorMotionOrdersTable)
      .set({ status: "failed" })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, row.id),
        eq(creatorMotionOrdersTable.status, "creating"),
      ));
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
    refundRequestedAt: updated.refundRequestedAt,
  }));
});

router.get("/studio/creator-refunds", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (!isStudioOwner(req)) {
    res.status(401).json({ error: "Owner session required." });
    return;
  }
  const orders = await db.select().from(creatorMotionOrdersTable)
    .where(inArray(creatorMotionOrdersTable.refundRequestStatus, ["requested", "processing"]));
  const requests = [];
  for (const order of orders) {
    const status = refundRequestStatus(order.refundRequestStatus);
    if (status !== "requested" && status !== "processing") continue;
    const [submission] = await db.select().from(moveSubmissionsTable)
      .where(eq(moveSubmissionsTable.id, order.submissionId));
    if (!submission || order.priceUsd === null || !order.refundRequestedAt) continue;
    requests.push({
      submissionId: order.submissionId,
      creatorName: submission.displayName,
      moveName: submission.moveName,
      priceUsd: order.priceUsd,
      requestedAt: order.refundRequestedAt,
      refundRequestStatus: status,
      processingAt: order.refundProcessingAt,
    });
  }
  requests.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.json(ListCreatorMotionRefundRequestsResponse.parse(requests));
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
    const processingAt = order.refundProcessingAt?.getTime() ?? 0;
    if (Date.now() - processingAt < 120_000) {
      res.status(409).json({ error: "This refund is still being processed. Refresh the queue shortly." });
      return;
    }
    try {
      const payment = await readVerifiedStoredPayment(order, config.companyId);
      if (!payment) {
        res.status(409).json({ error: "Whop could not verify the original payment. The request remains open." });
        return;
      }
      const refunded = Number(payment.refunded_amount ?? 0);
      if (refunded >= order.priceUsd) {
        const [completed] = await db.update(creatorMotionOrdersTable)
          .set({ refundRequestStatus: "completed", refundProcessingAt: null })
          .where(and(
            eq(creatorMotionOrdersTable.submissionId, params.data.id),
            eq(creatorMotionOrdersTable.refundRequestStatus, "processing"),
          ))
          .returning();
        if (!completed) {
          res.status(409).json({ error: "The refund state changed. Refresh the queue and try again." });
          return;
        }
        const notificationStatus = await notifyCreatorRefundResolution(req, order, "completed", config.companyId, payment);
        res.json(ResolveCreatorMotionRefundRequestResponse.parse({
          refundRequestStatus: "completed",
          refundRequestedAt: completed.refundRequestedAt,
          notificationStatus,
        }));
        return;
      }
      if (refunded !== 0) {
        await reopenRefundRequest(params.data.id);
        res.status(409).json({ error: "This payment has a partial refund and needs manual review in Whop." });
        return;
      }
      await db.update(creatorMotionOrdersTable)
        .set({ refundRequestStatus: "requested", refundProcessingAt: null })
        .where(and(
          eq(creatorMotionOrdersTable.submissionId, params.data.id),
          eq(creatorMotionOrdersTable.refundRequestStatus, "processing"),
        ));
      res.status(409).json({ error: "No full refund was recorded. Refresh the queue to try again." });
      return;
    } catch (error) {
      req.log.warn({ submissionId: params.data.id, providerStatus: (error as { status?: number }).status }, "Unable to reconcile creator refund with Whop");
      res.status(503).json({ error: "Whop refund status could not be verified. The request remains open." });
      return;
    }
  }
  if (status === "requested") {
    const [claimed] = await db.update(creatorMotionOrdersTable)
      .set({ refundRequestStatus: "processing", refundProcessingAt: new Date() })
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
    if (alreadyRefunded < order.priceUsd) {
      if (alreadyRefunded !== 0) {
        await reopenRefundRequest(params.data.id);
        res.status(409).json({ error: "This payment has a partial refund and needs manual review in Whop." });
        return;
      }
      await whopJson<WhopPayment>(
        `/api/v1/payments/${encodeURIComponent(order.paymentId)}/refund`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
      );
    }
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
      || Math.round(Number(finalPayment.amount) * 100) !== Math.round(order.priceUsd * 100)
      || !Number.isFinite(finalRefundedAmount)
    ) throw new Error("Whop did not confirm the full refund.");
    if (Math.round(finalRefundedAmount * 100) < Math.round(order.priceUsd * 100)) {
      if (finalRefundedAmount > 0) await reopenRefundRequest(params.data.id);
      throw new Error("Whop did not confirm the full refund.");
    }
    const [completed] = await db.update(creatorMotionOrdersTable)
      .set({ refundRequestStatus: "completed", refundProcessingAt: null })
      .where(and(
        eq(creatorMotionOrdersTable.submissionId, params.data.id),
        eq(creatorMotionOrdersTable.refundRequestStatus, "processing"),
      ))
      .returning();
    if (!completed) throw new Error("The refund result could not be recorded.");
    const notificationStatus = await notifyCreatorRefundResolution(req, order, "completed", config.companyId, finalPayment);
    res.json(ResolveCreatorMotionRefundRequestResponse.parse({
      refundRequestStatus: "completed",
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
