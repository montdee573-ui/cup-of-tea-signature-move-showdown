import { eq, sql } from "drizzle-orm";
import { db, promotersTable, promoterCommissionsTable } from "@workspace/db";
import { evaluateCommission, cappedCommissionCents, type CommissionEvidence } from "./promoter-policy";
import { resolvePromoterReferral } from "./promoter-referral";

// Only invoke with verified provider evidence and attribution persisted on the original order.
// No HTTP request body may supply payment verification or attribution evidence.
export async function recordPromoterCommission(evidence: Omit<CommissionEvidence, "promoterApproved" | "eligibilityVerified" | "referralCode">) {
  if (process.env.PROMOTER_COMMISSIONS_ENABLED !== "true") return {status: "disabled"} as const;
  const promoter = await resolvePromoterReferral(evidence.attributedCode);
  if (!promoter?.referralCode) return {status: "ineligible"} as const;
  const result = evaluateCommission({...evidence, promoterApproved: true, eligibilityVerified: true, referralCode: promoter.referralCode});
  if (!result.eligible) return {status: "ineligible"} as const;
  return db.transaction(async tx => {
  await tx.select({id:promotersTable.id}).from(promotersTable).where(eq(promotersTable.id,promoter.promoterId)).for("update");
  const [totals] = await tx.select({daily:sql<number>`coalesce(sum(${promoterCommissionsTable.commissionCents}) filter (where (${promoterCommissionsTable.createdAt} at time zone 'America/Chicago')::date = (now() at time zone 'America/Chicago')::date),0)::int`, campaign:sql<number>`coalesce(sum(${promoterCommissionsTable.commissionCents}),0)::int`}).from(promoterCommissionsTable).where(eq(promoterCommissionsTable.promoterId,promoter.promoterId));
  const credit = cappedCommissionCents(result.commissionCents, Number(totals.daily), Number(totals.campaign));
  const [record] = await tx.insert(promoterCommissionsTable).values({
    promoterId: promoter.promoterId, provider: evidence.provider, paymentId: evidence.paymentId,
    product: evidence.product, commissionCents: credit, status: "pending"
  }).onConflictDoNothing({target: [promoterCommissionsTable.provider, promoterCommissionsTable.paymentId]})
    .returning({id: promoterCommissionsTable.id});
  return record ? {status: "recorded", id: record.id, commissionCents: credit} as const : {status: "already-recorded"} as const;
  });
}
