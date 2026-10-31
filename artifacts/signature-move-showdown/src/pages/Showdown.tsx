import { useMemo, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ArrowRight, CircleAlert, CircleDot, Plus, RefreshCw, ShieldCheck, Trophy } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListShowdownsQueryKey,
  getListCommunityCardsQueryKey,
  useCreateShowdown,
  useListCommunityCards,
  useListShowdowns,
  useVoteOnShowdown,
} from "@workspace/api-client-react";
import type { CommunityCard, Showdown as ShowdownRecord } from "@workspace/api-client-react";

const TOKEN_STORAGE_KEY = "signature-showdown-voter-token";

function readVoterToken(): string {
  try {
    const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (saved && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) return saved;
    const created = crypto.randomUUID();
    localStorage.setItem(TOKEN_STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function voteShare(left: number, right: number) {
  const total = left + right;
  return total ? Math.round((left / total) * 100) : 0;
}

function ResultLabel({ matchup }: { matchup: ShowdownRecord }) {
  const total = matchup.leftVotes + matchup.rightVotes;
  if (!total) return <span>No votes yet</span>;
  if (matchup.leftVotes === matchup.rightVotes) return <span>Tied · {total} {total === 1 ? "vote" : "votes"}</span>;
  const winner = matchup.leftVotes > matchup.rightVotes ? matchup.left : matchup.right;
  return <span><Trophy size={13} /> {winner.displayName} leads · {total} {total === 1 ? "vote" : "votes"}</span>;
}

function MatchupCard({
  matchup,
  onVote,
  busy,
}: {
  matchup: ShowdownRecord;
  onVote: (matchupId: number, entryId: string) => void;
  busy: boolean;
}) {
  const total = matchup.leftVotes + matchup.rightVotes;
  const leftPercent = voteShare(matchup.leftVotes, matchup.rightVotes);
  const rightPercent = total ? 100 - leftPercent : 0;
  const myVote = matchup.myVoteEntryId;
  const entries: [ShowdownRecord["left"], number, number][] = [
    [matchup.left, matchup.leftVotes, leftPercent],
    [matchup.right, matchup.rightVotes, rightPercent],
  ];

  return <article className="showdown-matchup" data-testid={`showdown-${matchup.id}`}>
    <header className="showdown-matchup-head">
      <span className="showdown-mode">{matchup.mode === "sport" ? `${matchup.left.sport} matchup` : "Cross-sport exhibition"}</span>
      <time dateTime={matchup.createdAt}>{new Date(matchup.createdAt).toLocaleDateString()}</time>
    </header>
    <div className="showdown-pair">
      {entries.map(([entry, votes, percent], index) => <section className={`showdown-entry ${myVote === entry.id ? "voted" : ""}`} key={entry.id}>
        <video controls playsInline preload="none" src={entry.videoUrl} aria-label={`${entry.displayName} performing ${entry.moveName}`} />
        <div className="showdown-entry-meta"><span>{entry.sport}</span><h3>{entry.displayName}</h3><p>{entry.moveName} · {entry.handle}</p>{entry.team && <small>{entry.team}</small>}</div>
        <div className="showdown-vote-result" data-testid={`result-${matchup.id}-${entry.id}`}>
          <div className="showdown-result-numbers"><strong>{votes}</strong><span>{percent}%</span></div>
          <div className="showdown-progress" role="progressbar" aria-label={`${entry.displayName} vote share`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div>
          {myVote === entry.id && <small>YOUR VOTE</small>}
        </div>
        {!myVote && <button type="button" className="showdown-vote-button" onClick={() => onVote(matchup.id, entry.id)} disabled={busy} data-testid={`button-vote-${matchup.id}-${entry.id}`}>
          Vote for this move <ArrowRight size={14} />
        </button>}
        {index === 0 && <span className="showdown-versus" aria-hidden="true">VS</span>}
      </section>)}
    </div>
    <footer className="showdown-result-summary" aria-live="polite"><ResultLabel matchup={matchup} />{myVote && <span>Voting is closed for you in this matchup.</span>}</footer>
  </article>;
}

export default function Showdown() {
  const queryClient = useQueryClient();
  const [voterToken] = useState(readVoterToken);
  const [mode, setMode] = useState<"sport" | "exhibition">("sport");
  const [firstEntryId, setFirstEntryId] = useState("");
  const [secondEntryId, setSecondEntryId] = useState("");
  const cards = useListCommunityCards({ query: { queryKey: getListCommunityCardsQueryKey(), refetchOnMount: "always" } });
  const showdowns = useListShowdowns({ voterToken }, {
    query: {
      queryKey: getListShowdownsQueryKey({ voterToken }),
      refetchOnMount: "always",
      refetchInterval: 30_000,
    },
  });
  const create = useCreateShowdown();
  const vote = useVoteOnShowdown();
  const firstEntry = cards.data?.find((entry) => entry.id === firstEntryId);
  const eligibleSecondEntries = useMemo(() => (cards.data ?? []).filter((entry) =>
    entry.id !== firstEntryId && (!firstEntry || (mode === "sport"
      ? entry.sport.toLocaleLowerCase() === firstEntry.sport.toLocaleLowerCase()
      : entry.sport.toLocaleLowerCase() !== firstEntry.sport.toLocaleLowerCase()))),
  [cards.data, firstEntry, firstEntryId, mode]);
  const invalidateShowdowns = () => queryClient.invalidateQueries({ queryKey: getListShowdownsQueryKey({ voterToken }) });
  const submitMatchup = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!firstEntryId || !secondEntryId) return;
    create.mutate({ data: { firstEntryId, secondEntryId, mode } }, {
      onSuccess: () => {
        setFirstEntryId("");
        setSecondEntryId("");
        void invalidateShowdowns();
      },
    });
  };
  const submitVote = (showdownId: number, entryId: string) => {
    vote.mutate({ id: showdownId, data: { entryId, voterToken } }, {
      onSuccess: () => void invalidateShowdowns(),
      onError: () => void invalidateShowdowns(),
    });
  };
  const changeMode = (nextMode: "sport" | "exhibition") => {
    setMode(nextMode);
    setSecondEntryId("");
  };

  return <main className="showdown-page">
    <div className="showdown-topline"><Link className="back-link" href="/"><ArrowLeft size={15} /> Back to archive</Link><span>FREE ENTRY · FREE VOTING</span></div>
    <header className="showdown-hero">
      <span className="launch-label"><CircleDot size={13} /> COMMUNITY COMPETITION</span>
      <h1>Moves meet<br /><em>the community.</em></h1>
      <p>Build a same-sport matchup or a cross-sport exhibition from approved cards. Every entry and vote is free.</p>
      <div className="showdown-promise"><ShieldCheck size={17} /><span>Merchandise purchases never affect eligibility, voting, rankings, or winners.</span></div>
      <aside className="showdown-prize-status" aria-label="Champion card prize status" data-testid="showdown-prize-status">
        <span className="launch-label"><Trophy size={13} /> PHYSICAL CHAMPION CARD · PAUSED</span>
        <p>Physical prize setup is paused; no card is being awarded in this run. If resumed, the proposed prize is one printed card for the overall champion, with no purchase required. Base44's current rules do not define a cross-era final or physical prize, and Printful does not offer a single-card order. Replit pairwise matchups remain separate exhibitions.</p>
        <small>The internal prize-terms draft is inactive and for owner and counsel review only. No artwork, mockup, order, or promotion is approved.</small>
        <div className="showdown-prize-links">
          <a href="https://tea-clash-cards.base44.app" target="_blank" rel="noopener noreferrer">Official Cup of Tea bracket <ArrowRight size={13} /></a>
          <a href="https://tea-clash-cards.base44.app/rules" target="_blank" rel="noopener noreferrer">Current contest rules <ArrowRight size={13} /></a>
        </div>
      </aside>
    </header>

    <section className="showdown-create" aria-labelledby="showdown-create-title">
      <div className="showdown-section-title"><div><span className="launch-label">OPEN CHALLENGE</span><h2 id="showdown-create-title">Set up a matchup</h2></div><span className="showdown-entry-count">{cards.data?.length ?? 0} APPROVED CARDS</span></div>
      {cards.isLoading ? <div className="showdown-loading" role="status">Loading approved cards…</div> : cards.isError ? <div className="showdown-error" role="alert"><CircleAlert size={17} /> Approved cards could not be loaded. Refresh and try again.</div> : cards.data?.length && cards.data.length >= 2 ?
        <form className="showdown-create-form" onSubmit={submitMatchup}>
          <label>Contest type<select value={mode} onChange={(event) => changeMode(event.target.value as "sport" | "exhibition")} data-testid="select-showdown-mode">
            <option value="sport">Same-sport matchup</option><option value="exhibition">Cross-sport exhibition</option>
          </select></label>
          <label>First card<select required value={firstEntryId} onChange={(event) => { setFirstEntryId(event.target.value); setSecondEntryId(""); }} data-testid="select-showdown-first">
            <option value="">Choose an approved card</option>{cards.data.map((entry: CommunityCard) => <option key={entry.id} value={entry.id}>{entry.displayName} · {entry.moveName} ({entry.sport})</option>)}
          </select></label>
          <label>Second card<select required value={secondEntryId} onChange={(event) => setSecondEntryId(event.target.value)} disabled={!firstEntryId || !eligibleSecondEntries.length} data-testid="select-showdown-second">
            <option value="">Choose a matching card</option>{eligibleSecondEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName} · {entry.moveName} ({entry.sport})</option>)}
          </select></label>
          <button className="button-primary" type="submit" disabled={!firstEntryId || !secondEntryId || create.isPending} data-testid="button-create-showdown">
            <Plus size={15} /> {create.isPending ? "Creating…" : "Open free matchup"}
          </button>
          {firstEntryId && !eligibleSecondEntries.length && <p className="showdown-inline-note">{mode === "sport" ? "No other approved card in this sport yet." : "No approved card from a different sport yet."}</p>}
          {create.isError && <p className="showdown-error" role="alert">{create.error instanceof Error ? create.error.message : "The matchup could not be created."}</p>}
        </form> :
        <div className="showdown-empty-approved"><CircleDot size={21} /><div><strong>Two approved cards are needed to start a matchup.</strong><p>Approved participant entries will appear here and in the public archive.</p><Link className="community-contest-link" href="/submit">Submit a move <ArrowRight size={14} /></Link></div></div>}
    </section>

    <section className="showdown-results" aria-labelledby="showdown-results-title">
      <div className="showdown-section-title"><div><span className="launch-label">COMMUNITY VOTES</span><h2 id="showdown-results-title">Current showdowns</h2></div><button className="showdown-refresh" type="button" onClick={() => { void cards.refetch(); void showdowns.refetch(); }} disabled={showdowns.isFetching} data-testid="button-refresh-showdowns"><RefreshCw size={14} /> Refresh</button></div>
      {vote.isError && <div className="showdown-error" role="alert"><CircleAlert size={16} />{vote.error instanceof Error ? vote.error.message : "Your vote could not be recorded."} If you already voted, the current results have been refreshed.</div>}
      {showdowns.isLoading ? <div className="showdown-loading" role="status">Loading current results…</div> : showdowns.isError ? <div className="showdown-error" role="alert"><CircleAlert size={17} /> Results could not be loaded. Refresh to try again.</div> : !showdowns.data?.length ?
        <div className="showdown-empty-approved"><CircleDot size={21} /><div><strong>No matchups yet.</strong><p>Create one above once approved cards are available. Vote totals are public and update while voting is open.</p></div></div> :
        <div className="showdown-matchup-list">{showdowns.data.map((matchup) => <MatchupCard key={matchup.id} matchup={matchup} onVote={submitVote} busy={vote.isPending} />)}</div>}
    </section>
  </main>;
}
