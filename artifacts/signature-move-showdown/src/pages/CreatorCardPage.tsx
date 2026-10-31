import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, CircleDot, Film, LockKeyhole, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Link, useParams } from "wouter";
import {
  useCreateCreatorMotionCardCheckout,
  useGetCreatorCardAccess,
  useRetryCreatorMotionGeneration,
} from "@workspace/api-client-react";
import type { CreatorCardAccessResponse } from "@workspace/api-client-react";

function readToken() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export default function CreatorCardPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [token, setToken] = useState(readToken);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [priceApproved, setPriceApproved] = useState(false);
  const access = useGetCreatorCardAccess();
  const checkout = useCreateCreatorMotionCardCheckout();
  const retryGeneration = useRetryCreatorMotionGeneration();
  const refreshAccess = useRef(access.mutate);
  refreshAccess.current = access.mutate;

  useEffect(() => {
    const syncToken = () => setToken(readToken());
    window.addEventListener("hashchange", syncToken);
    return () => window.removeEventListener("hashchange", syncToken);
  }, []);

  useEffect(() => {
    if (id && token) refreshAccess.current({ id, data: { creatorToken: token } });
  }, [id, token]);

  useEffect(() => {
    if (!id || !token || !["starting", "processing"].includes(access.data?.generationStatus ?? "")) return;
    const timer = window.setInterval(() => {
      refreshAccess.current({ id, data: { creatorToken: token } });
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [id, token, access.data?.generationStatus]);

  useEffect(() => setPriceApproved(false), [access.data?.priceUsd]);

  const refresh = () => {
    if (id && token) access.mutate({ id, data: { creatorToken: token } });
  };
  const startCheckout = () => {
    if (!id || !token || !priceApproved || !access.data?.offerAvailable || access.data.priceUsd === null) return;
    setCheckoutMessage("");
    checkout.mutate({ id, data: {
      creatorToken: token,
      approvedPriceUsd: access.data.priceUsd,
      confirmPurchase: true,
    } }, {
      onSuccess: (result) => {
        if (result.checkoutUrl) {
          try {
            const hostedUrl = new URL(result.checkoutUrl);
            if (hostedUrl.protocol === "https:" || hostedUrl.protocol === "http:") {
              window.location.assign(hostedUrl.toString());
              return;
            }
          } catch { /* Show a recoverable message for an invalid hosted URL. */ }
          setCheckoutMessage("The hosted checkout link was not valid. Please refresh and try again.");
          return;
        }
        setCheckoutMessage(result.motionStatus === "paid"
          ? "Payment confirmed. Refreshing your private card…"
          : "Checkout is ready. If you have completed payment, refresh this page to verify access.");
        refreshAccess.current({ id, data: { creatorToken: token } });
      },
      onError: (error) => setCheckoutMessage(error instanceof Error ? error.message : "Checkout could not be started. Please try again."),
    });
  };
  const retryReel = () => {
    if (!id || !token) return;
    retryGeneration.mutate({ id, data: { creatorToken: token } }, {
      onSuccess: () => refreshAccess.current({ id, data: { creatorToken: token } }),
    });
  };

  const data: CreatorCardAccessResponse | undefined = access.data;
  const card = data?.card;
  const loading = access.isPending || access.isIdle;

  return <main className="creator-page">
    <div className="creator-topline"><Link href="/submit" className="back-link"><ArrowLeft size={15} /> Submission receipt</Link><span><LockKeyhole size={12} /> PRIVATE LINK · NO LOGIN</span></div>
    <header className="creator-heading">
      <span className="launch-label"><Sparkles size={13} /> CUP OF TEA · CREATOR CARD</span>
      <h1>Your move,<br /><em>in motion.</em></h1>
      <p>This creator-only page is separate from public cards and the free Signature Move Showdown.</p>
    </header>

    {!token ? <section className="creator-state" role="alert" data-testid="creator-token-missing"><LockKeyhole size={24} /><h2>Private token missing</h2><p>Open the complete private link from your submission receipt. This page does not use an account or password.</p></section> :
      loading ? <section className="creator-state creator-loading" role="status" data-testid="creator-loading"><div className="creator-skeleton-card" /><span className="creator-skeleton-line" /><span className="creator-skeleton-line short" /><p>Checking your private card…</p></section> :
        access.isError ? <section className="creator-state" role="alert" data-testid="creator-error"><CircleAlert size={24} /><h2>We couldn’t open this card.</h2><p>The link may be incomplete, or the service may be temporarily unavailable.</p><button type="button" className="creator-secondary-button" onClick={refresh} disabled={access.isPending}><RefreshCw size={14} /> Try again</button></section> :
          data && <div className="creator-content" data-testid="creator-card-access">
            <section className="creator-status-panel">
              <div className="creator-status-head"><span className={`creator-status-dot ${data.submissionStatus}`} /><span className="launch-label">MODERATION STATUS</span><strong>{data.submissionStatus.replace("_", " ").toUpperCase()}</strong></div>
              {data.submissionStatus === "pending" && <p>Your clip is still with the moderation team. An optional creator reel may be offered after approval.</p>}
              {data.submissionStatus === "rejected" && <p>This submission was not approved. A creator-reel purchase is not available for it.</p>}
              {data.submissionStatus === "approved" && <p>Your move is approved. Any optional creator reel is separate from free contest entry and results.</p>}
              <button type="button" className="creator-refresh" onClick={refresh} disabled={access.isPending}><RefreshCw size={13} /> Refresh status</button>
            </section>

            {data.submissionStatus === "approved" && data.motionStatus !== "paid" && <>
              {data.offerAvailable && data.priceUsd !== null ? <section className="creator-offer" data-testid="creator-reel-offer">
                <div><span className="launch-label"><Film size={13} /> OPTIONAL CREATOR EXTRA</span><h2>A four-second generated reel.</h2><p>A private AI-generated sports reel inspired by your submitted sport and move name. It is personal content only and is not used in the contest. Check the final total on secure checkout before paying.</p></div>
                <div className="creator-offer-meta"><span>ONE-TIME PRICE</span><strong>${data.priceUsd.toFixed(2)}</strong><small>No subscription</small></div>
                <label className="creator-price-approval"><input type="checkbox" checked={priceApproved} onChange={(event) => setPriceApproved(event.target.checked)} />
                  I approve a one-time charge of ${data.priceUsd.toFixed(2)} USD.
                </label>
                <button type="button" className="creator-checkout-button" onClick={startCheckout} disabled={!priceApproved || checkout.isPending || access.isPending}>
                  {checkout.isPending ? "Preparing secure checkout…" : data.motionStatus === "checkout_pending" ? "Continue to checkout" : "Review secure checkout"} <ArrowRight size={15} />
                </button>
                {checkoutMessage && <p className="creator-feedback" role="status">{checkoutMessage}</p>}
                {checkout.isError && !checkoutMessage && <p className="creator-feedback" role="alert">{checkout.error instanceof Error ? checkout.error.message : "Checkout is temporarily unavailable."}</p>}
              </section> : <p className="creator-unavailable" role="status" data-testid="creator-reel-unavailable">
                Optional creator-reel sales are not enabled. The owner must approve the payment provider and final price first. Your free entry and contest access are unchanged.
              </p>}
            </>}

            {data.motionStatus === "paid" && <section className="creator-motion-section" data-testid="creator-paid-motion">
              <div className="creator-motion-heading"><div><span className="launch-label"><CircleCheck size={13} /> PAYMENT CONFIRMED</span><h2>Your generated reel</h2></div><span className="creator-four-sec">04 SEC · PRIVATE</span></div>
              {data.generationStatus === "starting" || data.generationStatus === "processing" || data.generationStatus === "not_started"
                ? <p className="creator-feedback" role="status">Your reel is generating. This page will update automatically. No additional charge is made while it processes.</p>
                : null}
              {data.generationStatus === "failed" && <div className="creator-feedback" role="alert">
                <p>{data.generationError || "The reel did not finish."} You can retry without paying again. If a retry still cannot complete, contact the owner to request a full refund.</p>
                <button type="button" className="creator-secondary-button" onClick={retryReel} disabled={retryGeneration.isPending}>
                  <RefreshCw size={14} /> {retryGeneration.isPending ? "Retrying generation…" : "Retry at no extra charge"}
                </button>
                {retryGeneration.isError && <p>{retryGeneration.error instanceof Error ? retryGeneration.error.message : "The retry could not be started."}</p>}
              </div>}
              {data.generationStatus === "succeeded" && data.motionVideoUrl && <>
                <video className="creator-motion-video" controls playsInline preload="metadata" src={data.motionVideoUrl} aria-label={`Generated four-second reel inspired by ${card?.moveName ?? "your submitted move"}`} data-testid="video-creator-motion" />
                <a className="creator-download-link" href={data.motionVideoUrl} download="creator-move-reel.mp4">Download your private reel</a>
              </>}
              <p className="creator-generated-note"><ShieldCheck size={15} /> The reel is private creator content, generated from your submitted sport and move name. It never affects eligibility, votes, rankings, or official results.</p>
            </section>}

            <section className="creator-boundary"><CircleDot size={16} /><p><strong>Contest boundary:</strong> this optional card is separate from public cards, free entry, votes, current pairwise matchups, standings, and official Base44 results. It creates no bracket and changes no prize or contest rule.</p></section>
          </div>}
  </main>;
}
