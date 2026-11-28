import { useState } from "react";

export default function PromoterApprovalActions({ id, verified, consent, status, onChanged }: {
  id: number; verified: boolean; consent: boolean; status: string; onChanged: () => void;
}) {
  const [eligibility, setEligibility] = useState(verified);
  const [guardian, setGuardian] = useState(consent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function update(action: "verify" | "approve") {
    if (!window.confirm(action === "verify"
      ? "Record completed eligibility and required guardian-consent checks? Only confirm evidence you have actually reviewed."
      : "Approve this verified promoter? This does not activate payments, waive employment requirements or authorize youth work.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/owner/promoters/${id}/${action}`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Promoter-Action": action },
        body: JSON.stringify(action === "verify" ? { eligibilityVerified: eligibility, consentRequirementsSatisfied: guardian } : {}),
      });
      if (!response.ok) throw new Error(`The server did not accept this action (${response.status}). Check your owner session and evidence.`);
      onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this action."); }
    finally { setBusy(false); }
  }
  return <div>
    <label><input type="checkbox" checked={eligibility} disabled={busy} onChange={e => setEligibility(e.target.checked)} /> Eligibility reviewed and verified</label>
    <label><input type="checkbox" checked={guardian} disabled={busy} onChange={e => setGuardian(e.target.checked)} /> Required guardian consent verified or not applicable after review</label>
    <button type="button" disabled={busy || !eligibility || !guardian || status !== "pending"} onClick={() => void update("verify")}>Save verification</button>{" "}
    <button type="button" disabled={busy || !verified || !consent || status === "approved"} onClick={() => void update("approve")}>Approve promoter</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
