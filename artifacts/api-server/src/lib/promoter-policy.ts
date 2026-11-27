import { randomBytes } from 'node:crypto';

export const MOTION_PURCHASE_CENTS = 200;
export const PROMOTER_COMMISSION_CENTS = 96;
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
