import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { SignIn, SignUp, useClerk, useUser } from "@clerk/react";
import {
  useGetPromoterAccount, useGetPromoterProgramStatus, useSubmitPromoterApplication,
  useGetPromoterDashboard,
  getGetPromoterAccountQueryKey, getGetPromoterProgramStatusQueryKey, getGetPromoterDashboardQueryKey,
} from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const dollars = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function PromoterSignIn() {
  return <main className="page"><Link href="/">Back to Viral Reel</Link>
    <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
      forceRedirectUrl={`${basePath}/promoter/dashboard`} />
  </main>;
}
export function PromoterSignUp() {
  return <main className="page"><Link href="/">Back to Viral Reel</Link>
    <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}
      forceRedirectUrl={`${basePath}/promoter/apply`} />
  </main>;
}
function AccountActions() {
  const { signOut } = useClerk();
  return <button type="button" onClick={() => void signOut({ redirectUrl: basePath || "/" })}>Sign out of promoter account</button>;
}
function AccountPrompt() {
  return <p><Link href="/sign-in">Sign in</Link> or <Link href="/sign-up">create an account</Link> with a verified email.
    This does not approve you for work, activate earnings or grant team access.</p>;
}
export function PromoterApplication() {
  const { isLoaded, isSignedIn } = useUser();
  const program = useGetPromoterProgramStatus({ query: { queryKey: getGetPromoterProgramStatusQueryKey(), refetchOnWindowFocus: true } });
  const account = useGetPromoterAccount({ query: { queryKey: getGetPromoterAccountQueryKey(), enabled: isSignedIn === true, retry: false, gcTime: 0 } });
  const application = useSubmitPromoterApplication({ request: { headers: { "X-Promoter-Action": "apply" } } });
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get("org") ?? "");
  const [acknowledged, setAcknowledged] = useState(false);
  function submit(event: FormEvent) {
    event.preventDefault();
    application.mutate({ data: { recruitmentCode: code.trim().toUpperCase(), termsAcknowledged: true } },
      { onSuccess: () => { void account.refetch(); setAcknowledged(false); } });
  }
  return <section className="state-panel"><h1>Promoter applications</h1>
    <p>Target initial campaign: December 7–16, 2026. The full competition continues through May 2027 Show Week.</p>
    <p>Eligibility, lawful work arrangements, guardian consent where required, training and payment activation need approval. Earnings are not guaranteed.</p>
    {!isLoaded ? <p>Loading account…</p> : !isSignedIn ? <AccountPrompt /> : <>
      <AccountActions />
      {account.isLoading ? <p>Checking application…</p> : account.isError ? <p role="alert">Could not verify your application. Verify your email and try again. <button onClick={() => void account.refetch()}>Retry</button></p>
        : account.data?.registered ? <><p role="status">Your application: {account.data.status}. An account or application is not approval to begin work.</p><Link href="/promoter/dashboard">Your dashboard</Link></>
        : program.data?.registrationOpen ? <form onSubmit={submit}>
          <label>Organization recruitment code <input value={code} maxLength={27} required pattern="ORG[A-Fa-f0-9]{24}" onChange={e => setCode(e.target.value.toUpperCase())} /></label>
          <label><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} /> I understand owner approval, eligibility and applicable consent are required before work or earnings. I will not collect cash or submit customer footage without permission.</label>
          <button disabled={!acknowledged || application.isPending}>{application.isPending ? "Submitting…" : "Submit for review"}</button>
          {application.isError && <p role="alert">Application was not saved. Check your organization code, verified email and recruitment availability before retrying.</p>}
        </form> : <p role="status">Application intake is awaiting owner approval. No application information is being collected.</p>}
    </>}
    {program.isError && <p role="alert">Program availability could not be checked. Please try again later.</p>}
    <p><Link href="/promoter">Program information</Link></p>
  </section>;
}

export function PersonalPromoterDashboard() {
  const { isLoaded, isSignedIn } = useUser();
  const [copied, setCopied] = useState(false);
  const account = useGetPromoterAccount({ query: { queryKey: getGetPromoterAccountQueryKey(), enabled: isSignedIn === true, retry: false, gcTime: 0, refetchOnWindowFocus: true } });
  const program = useGetPromoterProgramStatus();
  const dashboard = useGetPromoterDashboard({ query: {
    queryKey: getGetPromoterDashboardQueryKey(),
    enabled: isSignedIn === true && account.data?.status === "approved" && program.data?.dashboardEnabled === true,
    retry: false, gcTime: 0, refetchOnWindowFocus: true, refetchInterval: 60_000,
  } });
  const link = dashboard.data?.referralCode
    ? `${window.location.origin}${basePath}/?ref=${encodeURIComponent(dashboard.data.referralCode)}` : null;
  return <section className="state-panel"><h1>Your promoter dashboard</h1>
    {!isLoaded ? <p>Loading account…</p> : !isSignedIn ? <AccountPrompt /> : <>
      <AccountActions />
      {account.isLoading ? <p>Checking account…</p> : account.isError ? <p role="alert">Unable to verify your account. <button onClick={() => void account.refetch()}>Retry</button></p>
        : !account.data?.registered ? <p><Link href="/promoter/apply">Apply through your organization</Link>. Recruitment must be open.</p>
        : account.data.status !== "approved" ? <p role="status">Application status: {account.data.status}. Eligibility, consent requirements and owner approval must be satisfied before work.</p>
        : !program.data?.dashboardEnabled ? <p role="status">Your application is approved. Dashboard activation and work authorization still require owner confirmation.</p>
        : dashboard.isLoading ? <p>Loading your recorded earnings…</p> : dashboard.isError ? <p role="alert">Your dashboard could not be verified. Organization access may have changed. <button onClick={() => void dashboard.refetch()}>Retry</button></p>
        : dashboard.data && <>
          <button onClick={() => void dashboard.refetch()} disabled={dashboard.isFetching}>Refresh earnings</button>
          <h2>Personal referral link</h2><p>{link}</p>
          {link && <button onClick={() => { navigator.clipboard.writeText(link).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? "Copied" : "Copy link"}</button>}
          <h2>Recorded commissions</h2>
          <dl><dt>Today ({dashboard.data.timezone})</dt><dd>{dollars(dashboard.data.totals.daily)}</dd>
            <dt>Motion cards</dt><dd>{dollars(dashboard.data.totals.motion)}</dd>
            <dt>Merchandise</dt><dd>{dollars(dashboard.data.totals.merchandise)}</dd>
            <dt>All recorded credits</dt><dd>{dollars(dashboard.data.totals.total)}</dd>
            <dt>Pending review, not a guaranteed payout</dt><dd>{dollars(dashboard.data.totals.pending)}</dd>
          </dl>
          <p>Daily cap: $96. Initial ten-day campaign cap: $960. All-recorded totals are not a verified campaign-period total. Final campaign boundaries and refund/payout accounting await approval. Statutory wages remain separate.</p>
          {!program.data?.commissionsEnabled && <p role="status">Live commission recording is not enabled. No earnings are guaranteed.</p>}
          <h2>Recent credits</h2>{dashboard.data.recent.length === 0 ? <p>No recorded credits.</p> : <ul>{dashboard.data.recent.map(credit => <li key={credit.id}>{new Date(credit.createdAt).toLocaleDateString()} · {credit.product} · {dollars(credit.commissionCents)} · {credit.status}</li>)}</ul>}
          <h2>Assignments and safeguards</h2><ol>
            <li>Share your personal referral link for customer self-service.</li>
            <li>Assist customers only after training and authorization. Do not collect cash, ask for payment credentials or upload footage without permission.</li>
          </ol><p>Customers pay online. Approved merchandise availability, assisted-sale tools and work activation must be confirmed before use.</p>
        </>}
    </>}
    <p><Link href="/promoter">Program information</Link> · <Link href="/">Browse the public archive</Link></p>
  </section>;
}
