import { randomBytes } from "node:crypto";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db, organizationCashAccountsTable, organizationCashPurchasesTable, creatorMotionOrdersTable, promotersTable, promoterCommissionsTable } from "@workspace/db";
import { authorizeRecruitmentStaff, type VerifiedStaffIdentity } from "./recruitment-staff-access";

// Only trusted staff authentication and customer-authorized order access may invoke this service.
export async function settleCashPurchase(identity: VerifiedStaffIdentity, organizationId: number, promoterId: number, orderId: number) {
  if (process.env.ORGANIZATION_CASH_ENABLED !== "true") return {status: "closed"} as const;
  if (![organizationId,promoterId,orderId].every(n => Number.isSafeInteger(n) && n > 0)) return {status:"invalid"} as const;
  const membership = await authorizeRecruitmentStaff(identity, organizationId);
  if (!membership) return {status:"unauthorized"} as const;
  return db.transaction(async tx => {
    const [worker] = await tx.select().from(promotersTable).where(and(eq(promotersTable.id,promoterId),eq(promotersTable.organizationId,organizationId),eq(promotersTable.status,"approved"),eq(promotersTable.eligibilityVerified,true),eq(promotersTable.guardianConsentVerified,true))).limit(1);
    if (!worker?.referralCode) return {status:"ineligible"} as const;
    // Cash orders must be created explicitly for cash; never convert an online checkout.
    const [order] = await tx.update(creatorMotionOrdersTable).set({status:"cash_settling"}).where(and(eq(creatorMotionOrdersTable.id,orderId),eq(creatorMotionOrdersTable.status,"cash_pending"),eq(creatorMotionOrdersTable.priceUsd,2),eq(creatorMotionOrdersTable.attributedPromoterId,promoterId),eq(creatorMotionOrdersTable.attributedReferralCode,worker.referralCode),isNull(creatorMotionOrdersTable.checkoutConfigurationId),isNull(creatorMotionOrdersTable.paymentId))).returning();
    if (!order) return {status:"order-unavailable"} as const;
    const [balance] = await tx.update(organizationCashAccountsTable).set({balanceCents:sql`${organizationCashAccountsTable.balanceCents} - 200`}).where(and(eq(organizationCashAccountsTable.organizationId,organizationId),gte(organizationCashAccountsTable.balanceCents,200))).returning();
    if (!balance) {
      await tx.update(creatorMotionOrdersTable).set({status:"cash_pending"}).where(eq(creatorMotionOrdersTable.id,orderId));
      return {status:"insufficient-balance"} as const;
    }
    const receiptCode = "CASH-" + randomBytes(16).toString("hex").toUpperCase();
    await tx.insert(organizationCashPurchasesTable).values({organizationId,promoterId,orderId,receiptCode,amountCents:200,commissionCents:96,status:"settled"});
    await tx.insert(promoterCommissionsTable).values({promoterId,provider:"organization-cash",paymentId:receiptCode,product:"motion-card",commissionCents:96,status:"pending"});
    await tx.update(creatorMotionOrdersTable).set({status:"paid",paymentId:receiptCode,paidAt:new Date()}).where(eq(creatorMotionOrdersTable.id,orderId));
    return {status:"settled",receiptCode,balanceCents:balance.balanceCents} as const;
  });
}
