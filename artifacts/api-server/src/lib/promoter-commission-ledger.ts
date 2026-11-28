import { and, eq, sql, gte, lt, isNull, ne } from "drizzle-orm";
import { db, promotersTable, promoterCommissionsTable } from "@workspace/db";
import { evaluateCommission, cappedCommissionCents, commissionCampaignWindow, type CommissionEvidence } from "./promoter-policy";
import { resolvePromoterReferral } from "./promoter-referral";

// Only invoke with verified provider evidence and attribution persisted on the original order.
// No HTTP request body may supply payment verification or attribution evidence.
export async function recordPromoterCommission(evidence: Omit<CommissionEvidence, "promoterApproved" | "eligibilityVerified" | "referralCode">) {
  if (process.env.PROMOTER_COMMISSIONS_ENABLED !== "true") return {status: "disabled"} as const;
  const campaign = commissionCampaignWindow();
  if (!campaign || process.env.PROMOTER_PAYOUT_POLICY_APPROVED !== "true") return {status: "disabled"} as const;
  const paidAt = evidence.paidAt ? new Date(evidence.paidAt) : null;
  if (!paidAt || !Number.isFinite(paidAt.getTime()) || paidAt < campaign.startAt || paidAt >= campaign.endAt) return {status: "ineligible"} as const;
  const promoter = await resolvePromoterReferral(evidence.attributedCode);
  if (!promoter?.referralCode) return {status: "ineligible"} as const;
  const result = evaluateCommission({...evidence, promoterApproved: true, eligibilityVerified: true, referralCode: promoter.referralCode});
  if (!result.eligible) return {status: "ineligible"} as const;
  return db.transaction(async tx => {
  await tx.select({id:promotersTable.id}).from(promotersTable).where(eq(promotersTable.id,promoter.promoterId)).for("update");
  const c = promoterCommissionsTable;
  const [totals] = await tx.select({
    daily: sql<number>`coalesce(sum(${c.commissionCents}) filter (where (${c.createdAt} at time zone ${campaign.timezone})::date = (${paidAt.toISOString()}::timestamptz at time zone ${campaign.timezone})::date),0)::int`,
    campaign: sql<number>`coalesce(sum(${c.commissionCents}),0)::int`
  }).from(c).where(and(
    eq(c.promoterId,promoter.promoterId), gte(c.createdAt,campaign.startAt), lt(c.createdAt,campaign.endAt),
    isNull(c.reversedAt), ne(c.status,"reversed")
  ));
  const credit = cappedCommissionCents(result.commissionCents, Number(totals.daily), Number(totals.campaign));
  const [record] = await tx.insert(promoterCommissionsTable).values({
    promoterId: promoter.promoterId, provider: evidence.provider, paymentId: evidence.paymentId,
    product: evidence.product, commissionCents: credit, status: "pending", createdAt: paidAt
  }).onConflictDoNothing({target: [promoterCommissionsTable.provider, promoterCommissionsTable.paymentId]})
    .returning({id: promoterCommissionsTable.id});
  return record ? {status: "recorded", id: record.id, commissionCents: credit} as const : {status: "already-recorded"} as const;
  });
}

// Preserve the payment's unique key after reversal, so retry cannot credit it again.
export async function reversePromoterCommission(paymentId: string, promoterId: number) {
  await db.update(promoterCommissionsTable).set({ status: "reversed", reversedAt: new Date() })
    .where(and(eq(promoterCommissionsTable.provider,"whop"), eq(promoterCommissionsTable.paymentId,paymentId),
      eq(promoterCommissionsTable.promoterId,promoterId), isNull(promoterCommissionsTable.reversedAt)));
}
