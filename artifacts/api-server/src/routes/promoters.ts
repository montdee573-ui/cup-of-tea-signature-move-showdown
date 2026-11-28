import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, promotersTable, promoterCommissionsTable, recruitmentOrganizationsTable } from "@workspace/db";
import { isStudioOwner } from "./studio";
import { commissionCampaignWindow, generatePromoterCode } from "../lib/promoter-policy";
import { registerPromoter, type VerifiedApplicant } from "../lib/promoter-registration";
import { verifiedPromoterIdentity } from "../lib/promoter-identity";
import { readPromoterDashboard } from "../lib/promoter-dashboard";
import {
  GetPromoterProgramStatusResponse, GetPromoterAccountResponse,
  SubmitPromoterApplicationBody, GetPromoterDashboardResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function ownAccount(identity: VerifiedApplicant) {
  const [row] = await db.select().from(promotersTable)
    .where(eq(promotersTable.accountSubject, JSON.stringify([identity.issuer, identity.subject]))).limit(1);
  return GetPromoterAccountResponse.parse({
    registered: Boolean(row), id: row?.id ?? null,
    status: !row ? "not_registered" : row.status === "approved" || row.status === "pending" ? row.status : "inactive",
    referralCode: row?.status === "approved" ? row.referralCode : null,
    eligibilityVerified: row?.eligibilityVerified ?? false,
    consentVerified: row?.guardianConsentVerified ?? false,
  });
}

router.get("/promoters/status", (_req, res) => {
  res.set("Cache-Control", "no-store").json(GetPromoterProgramStatusResponse.parse({
    registrationOpen: process.env.PROMOTER_REGISTRATION_ENABLED === "true",
    dashboardEnabled: process.env.PROMOTER_DASHBOARD_ENABLED === "true",
    commissionsEnabled: process.env.PROMOTER_COMMISSIONS_ENABLED === "true"
      && process.env.WHOP_LIVE_PAYMENTS_VERIFIED === "true"
      && process.env.PROMOTER_PAYOUT_POLICY_APPROVED === "true"
      && commissionCampaignWindow() !== null,
  }));
});

router.get("/promoters/me", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const identity = await verifiedPromoterIdentity(req);
  if (!identity) { res.status(401).json({ error: "Sign in with a verified email to access your application." }); return; }
  res.json(await ownAccount(identity));
});

router.post("/promoters/applications", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.get("X-Promoter-Action") !== "apply" || !req.is("application/json")) {
    res.status(403).json({ error: "Explicit application action required." }); return;
  }
  if (process.env.PROMOTER_REGISTRATION_ENABLED !== "true") {
    res.status(503).json({ error: "Recruitment intake is awaiting owner approval." }); return;
  }
  const identity = await verifiedPromoterIdentity(req);
  if (!identity) { res.status(401).json({ error: "Sign in with a verified email before applying." }); return; }
  const input = SubmitPromoterApplicationBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "A valid organization code and acknowledgement are required." }); return; }
  const result = await registerPromoter(identity, input.data.recruitmentCode);
  if (result.status === "invalid-organization") { res.status(400).json({ error: "That recruitment organization is unavailable." }); return; }
  if (result.status === "closed") { res.status(503).json({ error: "Recruitment intake is closed." }); return; }
  if (result.status === "unauthorized") { res.status(401).json({ error: "Verified account required." }); return; }
  res.json(await ownAccount(identity));
});

router.get("/promoters/dashboard", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const identity = await verifiedPromoterIdentity(req);
  if (!identity) { res.status(401).json({ error: "Sign in with a verified email to view your dashboard." }); return; }
  if (process.env.PROMOTER_DASHBOARD_ENABLED !== "true") {
    res.status(503).json({ error: "The promoter dashboard is not enabled." }); return;
  }
  const dashboard = await readPromoterDashboard(identity);
  if (!dashboard) { res.status(403).json({ error: "Active organization membership, eligibility, consent and owner approval are required." }); return; }
  res.json(GetPromoterDashboardResponse.parse(dashboard));
});
// Recruitment code lookup reveals no applicant or private organization records.
router.get("/promoters/recruitment-status", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const code = typeof req.query.code === "string" ? req.query.code.trim().toUpperCase() : "";
  if (!/^ORG[A-F0-9]{24}$/.test(code)) {
    res.json({ valid: false, registrationOpen: false }); return;
  }
  const [organization] = await db.select({id: recruitmentOrganizationsTable.id})
    .from(recruitmentOrganizationsTable)
    .where(and(eq(recruitmentOrganizationsTable.recruitmentCode, code), eq(recruitmentOrganizationsTable.active, true))).limit(1);
  res.json({ valid: Boolean(organization), registrationOpen: false });
});
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
router.post("/owner/promoters/organizations/:id/activation", async (req, res) => {
  if (req.get("X-Promoter-Action") !== "organization-activation" || !req.is("application/json")) {
    res.status(403).json({ error: "Explicit owner action required." }); return;
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof req.body?.active !== "boolean") {
    res.status(400).json({ error: "Valid organization and activation state required." }); return;
  }
  const [organization] = await db.update(recruitmentOrganizationsTable).set({active: req.body.active})
    .where(eq(recruitmentOrganizationsTable.id, id)).returning();
  if (!organization) { res.status(404).json({ error: "Organization not found." }); return; }
  res.json(organization);
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
