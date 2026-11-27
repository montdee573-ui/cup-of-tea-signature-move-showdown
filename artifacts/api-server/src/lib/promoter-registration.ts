import { and, eq } from "drizzle-orm";
import { db, promotersTable, recruitmentOrganizationsTable } from "@workspace/db";

// Only call from a trusted authentication adapter after verifying the account.
// Never accept this identity object directly from an HTTP request body.
export type VerifiedApplicant = { subject: string; issuer: string; verified: boolean };

export async function registerPromoter(identity: VerifiedApplicant, recruitmentCode: string) {
  if (process.env.PROMOTER_REGISTRATION_ENABLED !== "true") return { status: "closed" } as const;
  if (!identity.verified || !identity.subject.trim() || !identity.issuer.trim()) return { status: "unauthorized" } as const;
  const code = recruitmentCode.trim().toUpperCase();
  if (!/^ORG[A-F0-9]{24}$/.test(code)) return { status: "invalid-organization" } as const;
  const [organization] = await db.select({ id: recruitmentOrganizationsTable.id })
    .from(recruitmentOrganizationsTable)
    .where(and(eq(recruitmentOrganizationsTable.recruitmentCode, code), eq(recruitmentOrganizationsTable.active, true))).limit(1);
  if (!organization) return { status: "invalid-organization" } as const;
  const accountSubject = JSON.stringify([identity.issuer, identity.subject]);
  const [application] = await db.insert(promotersTable).values({
    accountSubject, organizationId: organization.id, status: "pending",
    eligibilityVerified: false, guardianConsentVerified: false
  }).onConflictDoNothing({target: promotersTable.accountSubject}).returning({id: promotersTable.id});
  return application ? {status: "pending", id: application.id} as const : {status: "already-registered"} as const;
}
