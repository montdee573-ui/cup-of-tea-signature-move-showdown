import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Check, CircleAlert, Clock3, FileVideo, Film, LockKeyhole, ClipboardCheck,
  LogOut, RefreshCw, ShieldCheck, X,
} from "lucide-react";
import {
  getGetMoveSubmissionVideoUrl,
  getGetStudioSessionQueryKey,
  getListCreatorMotionRefundRequestsQueryKey,
  getListMoveSubmissionsForReviewQueryKey,
  useListCreatorMotionRefundRequests,
  useResolveCreatorMotionRefundRequest,
  useRetryCreatorMotionRefundNotification,
  useCreateStudioSession,
  useDeleteStudioSession,
  useGetStudioSession,
  useListMoveSubmissionsForReview,
  useReviewMoveSubmission,
} from "@workspace/api-client-react";
import type { CreatorMotionRefundRequest, MoveSubmission } from "@workspace/api-client-react";
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
        {submission.merchProductId !== null && <div><dt>PLANNED MERCH ITEM</dt><dd>{submission.merchProductName ?? `Printful catalog item #${submission.merchProductId}`}</dd></div>}
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
  const refundQueue = useListCreatorMotionRefundRequests({
    query: {
      queryKey: getListCreatorMotionRefundRequestsQueryKey(),
      enabled: authenticated,
      retry: false,
      refetchOnMount: "always",
    },
  });
  const createSession = useCreateStudioSession();
  const deleteSession = useDeleteStudioSession();
  const reviewSubmission = useReviewMoveSubmission();
  const resolveRefund = useResolveCreatorMotionRefundRequest();
  const retryRefundNotification = useRetryCreatorMotionRefundNotification();
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [refundDecisionNotice, setRefundDecisionNotice] = useState("");

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
  const resolveRefundRequest = (
    request: CreatorMotionRefundRequest,
    decision: "refund" | "decline" | "resolve_partial",
  ) => {
    const confirmation = decision === "resolve_partial"
      ? `Record review of the confirmed $${(request.refundVerifiedAmountUsd ?? 0).toFixed(2)} partial refund for ${request.creatorName}? This will not issue another refund.`
      : decision === "refund" && request.refundRequestStatus === "processing"
        ? `Check the current Whop refund status for ${request.creatorName}?`
        : decision === "refund"
          ? `Issue a full refund of $${request.priceUsd.toFixed(2)} through Whop for ${request.creatorName}?`
          : `Decline the refund request from ${request.creatorName}?`;
    if (!window.confirm(confirmation)) return;
    resolveRefund.mutate({ id: request.submissionId, data: { decision } }, {
      onSuccess: (result) => {
        setRefundDecisionNotice(result.refundRequestStatus === "partial_review"
          ? `Whop confirmed $${(result.refundVerifiedAmountUsd ?? 0).toFixed(2)} refunded. No additional refund was issued; owner review is required.`
          : result.refundRequestStatus === "partial_resolved"
            ? `Partial refund review recorded for $${(result.refundVerifiedAmountUsd ?? 0).toFixed(2)}. ${result.notificationStatus === "sent" ? "Creator notification sent." : result.notificationStatus === "failed" ? "The creator notification could not be sent." : "No creator notification was sent."}`
            : result.notificationStatus === "sent"
              ? `Request ${result.refundRequestStatus}. Creator notification sent.`
              : result.notificationStatus === "failed"
                ? `Request ${result.refundRequestStatus}. The decision was saved, but the creator notification could not be sent.`
                : `Request ${result.refundRequestStatus}. The decision was saved, but no creator notification was sent.`);
        void queryClient.invalidateQueries({ queryKey: getListCreatorMotionRefundRequestsQueryKey() });
      },
      onError: () => {
        // An unsuccessful provider check still records an attempted check.
        void queryClient.invalidateQueries({ queryKey: getListCreatorMotionRefundRequestsQueryKey() });
      },
    });
  };
  const retryRefundEmail = (request: CreatorMotionRefundRequest) => {
    retryRefundNotification.mutate({ id: request.submissionId }, {
      onSuccess: (result) => {
        setRefundDecisionNotice(result.notificationStatus === "sent"
          ? `Creator email sent for ${request.creatorName}.`
          : result.notificationStatus === "failed"
            ? `The refund is complete, but the creator email still could not be sent for ${request.creatorName}.`
            : `No creator email was sent for ${request.creatorName}.`);
        void queryClient.invalidateQueries({ queryKey: getListCreatorMotionRefundRequestsQueryKey() });
      },
    });
  };
  const signOut = () => {
    deleteSession.mutate(undefined, {
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: getListMoveSubmissionsForReviewQueryKey() });
        queryClient.removeQueries({ queryKey: getListCreatorMotionRefundRequestsQueryKey() });
        refreshSession();
      },
    });
  };

  return <main className="review-page">
    <header className="review-topbar">
      <Link href="/" className="review-brand"><span className="brand-mark"><Film size={16} /></span><span>SIGNATURE MOVE<small>COMMUNITY ARCHIVE</small></span></Link>
      <div className="result-top-links"><Link href="/studio/results" className="review-back"><ClipboardCheck size={14} /> Final results</Link><Link href="/" className="review-back"><ArrowLeft size={14} /> Public archive</Link></div>
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
      <section className="refund-review" aria-labelledby="refund-review-title" data-testid="creator-refund-review">
        <div className="refund-review-head">
          <div><span className="launch-label">PAYMENT SUPPORT</span><h2 id="refund-review-title">Creator refund requests</h2></div>
          <button type="button" onClick={() => void refundQueue.refetch()} disabled={refundQueue.isFetching}><RefreshCw size={14} /> Refresh</button>
        </div>
        <p className="refund-review-intro">Review failed creator-reel retries. Full refunds are issued through Whop and do not change contest entries or results.</p>
        {resolveRefund.isError && <div className="review-alert" role="alert"><CircleAlert size={16} /><span>{resolveRefund.error instanceof Error ? resolveRefund.error.message : "The refund decision could not be saved. Refresh the queue and try again."}</span></div>}
        {retryRefundNotification.isError && <div className="review-alert" role="alert"><CircleAlert size={16} /><span>{retryRefundNotification.error instanceof Error ? retryRefundNotification.error.message : "The creator email could not be retried. The refund was not changed."}</span></div>}
        {refundDecisionNotice && <p className="refund-review-state" role="status">{refundDecisionNotice}</p>}
        {refundQueue.isLoading ? <p className="refund-review-state" role="status">Loading refund requests…</p> :
          refundQueue.isError ? <div className="refund-review-state error" role="alert">Refund requests are unavailable. Confirm your owner session and try again.</div> :
            !refundQueue.data?.length ? <p className="refund-review-state">No refund requests are waiting for review or email follow-up.</p> :
              <div className="refund-review-list">{refundQueue.data.map((request) => {
                const busy = (resolveRefund.isPending && resolveRefund.variables?.id === request.submissionId)
                  || (retryRefundNotification.isPending && retryRefundNotification.variables?.id === request.submissionId);
                return <article className="refund-review-card" key={request.submissionId} data-testid={`refund-request-${request.submissionId}`}>
                  <div>
                    <span className="review-number">SUBMISSION / {request.submissionId.slice(0, 8).toUpperCase()}</span>
                    <h3>{request.moveName}</h3>
                    <p>{request.creatorName} · ${request.priceUsd.toFixed(2)} USD</p>
                    <small>Requested {new Date(request.requestedAt).toLocaleString()}</small>
                    <small>Last status check attempted: {request.statusCheckedAt
                      ? <time dateTime={request.statusCheckedAt}>{new Date(request.statusCheckedAt).toLocaleString()}</time>
                      : "No check recorded"}</small>
                    {request.refundRequestStatus === "processing" && (
                      request.statusCheckUnverified
                        ? <small role="status">This refund is taking longer than expected, and its status could not be verified. Keep the request open and retry the status check later.</small>
                        : <small>Refund processing. Check the status again later if it remains pending.</small>
                    )}
                    {request.refundRequestStatus === "partial_review" && <small>Whop confirmed ${request.refundVerifiedAmountUsd?.toFixed(2) ?? "0.00"} refunded. This is not a full refund.</small>}
                    {request.refundRequestStatus === "completed" && <small>
                      {request.notificationStatus === "failed"
                        ? "Refund completed. Creator notification failed."
                        : request.notificationStatus === "sending"
                          ? "Refund completed. Creator notification is being sent."
                          : "Refund completed. Creator notification was not sent."}
                    </small>}
                  </div>
                  <div className="refund-review-actions">
                    {request.refundRequestStatus === "completed"
                      ? request.notificationStatus === "failed"
                        ? <button type="button" className="refund-approve" onClick={() => retryRefundEmail(request)} disabled={busy} data-testid={`button-retry-refund-email-${request.submissionId}`}>
                          {busy ? "Retrying email…" : "Retry creator email"}
                        </button>
                        : null
                      : <>
                    {request.refundRequestStatus === "requested" && <button type="button" className="refund-decline" onClick={() => resolveRefundRequest(request, "decline")} disabled={busy}>Decline</button>}
                    {request.refundRequestStatus === "partial_review"
                      ? <button type="button" className="refund-approve" onClick={() => resolveRefundRequest(request, "resolve_partial")} disabled={busy} data-testid={`button-resolve-partial-${request.submissionId}`}>
                        {busy ? "Recording…" : "Record partial refund review"}
                      </button>
                      : <button type="button" className="refund-approve" onClick={() => resolveRefundRequest(request, "refund")} disabled={busy}>
                        {busy ? "Processing…" : request.refundRequestStatus === "processing"
                          ? request.statusCheckUnverified ? "Retry status check" : "Check refund status"
                          : "Issue full refund through Whop"}
                      </button>}
                      </>}
                  </div>
                </article>;
              })}</div>}
      </section>
      <MerchMockupStudio />
      <div className="review-privacy-foot"><LockKeyhole size={14} /><span>Private submissions stay out of all public archive views until moderation is complete.</span></div>
    </section>}
  </main>;
}
