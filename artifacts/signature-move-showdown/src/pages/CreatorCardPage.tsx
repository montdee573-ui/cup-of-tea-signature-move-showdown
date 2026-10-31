import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, CircleDot, Film, LockKeyhole, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Link, useParams } from "wouter";
import {
  useCreateCreatorMotionCardCheckout,
  useGetCreatorCardAccess,
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
  const access = useGetCreatorCardAccess();
  const checkout = useCreateCreatorMotionCardCheckout();
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

  const refresh = () => {
    if (id && token) access.mutate({ id, data: { creatorToken: token } });
  };
  const startCheckout = () => {
    if (!id || !token) return;
    setCheckoutMessage("");
    checkout.mutate({ id, data: { creatorToken: token } }, {
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
              {data.submissionStatus === "pending" && <p>Your clip is still with the moderation team. The optional motion-card option becomes available after approval.</p>}
              {data.submissionStatus === "rejected" && <p>This submission was not approved. Motion-card checkout is not available for it.</p>}
              {data.submissionStatus === "approved" && <p>Your move is approved. A motion card is an optional personal extra; it does not affect the free contest.</p>}
              <button type="button" className="creator-refresh" onClick={refresh} disabled={access.isPending}><RefreshCw size={13} /> Refresh status</button>
            </section>

            {data.submissionStatus === "approved" && data.motionStatus !== "paid" && <>
              <section className="creator-offer">
                <div><span className="launch-label"><Film size={13} /> OPTIONAL CREATOR EXTRA</span><h2>A four-second motion card.</h2><p>A one-time <strong>$2</strong> Whop checkout unlocks a short in-app animation made from your approved card details.</p></div>
                <div className="creator-offer-meta"><span>ONE-TIME</span><strong>$2</strong><small>No subscription</small></div>
                {data.motionStatus !== "unavailable" && <button type="button" className="creator-checkout-button" onClick={startCheckout} disabled={checkout.isPending || access.isPending}>
                  {checkout.isPending ? "Preparing secure checkout…" : data.motionStatus === "checkout_pending" ? "Continue to checkout" : "Unlock motion card"} <ArrowRight size={15} />
                </button>}
                {checkoutMessage && <p className="creator-feedback" role="status">{checkoutMessage}</p>}
                {checkout.isError && !checkoutMessage && <p className="creator-feedback" role="alert">{checkout.error instanceof Error ? checkout.error.message : "Checkout is temporarily unavailable."}</p>}
              </section>
              {data.motionStatus === "unavailable" && <p className="creator-unavailable" role="status">Optional checkout is not available right now. Your approved entry and free contest access are unchanged.</p>}
            </>}

            {data.motionStatus === "paid" && card && <section className="creator-motion-section" data-testid="creator-paid-motion">
              <div className="creator-motion-heading"><div><span className="launch-label"><CircleCheck size={13} /> PAYMENT CONFIRMED</span><h2>Your motion card</h2></div><span className="creator-four-sec">04 SEC · TEMPLATE</span></div>
              <div className={`motion-card ${card.design}`} aria-label={`Four-second animated template card for ${card.displayName}, performing ${card.moveName}`}>
                <div className="motion-card-sheen" />
                <span className="motion-card-brand">CUP OF TEA <i>·</i> SIGNATURE MOVE</span>
                <span className="motion-card-number">CREATOR / 01</span>
                <div className="motion-card-orbit" aria-hidden="true"><span /><i /><b /></div>
                <div className="motion-card-copy"><span>{card.sport.toUpperCase()} · APPROVED ENTRY</span><h3>{card.moveName}</h3><strong>{card.displayName}</strong><p>{card.handle}{card.team ? ` · ${card.team}` : ""}</p></div>
                <div className="motion-card-footer"><span>PRIVATE TEMPLATE</span><span>NOT A PUBLIC CARD</span></div>
              </div>
              <p className="creator-template-note"><ShieldCheck size={15} /> Temporary Replit template animation rendered in this app from your card data. It is not Base44 generation and is not part of official results.</p>
            </section>}

            <section className="creator-boundary"><CircleDot size={16} /><p><strong>Contest boundary:</strong> this optional card is separate from public cards, free entry, votes, current pairwise matchups, standings, and official Base44 results. It creates no bracket and changes no prize or contest rule.</p></section>
          </div>}
  </main>;
}
