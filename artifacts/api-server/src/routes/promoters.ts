import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, promotersTable, promoterCommissionsTable, recruitmentOrganizationsTable } from "@workspace/db";
import { isStudioOwner } from "./studio";
import { generatePromoterCode } from "../lib/promoter-policy";

const router: IRouter = Router();
router.use("/owner/promoters", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!isStudioOwner(req)) { res.status(401).json({ error: "Owner sign-in required." }); return; }
  next();
});
router.get("/owner/promoters/organizations", async (_req, res) => {
  res.json(await db.select().from(recruitmentOrganizationsTable).orderBy(recruitmentOrganizationsTable.id).limit(5000));
});
router.post("/owner/promoters/organizations", async (req, res) => {
  if (req.get("X-Promoter-Action") !== "create-organization" || !req.is("application/json")) {
    res.status(403).json({ error: "Explicit owner action required." }); return;
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 160) { res.status(400).json({ error: "Valid organization name required." }); return; }
  const [organization] = await db.insert(recruitmentOrganizationsTable).values({
    name, recruitmentCode: "ORG" + randomBytes(12).toString("hex").toUpperCase(), active: false
  }).returning();
  res.status(201).json(organization);
});
router.get("/owner/promoters", async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 50);
  const status = req.query.status;
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      (status !== undefined && status !== "pending" && status !== "approved")) {
    res.status(400).json({ error: "Invalid review queue filters." }); return;
  }
  const rows = await db.select().from(promotersTable)
    .where(status === "pending" || status === "approved" ? eq(promotersTable.status, status) : undefined)
    .orderBy(promotersTable.id).limit(limit + 1).offset((page - 1) * limit);
  res.json({ items: rows.slice(0, limit), page, limit, hasMore: rows.length > limit });
});
router.get("/owner/promoters/:id/commissions", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid promoter." }); return; }
  res.json(await db.select().from(promoterCommissionsTable).where(eq(promoterCommissionsTable.promoterId, id)));
});
router.post("/owner/promoters/:id/verify", async (req, res) => {
  if (req.get("X-Promoter-Action") !== "verify" || !req.is("application/json")) {
    res.status(403).json({ error: "Explicit owner verification required." }); return;
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || req.body?.eligibilityVerified !== true || req.body?.consentRequirementsSatisfied !== true) {
    res.status(400).json({ error: "Verified eligibility and applicable consent requirements must be confirmed." }); return;
  }
  // Owner must independently verify lawful work eligibility and applicable guardian consent.
  // This records an attestation, not documentary proof or automatic age verification.
  const [verified] = await db.update(promotersTable).set({
    eligibilityVerified: true, guardianConsentVerified: true
  }).where(and(eq(promotersTable.id, id), eq(promotersTable.status, "pending"))).returning();
  if (!verified) { res.status(409).json({ error: "Pending application required." }); return; }
  res.json(verified);
});
router.post("/owner/promoters/:id/approve", async (req, res) => {
  if (req.get("X-Promoter-Action") !== "approve" || !req.is("application/json")) {
    res.status(403).json({ error: "Explicit owner approval required." }); return;
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid promoter." }); return; }
  // Eligibility and any required guardian consent must already be independently verified.
  const [approved] = await db.update(promotersTable).set({
    status: "approved", referralCode: generatePromoterCode(), approvedAt: new Date()
  }).where(and(eq(promotersTable.id, id), eq(promotersTable.status, "pending"),
    eq(promotersTable.eligibilityVerified, true), eq(promotersTable.guardianConsentVerified, true),
    isNull(promotersTable.referralCode))).returning();
  if (!approved) { res.status(409).json({ error: "Pending verified application required." }); return; }
  res.json(approved);
});
export default router;
