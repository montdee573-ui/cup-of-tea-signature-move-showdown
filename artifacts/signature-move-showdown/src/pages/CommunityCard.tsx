import { useState } from "react";
import { useParams, Link } from "wouter";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, Copy, Share2 } from "lucide-react";
import {
  getGetCommunityCardQueryKey,
  getListMerchCatalogQueryKey,
  useGetCommunityCard,
  useListMerchCatalog,
} from "@workspace/api-client-react";

export default function CommunityCardPage() {
  const { id = "" } = useParams<{ id: string }>();
  const card = useGetCommunityCard(id, { query: { queryKey: getGetCommunityCardQueryKey(id), enabled: Boolean(id), refetchOnMount: "always" } });
  const merchCatalog = useListMerchCatalog({
    query: {
      queryKey: getListMerchCatalogQueryKey(),
      enabled: Boolean(card.data?.merchProductId),
    },
  });
  const [shareState, setShareState] = useState<"idle" | "copied" | "shared" | "error">("idle");

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${card.data?.displayName ?? "Community"} — ${card.data?.moveName ?? "move card"}`, url });
        setShareState("shared");
      } else {
        await navigator.clipboard.writeText(url);
        setShareState("copied");
      }
    } catch {
      setShareState("error");
    }
  };

  if (card.isLoading) return <main className="community-detail"><p className="community-status">Loading this community card…</p></main>;
  if (card.isError || !card.data) return <main className="community-detail">
    <div className="state-panel"><CircleAlert size={24} /><h1>This card is unavailable.</h1><p>Only approved moves are published in the public archive.</p><Link className="button-primary" href="/"><ArrowLeft size={15} /> Back to archive</Link></div>
  </main>;

  const entry = card.data;
  const merchProduct = entry.merchProductId
    ? merchCatalog.data?.find((item) => item.id === entry.merchProductId)
    : undefined;
  return <main className="community-detail">
    <Link className="back-link" href="/"><ArrowLeft size={15} /> All move cards</Link>
    <div className="community-detail-layout">
      <article className={`community-art community-art-${entry.design}`}>
        <span className="community-art-mark">VIRAL REEL · COMMUNITY</span>
        <span className="community-art-sport">{entry.sport.toUpperCase()}</span>
        <span className="community-art-name">{entry.displayName}</span>
        <span className="community-art-move">{entry.moveName}</span>
      </article>
      <section className="community-detail-copy">
        <span className="eyebrow">APPROVED COMMUNITY CARD <b>·</b> {entry.sport.toUpperCase()}</span>
        <h1>{entry.displayName}</h1>
        <p className="community-handle">{entry.handle} · {entry.category}{entry.team ? ` · ${entry.team}` : ""}</p>
        <h2>{entry.moveName}</h2>
        <p className="community-policy">This participant entry was approved for the public archive. Entry, voting, eligibility, and results are free and are never affected by merchandise.</p>
        {entry.merchProductId !== null && <p className="community-merch-match">PLANNED MERCH MATCH · {merchProduct?.title ?? `Catalog item #${entry.merchProductId}`} <span>Planning only · no product or checkout</span></p>}
        <video className="community-video" controls playsInline preload="metadata" src={entry.videoUrl} aria-label={`Approved move video: ${entry.moveName}`} />
        <div className="community-share-row">
          <button className="button-primary" type="button" onClick={() => void share()} data-testid="button-share-community-card">
            {shareState === "shared" ? <Check size={15} /> : shareState === "copied" ? <Copy size={15} /> : <Share2 size={15} />}
            {shareState === "shared" ? "Shared" : shareState === "copied" ? "Link copied" : "Share this card"}
          </button>
          <Link className="community-contest-link" href="/showdown">Enter the free showdown <ArrowUpRight size={14} /></Link>
        </div>
        {shareState === "error" && <p className="community-share-error" role="status">Could not share automatically. Copy this page’s address from your browser.</p>}
        <time className="community-added" dateTime={entry.createdAt}>ADDED {new Date(entry.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</time>
      </section>
    </div>
  </main>;
}
