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
  product: 'motion-card' | 'merchandise' | 'other';
  paidAt?: string;
  // Verified aggregate eligible profit for an order containing only approved shirts.
  eligibleProfitCents?: number;
  approvedShirtOrder?: boolean;
};

export function evaluateCommission(e: CommissionEvidence) {
  const code = normalizePromoterCode(e.referralCode);
  const motion = e.product === 'motion-card' && e.amountCents === MOTION_PURCHASE_CENTS;
  const merchandise = e.product === 'merchandise' && e.approvedShirtOrder === true && Number.isSafeInteger(e.eligibleProfitCents) && (e.eligibleProfitCents ?? 0) > 0 && (e.eligibleProfitCents ?? 0) <= e.amountCents;
  const eligible = Boolean(code && code === normalizePromoterCode(e.attributedCode)
    && e.promoterApproved && e.eligibilityVerified && e.paymentId.trim()
    && e.paymentVerified && e.livePayment && !e.refunded
    && Number.isSafeInteger(e.amountCents) && e.amountCents > 0 && e.currency.toUpperCase() === 'USD'
    && (motion || merchandise));
  return { eligible, commissionCents: eligible ? (motion ? PROMOTER_COMMISSION_CENTS : shirtCommissionCents(e.eligibleProfitCents ?? 0)) : 0,
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

// No assumed midnight/cutoff: the owner supplies explicit instants and timezone.
// These settings govern commissions only, never the multi-month competition.
export function commissionCampaignWindow(config: Record<string, string | undefined> = process.env) {
  const start = config.PROMOTER_CAMPAIGN_START_AT;
  const end = config.PROMOTER_CAMPAIGN_END_AT;
  const timezone = config.PROMOTER_CAMPAIGN_TIMEZONE;
  if (!start || !end || !timezone
    || !/(Z|[+-]\d{2}:\d{2})$/.test(start) || !/(Z|[+-]\d{2}:\d{2})$/.test(end)) return null;
  const startAt = new Date(start);
  const endAt = new Date(end);
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(startAt); }
  catch { return null; }
  return { startAt, endAt, timezone };
}
