const KEY = "viral-reel-promoter-referral";
let current: string | null = null;

export function normalizeReferral(value: string | null): string | null {
  const code = value?.trim().toUpperCase();
  return code && /^P[A-F0-9]{24}$/.test(code) ? code : null;
}
export function capturePromoterReferral() {
  const candidate = normalizeReferral(new URLSearchParams(window.location.search).get("ref"));
  if (!candidate) return;
  current = candidate;
  try { sessionStorage.setItem(KEY, candidate); } catch { /* Keep this tab's in-memory attribution when storage is unavailable. */ }
}
export function promoterReferralHeaders(): Record<string, string> {
  let stored: string | null = null;
  try { stored = sessionStorage.getItem(KEY); } catch { /* In-memory attribution remains usable. */ }
  const code = current ?? normalizeReferral(stored);
  return code ? { "X-Promoter-Referral": code } : {};
}
