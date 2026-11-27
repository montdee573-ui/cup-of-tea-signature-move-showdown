import { db, promoterCommissionsTable } from "@workspace/db";
import { evaluateCommission, type CommissionEvidence } from "./promoter-policy";
import { resolvePromoterReferral } from "./promoter-referral";

// Only invoke with verified provider evidence and attribution persisted on the original order.
// No HTTP request body may supply payment verification or attribution evidence.
export async function recordPromoterCommission(evidence: Omit<CommissionEvidence, "promoterApproved" | "eligibilityVerified" | "referralCode">) {
  if (process.env.PROMOTER_COMMISSIONS_ENABLED !== "true") return {status: "disabled"} as const;
  const promoter = await resolvePromoterReferral(evidence.attributedCode);
  if (!promoter?.referralCode) return {status: "ineligible"} as const;
  const result = evaluateCommission({...evidence, promoterApproved: true, eligibilityVerified: true, referralCode: promoter.referralCode});
  if (!result.eligible) return {status: "ineligible"} as const;
  const [record] = await db.insert(promoterCommissionsTable).values({
    promoterId: promoter.promoterId, provider: evidence.provider, paymentId: evidence.paymentId,
    product: evidence.product, commissionCents: result.commissionCents, status: "pending"
  }).onConflictDoNothing({target: [promoterCommissionsTable.provider, promoterCommissionsTable.paymentId]})
    .returning({id: promoterCommissionsTable.id});
  return record ? {status: "recorded", id: record.id} as const : {status: "already-recorded"} as const;
}
