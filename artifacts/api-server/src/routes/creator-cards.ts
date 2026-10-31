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
} from "@workspace/api-zod";
import { getWhopClient } from "../lib/whop-client";

const router: IRouter = Router();
const MOTION_CARD_PRICE_USD = 2;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

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
    && Number(item.amount) >= MOTION_CARD_PRICE_USD
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
  if (row.status === "approved" && config) {
    const order = await readOrder(row.id);
    if (!order) {
      motionStatus = "not_purchased";
    } else {
      try {
        const currentOrder = await refreshOrderStatus(order, config.companyId);
        motionStatus = currentOrder.status === "paid"
          ? "paid"
          : currentOrder.status === "pending" || currentOrder.status === "creating"
            ? "checkout_pending"
            : "not_purchased";
      } catch (error) {
        const status = (error as { status?: number }).status;
        req.log.warn({ submissionId: row.id, providerStatus: status }, "Unable to verify motion-card payment");
        res.status(503).json({ error: "Payment status could not be verified. Please try again." });
        return;
      }
    }
  }

  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.json(GetCreatorCardAccessResponse.parse({
    submissionStatus: row.status,
    motionStatus,
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
    res.status(409).json({ error: "Only approved cards can purchase the optional motion card." });
    return;
  }
  const config = whopConfiguration();
  if (!config) {
    res.status(503).json({ error: "Optional motion-card checkout is not configured yet." });
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
      res.json(CreateCreatorMotionCardCheckoutResponse.parse({ motionStatus: "paid", checkoutUrl: null }));
      return;
    }
    if (order.status === "pending" && order.checkoutUrl) {
      res.json(CreateCreatorMotionCardCheckoutResponse.parse({
        motionStatus: "checkout_pending",
        checkoutUrl: order.checkoutUrl,
      }));
      return;
    }
    if (order.status === "creating") {
      res.status(409).json({ error: "Checkout is being prepared. Please try again shortly." });
      return;
    }
  } else {
    const [created] = await db.insert(creatorMotionOrdersTable)
      .values({ submissionId: row.id, status: "creating" })
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
      })
      .where(eq(creatorMotionOrdersTable.submissionId, row.id))
      .returning();
    if (!updated) throw new Error("The checkout mapping could not be saved.");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json(CreateCreatorMotionCardCheckoutResponse.parse({
      motionStatus: "checkout_pending",
      checkoutUrl: updated.checkoutUrl,
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

export default router;
