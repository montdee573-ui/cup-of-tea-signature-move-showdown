// Shared server-side eligibility policy. Inputs must come from trusted database/payment records.
export const REQUIRED_UNIQUE_LIKES = 1000;
export const MOTION_DURATION_SECONDS = 4;
export const MOTION_PRICE_CENTS = 200;
export const STILL_TARGET_HOURS = 72;
export type StageEvidence = {
  paymentVerified: boolean;
  paymentRefunded: boolean;
  motionCardId: string | null;
  motionDurationSeconds: number | null;
  stillCardId: string | null;
  stillSourceMotionCardId: string | null;
  approvedForPublicDisplay: boolean;
  verifiedVoterIds: readonly string[];
};
export function evaluateStage(e: StageEvidence) {
  const uniqueLikes = new Set(e.verifiedVoterIds.filter(id => id.trim().length > 0)).size;
  const motionReady = Boolean(e.motionCardId && e.motionDurationSeconds === MOTION_DURATION_SECONDS);
  const stillReady = Boolean(e.stillCardId && e.approvedForPublicDisplay);
  const linked = motionReady && e.stillSourceMotionCardId === e.motionCardId;
  const bracketEligible = e.paymentVerified && !e.paymentRefunded && linked && stillReady && uniqueLikes >= REQUIRED_UNIQUE_LIKES;
  return { uniqueLikes, motionReady, stillReady, bracketEligible,
    stage: bracketEligible ? 3 : stillReady ? 2 : 1,
    publicMotionVisible: motionReady && e.approvedForPublicDisplay && !stillReady,
    likesRemaining: Math.max(0, REQUIRED_UNIQUE_LIKES - uniqueLikes) };
}
