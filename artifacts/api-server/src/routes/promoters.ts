import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, promotersTable, promoterCommissionsTable } from "@workspace/db";
import { isStudioOwner } from "./studio";
import { generatePromoterCode } from "../lib/promoter-policy";

const router: IRouter = Router();
router.use("/owner/promoters", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!isStudioOwner(req)) { res.status(401).json({ error: "Owner sign-in required." }); return; }
  next();
});
router.get("/owner/promoters", async (_req, res) => {
  res.json(await db.select().from(promotersTable));
});
router.get("/owner/promoters/:id/commissions", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid promoter." }); return; }
  res.json(await db.select().from(promoterCommissionsTable).where(eq(promoterCommissionsTable.promoterId, id)));
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
