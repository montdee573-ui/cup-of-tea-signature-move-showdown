import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
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
  RetryCreatorMotionGenerationBody,
  RetryCreatorMotionGenerationParams,
  RetryCreatorMotionGenerationResponse,
} from "@workspace/api-zod";
import { getWhopClient } from "../lib/whop-client";
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
): Promise<boolean> {
  const key = `${companyId}:${planId}:${priceUsd.toFixed(2)}`;
  if (approvedPlanCache?.key === key && Date.now() - approvedPlanCache.checkedAt < 30_000) {
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
  if (row.status === "approved" && order?.status === "paid") {
    if (order.generationStatus === "not_started") {
      await startCreatorMotionGeneration(row);
      order = await readOrder(row.id);
    } else {
      order = await refreshCreatorMotionGeneration(order);
    }
  }
  if (order?.status === "paid") motionStatus = "paid";
  else if (order?.status === "pending" || order?.status === "creating") motionStatus = "checkout_pending";
  else if (row.status === "approved" && offerAvailable) motionStatus = "not_purchased";

  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.json(GetCreatorCardAccessResponse.parse({
    submissionStatus: row.status,
    motionStatus,
    offerAvailable,
    priceUsd: offerAvailable ? offer.priceUsd : null,
    generationStatus: order?.generationStatus ?? "not_started",
    generationError: order?.generationError ?? null,
    motionVideoUrl: order?.generationStatus === "succeeded" ? creatorMotionVideoUrl(row.id) : null,
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
  const planReady = await whopPlanMatchesApprovedOffer(config.companyId, config.planId, offer.priceUsd);
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
      .where(eq(creatorMotionOrdersTable.submissionId, row.id));
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
      .where(eq(creatorMotionOrdersTable.submissionId, row.id))
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
      .where(eq(creatorMotionOrdersTable.submissionId, row.id));
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
  const [reset] = await db.update(creatorMotionOrdersTable)
    .set({ generationStatus: "not_started", generationError: null })
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
    card: privateCard(row),
  }));
});

router.get("/creator-cards/:id/motion/video", async (req, res): Promise<void> => {
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
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const range = req.headers.range;
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
      file.createReadStream({ start, end }).pipe(res);
      return;
    }
    res.setHeader("Content-Length", String(size));
    file.createReadStream().pipe(res);
  } catch (error) {
    req.log.error({ err: error, submissionId: params.data.id }, "Unable to stream private creator reel");
    res.status(500).json({ error: "Unable to stream the generated creator reel." });
  }
});

export default router;
