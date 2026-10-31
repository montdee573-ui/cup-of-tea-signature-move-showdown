import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Check, CircleAlert, Clock3, FileVideo, Film, LockKeyhole,
  LogOut, RefreshCw, ShieldCheck, X,
} from "lucide-react";
import {
  getGetMoveSubmissionVideoUrl,
  getGetStudioSessionQueryKey,
  getListMoveSubmissionsForReviewQueryKey,
  useCreateStudioSession,
  useDeleteStudioSession,
  useGetStudioSession,
  useListMoveSubmissionsForReview,
  useReviewMoveSubmission,
} from "@workspace/api-client-react";
import type { MoveSubmission } from "@workspace/api-client-react";
import MerchMockupStudio from "./MerchMockupStudio";

function readableSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SubmissionCard({
  submission,
  busy,
  onReview,
}: {
  submission: MoveSubmission;
  busy: boolean;
  onReview: (id: string, status: "approved" | "rejected") => void;
}) {
  const videoUrl = getGetMoveSubmissionVideoUrl(submission.id);
  return <article className="review-card" data-testid={`review-item-${submission.id}`}>
    <div className="review-card-main">
      <div className="review-card-heading">
        <span className="review-number">SUBMISSION / {submission.id.slice(0, 8).toUpperCase()}</span>
        <span className="review-pending"><Clock3 size={12} /> PENDING</span>
      </div>
      <div className="review-identity">
        <span className="review-avatar">{submission.displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
        <div><h2>{submission.moveName}</h2><p>{submission.displayName} <span>{submission.handle}</span></p></div>
      </div>
      <div className="review-tags"><span>{submission.sport}</span><span>{submission.category}</span>{submission.team && <span>{submission.team}</span>}</div>
      <dl className="review-metadata">
        <div><dt>FILE</dt><dd><FileVideo size={13} /> {submission.videoFileName}</dd></div>
        <div><dt>SIZE / TYPE</dt><dd>{readableSize(submission.videoSizeBytes)} · {submission.videoContentType}</dd></div>
        <div><dt>SUBMITTED</dt><dd>{new Date(submission.createdAt).toLocaleString()}</dd></div>
        <div><dt>CONSENT RECORDED</dt><dd>{new Date(submission.consentAt).toLocaleString()}</dd></div>
        <div><dt>CARD FINISH</dt><dd>{submission.design === "holo" ? "Holographic" : "Night court"}</dd></div>
        {submission.merchProductId !== null && <div><dt>PLANNED MERCH ITEM</dt><dd>Printful catalog item #{submission.merchProductId}</dd></div>}
      </dl>
    </div>
    <div className="review-media">
      <div className="review-media-label"><LockKeyhole size={13} /> PRIVATE PREVIEW · OWNER ONLY</div>
      <video controls playsInline preload="metadata" src={videoUrl} aria-label={`Private review video for ${submission.moveName}`} data-testid={`video-review-${submission.id}`} />
      <div className="review-actions">
        <button className="review-reject" type="button" onClick={() => onReview(submission.id, "rejected")} disabled={busy} data-testid={`button-reject-${submission.id}`}><X size={15} /> Reject</button>
        <button className="review-approve" type="button" onClick={() => onReview(submission.id, "approved")} disabled={busy} data-testid={`button-approve-${submission.id}`}><Check size={15} /> {busy ? "Saving…" : "Approve"}</button>
      </div>
    </div>
  </article>;
}

export default function SubmissionReview() {
  const queryClient = useQueryClient();
  const session = useGetStudioSession({ query: { queryKey: getGetStudioSessionQueryKey(), retry: false } });
  const authenticated = Boolean(session.data?.authenticated);
  const queue = useListMoveSubmissionsForReview({
    query: {
      queryKey: getListMoveSubmissionsForReviewQueryKey(),
      enabled: authenticated,
      retry: false,
      refetchOnMount: "always",
    },
  });
  const createSession = useCreateStudioSession();
  const deleteSession = useDeleteStudioSession();
  const reviewSubmission = useReviewMoveSubmission();
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const refreshSession = () => {
    void queryClient.invalidateQueries({ queryKey: getGetStudioSessionQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListMoveSubmissionsForReviewQueryKey() });
  };
  const signIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    createSession.mutate({ data: { password } }, {
      onSuccess: () => {
        setPassword("");
        refreshSession();
      },
      onError: (error) => setLoginError(error instanceof Error ? error.message : "The passphrase was not accepted."),
    });
  };
  const decide = (id: string, status: "approved" | "rejected") => {
    reviewSubmission.mutate({ id, data: { status } }, {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListMoveSubmissionsForReviewQueryKey() }),
    });
  };
  const signOut = () => {
    deleteSession.mutate(undefined, {
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: getListMoveSubmissionsForReviewQueryKey() });
        refreshSession();
      },
    });
  };

  return <main className="review-page">
    <header className="review-topbar">
      <Link href="/" className="review-brand"><span className="brand-mark"><Film size={16} /></span><span>SIGNATURE MOVE<small>COMMUNITY ARCHIVE</small></span></Link>
      <Link href="/" className="review-back"><ArrowLeft size={14} /> Public archive</Link>
    </header>

    {session.isLoading ? <section className="review-auth-loading" aria-label="Checking owner session"><span /><span /><span /></section> : !authenticated ? <section className="review-login-wrap">
      <div className="review-login-art"><div className="review-art-ring" /><div className="review-art-copy"><span>PRIVATE ROOM / 01</span><strong>Review<br />with care.</strong><p>Every move enters the archive through a human review.</p></div><span className="review-art-stamp">STUDIO<br />ACCESS</span></div>
      <form className="review-login" onSubmit={signIn}>
        <span className="launch-label"><LockKeyhole size={13} /> OWNER ACCESS ONLY</span>
        <h1>Moderation<br /><em>desk.</em></h1>
        <p>Sign in with your existing Studio passphrase to see and review private submissions.</p>
        {session.data?.configured === false && <div className="review-alert"><CircleAlert size={16} /><span>Owner access is not configured on this server.</span></div>}
        {session.isError && <div className="review-alert"><CircleAlert size={16} /><span>Could not check the Studio session. Retry the connection before signing in.</span><button type="button" onClick={() => void session.refetch()} aria-label="Retry session check"><RefreshCw size={14} /></button></div>}
        <label htmlFor="review-password">Studio passphrase</label>
        <input type="text" name="username" autoComplete="username" value="studio-owner" readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
        <input id="review-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter passphrase" disabled={createSession.isPending} data-testid="input-review-password" />
        {loginError && <p className="review-form-error" role="alert" data-testid="status-review-login-error">{loginError}</p>}
        <button className="review-login-button" type="submit" disabled={session.data?.configured === false || !password.trim() || createSession.isPending} data-testid="button-review-login"><LockKeyhole size={15} /> {createSession.isPending ? "Verifying access…" : "Open moderation desk"}</button>
        <div className="review-login-note"><ShieldCheck size={15} /><span>Submissions and video previews are not visible to the public.</span></div>
      </form>
    </section> : <section className="review-workspace">
      <div className="review-heading">
        <div><span className="launch-label"><ShieldCheck size={13} /> PRIVATE STUDIO / MODERATION</span><h1>The review<br /><em>desk.</em></h1><p>Watch each move in full. Approve only when it is ready for the public archive.</p></div>
        <div className="review-heading-side"><div className="review-session-state"><span /> OWNER SESSION ACTIVE</div><button className="review-signout" type="button" onClick={signOut} disabled={deleteSession.isPending} data-testid="button-review-signout"><LogOut size={14} /> {deleteSession.isPending ? "Signing out…" : "Sign out"}</button></div>
      </div>
      <div className="review-queue-heading"><div><span className="launch-label">INCOMING MOVES</span><h2>Awaiting a closer look</h2></div><div className="review-queue-tools"><span>{queue.data?.length ?? 0} <small>IN QUEUE</small></span><button type="button" onClick={() => void queue.refetch()} disabled={queue.isFetching} data-testid="button-refresh-review"><RefreshCw size={14} className={queue.isFetching ? "spin-icon" : ""} /> Refresh</button></div></div>
      {reviewSubmission.isError && <div className="review-alert review-decision-error" role="alert"><CircleAlert size={16} /><span>{reviewSubmission.error instanceof Error ? reviewSubmission.error.message : "Could not save the moderation decision. Try again."}</span></div>}
      {queue.isLoading ? <div className="review-list-skeleton" aria-label="Loading review queue"><div /><div /></div> :
        queue.isError ? <div className="review-empty review-error"><CircleAlert size={22} /><h2>Queue unavailable</h2><p>We could not load private submissions. The public archive is unchanged.</p><button type="button" onClick={() => void queue.refetch()}><RefreshCw size={14} /> Try again</button></div> :
          !queue.data?.length ? <div className="review-empty"><ShieldCheck size={24} /><span className="launch-label">ALL CAUGHT UP</span><h2>No moves waiting.</h2><p>New submissions will appear here after they are sent for review.</p><button type="button" onClick={() => void queue.refetch()}><RefreshCw size={14} /> Check again</button></div> :
            <div className="review-list">{queue.data.map((submission) => <SubmissionCard key={submission.id} submission={submission} busy={reviewSubmission.isPending && reviewSubmission.variables?.id === submission.id} onReview={decide} />)}</div>}
      <MerchMockupStudio />
      <div className="review-privacy-foot"><LockKeyhole size={14} /><span>Private submissions stay out of all public archive views until moderation is complete.</span></div>
    </section>}
  </main>;
}
