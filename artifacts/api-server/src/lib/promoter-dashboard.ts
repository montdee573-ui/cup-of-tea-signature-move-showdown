import { and, eq, desc, sql } from "drizzle-orm";
import { db, promotersTable, promoterCommissionsTable, recruitmentOrganizationsTable } from "@workspace/db";
import { DAILY_COMMISSION_LIMIT_CENTS, CAMPAIGN_COMMISSION_LIMIT_CENTS } from "./promoter-policy";

// Identity must originate from a trusted server-side authentication adapter.
// Worker codes and referral links are not authentication credentials.
export async function readPromoterDashboard(identity: {issuer:string; subject:string; verified:boolean}) {
  if (process.env.PROMOTER_DASHBOARD_ENABLED !== "true" || !identity.verified || !identity.issuer.trim() || !identity.subject.trim()) return null;
  const [worker] = await db.select({id:promotersTable.id,referralCode:promotersTable.referralCode})
    .from(promotersTable).innerJoin(recruitmentOrganizationsTable,eq(promotersTable.organizationId,recruitmentOrganizationsTable.id))
    .where(and(eq(promotersTable.accountSubject,JSON.stringify([identity.issuer,identity.subject])),eq(promotersTable.status,"approved"),eq(promotersTable.eligibilityVerified,true),eq(promotersTable.guardianConsentVerified,true),eq(recruitmentOrganizationsTable.active,true))).limit(1);
  if (!worker) return null;
  const c = promoterCommissionsTable;
  const [totals] = await db.select({
    daily:sql<number>`coalesce(sum(${c.commissionCents}) filter (where (${c.createdAt} at time zone 'America/Chicago')::date = (now() at time zone 'America/Chicago')::date),0)::int`,
    total:sql<number>`coalesce(sum(${c.commissionCents}),0)::int`,
    motion:sql<number>`coalesce(sum(${c.commissionCents}) filter (where ${c.product} = 'motion-card'),0)::int`,
    merchandise:sql<number>`coalesce(sum(${c.commissionCents}) filter (where ${c.product} = 'merchandise'),0)::int`,
    pending:sql<number>`coalesce(sum(${c.commissionCents}) filter (where ${c.status} = 'pending'),0)::int`
  }).from(c).where(eq(c.promoterId,worker.id));
  const recent = await db.select({id:c.id,product:c.product,commissionCents:c.commissionCents,status:c.status,createdAt:c.createdAt}).from(c).where(eq(c.promoterId,worker.id)).orderBy(desc(c.id)).limit(50);
  return {referralCode:worker.referralCode, totals, recent, dailyLimitCents:DAILY_COMMISSION_LIMIT_CENTS,campaignLimitCents:CAMPAIGN_COMMISSION_LIMIT_CENTS, scope:"all-recorded-credits", timezone:"America/Chicago"};
}
