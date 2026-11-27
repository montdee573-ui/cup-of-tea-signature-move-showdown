import { and, eq } from "drizzle-orm";
import { db, recruitmentStaffTable, recruitmentOrganizationsTable } from "@workspace/db";

// Identity must be supplied exclusively by a trusted, server-side authentication adapter.
export type VerifiedStaffIdentity = { issuer: string; subject: string; verified: boolean };

export async function authorizeRecruitmentStaff(identity: VerifiedStaffIdentity, organizationId: number) {
  if (!identity.verified || !identity.issuer.trim() || !identity.subject.trim()
      || !Number.isSafeInteger(organizationId) || organizationId <= 0) return null;
  const accountSubject = JSON.stringify([identity.issuer, identity.subject]);
  const [membership] = await db.select({ staffId: recruitmentStaffTable.id, organizationId: recruitmentStaffTable.organizationId })
    .from(recruitmentStaffTable)
    .innerJoin(recruitmentOrganizationsTable, eq(recruitmentStaffTable.organizationId, recruitmentOrganizationsTable.id))
    .where(and(eq(recruitmentStaffTable.accountSubject, accountSubject),
      eq(recruitmentStaffTable.organizationId, organizationId),
      eq(recruitmentStaffTable.active, true),
      eq(recruitmentOrganizationsTable.active, true))).limit(1);
  return membership ?? null;
}
