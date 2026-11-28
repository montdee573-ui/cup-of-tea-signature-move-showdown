import { and, eq } from "drizzle-orm";
import { db, promotersTable, recruitmentOrganizationsTable } from "@workspace/db";
import { normalizePromoterCode } from "./promoter-policy";

// Resolve before checkout and persist the returned attribution on the server-side order.
// A referral code is public attribution, never authentication or proof of payment.
export async function resolvePromoterReferral(value: unknown) {
  const code = normalizePromoterCode(value);
  if (!code) return null;
  const [promoter] = await db.select({promoterId: promotersTable.id, referralCode: promotersTable.referralCode})
    .from(promotersTable)
    .innerJoin(recruitmentOrganizationsTable, eq(promotersTable.organizationId, recruitmentOrganizationsTable.id))
    .where(and(eq(promotersTable.referralCode, code), eq(promotersTable.status, "approved"),
      eq(promotersTable.eligibilityVerified, true), eq(promotersTable.guardianConsentVerified, true),
      eq(recruitmentOrganizationsTable.active, true))).limit(1);
  return promoter ?? null;
}
