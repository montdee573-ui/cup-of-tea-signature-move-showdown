import { randomBytes } from 'node:crypto';

export const MOTION_PURCHASE_CENTS = 200;
export const PROMOTER_COMMISSION_CENTS = 96;
export const DAILY_COMMISSION_LIMIT_CENTS = 9600;
export const CAMPAIGN_COMMISSION_LIMIT_CENTS = 96000;
export const SHIRT_COMMISSION_PERCENT = 48;
// Legacy reference only: 100 motion cards reach the cap without merchandise.
export const DAILY_PURCHASE_TARGET = 100;

export function generatePromoterCode(): string {
  return 'P' + randomBytes(12).toString('hex').toUpperCase();
}

export function normalizePromoterCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^P[A-F0-9]{24}$/.test(code) ? code : null;
}

// Inputs must originate from authenticated server records, never client claims.
// Persistence must enforce a unique provider/payment ID and handle refunds atomically.
export type CommissionEvidence = {
  promoterApproved: boolean;
  eligibilityVerified: boolean;
  referralCode: string;
  attributedCode: string;
  provider: 'whop' | 'stripe';
  paymentId: string;
  paymentVerified: boolean;
  livePayment: boolean;
  refunded: boolean;
  amountCents: number;
  currency: string;
  product: 'motion-card' | 'other';
};

export function evaluateCommission(e: CommissionEvidence) {
  const code = normalizePromoterCode(e.referralCode);
  const eligible = Boolean(code && code === normalizePromoterCode(e.attributedCode)
    && e.promoterApproved && e.eligibilityVerified && e.paymentId.trim()
    && e.paymentVerified && e.livePayment && !e.refunded
    && e.amountCents === MOTION_PURCHASE_CENTS && e.currency.toUpperCase() === 'USD'
    && e.product === 'motion-card');
  return { eligible, commissionCents: eligible ? PROMOTER_COMMISSION_CENTS : 0,
    paymentKey: e.provider + ':' + e.paymentId };
}

export function shirtCommissionCents(eligibleProfitCents: number): number {
  if (!Number.isSafeInteger(eligibleProfitCents) || eligibleProfitCents <= 0) return 0;
  return Math.floor(eligibleProfitCents * SHIRT_COMMISSION_PERCENT / 100);
}
export function cappedCommissionCents(requested: number, daily: number, campaign: number): number {
  if (![requested,daily,campaign].every(n => Number.isSafeInteger(n) && n >= 0)) return 0;
  return Math.max(0, Math.min(requested, DAILY_COMMISSION_LIMIT_CENTS-daily, CAMPAIGN_COMMISSION_LIMIT_CENTS-campaign));
}
