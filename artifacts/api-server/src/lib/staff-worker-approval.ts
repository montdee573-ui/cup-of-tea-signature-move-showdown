import { and, eq, isNull } from "drizzle-orm";
import { db, promotersTable } from "@workspace/db";
import { authorizeRecruitmentStaff, type VerifiedStaffIdentity } from "./recruitment-staff-access";
import { generatePromoterCode } from "./promoter-policy";

// Staff attestations must be backed by locally retained eligibility and consent records.
export async function approveOrganizationWorker(identity: VerifiedStaffIdentity, organizationId: number, workerCode: string, review: {eligibilityVerified: boolean; consentRequirementsSatisfied: boolean}) {
  if (process.env.STAFF_WORKER_APPROVAL_ENABLED !== "true") return {status: "closed"} as const;
  const membership = await authorizeRecruitmentStaff(identity, organizationId);
  if (!membership) return {status: "unauthorized"} as const;
  if (!/^W[A-F0-9]{32}$/.test(workerCode) || review.eligibilityVerified !== true || review.consentRequirementsSatisfied !== true) return {status: "invalid-review"} as const;
  const [worker] = await db.update(promotersTable).set({
    eligibilityVerified: true, guardianConsentVerified: true, status: "approved",
    referralCode: generatePromoterCode(), approvedAt: new Date()
  }).where(and(eq(promotersTable.organizationId, membership.organizationId),
    eq(promotersTable.workerCode, workerCode), eq(promotersTable.status, "pending"),
    isNull(promotersTable.referralCode))).returning({workerCode: promotersTable.workerCode, referralCode: promotersTable.referralCode});
  return worker ? {status: "approved", worker} as const : {status: "not-eligible-for-approval"} as const;
}
