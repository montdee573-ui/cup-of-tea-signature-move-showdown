import { randomBytes } from "node:crypto";
import { db, promotersTable } from "@workspace/db";
import { authorizeRecruitmentStaff, type VerifiedStaffIdentity } from "./recruitment-staff-access";

// Invoke only with server-verified staff identity. Workers remain pending until individual review.
export async function registerWorkerBatch(identity: VerifiedStaffIdentity, organizationId: number, count: number) {
  if (process.env.STAFF_WORKER_REGISTRATION_ENABLED !== "true") return {status: "closed"} as const;
  if (!Number.isSafeInteger(count) || count < 1 || count > 50) return {status: "invalid-count"} as const;
  const membership = await authorizeRecruitmentStaff(identity, organizationId);
  if (!membership) return {status: "unauthorized"} as const;
  const rows = Array.from({length: count}, () => {
    const workerCode = "W" + randomBytes(16).toString("hex").toUpperCase();
    return {organizationId: membership.organizationId, workerCode,
      accountSubject: "organization-worker:" + workerCode, status: "pending",
      eligibilityVerified: false, guardianConsentVerified: false};
  });
  const workers = await db.insert(promotersTable).values(rows).returning({id: promotersTable.id, workerCode: promotersTable.workerCode});
  return {status: "pending", workers} as const;
}
