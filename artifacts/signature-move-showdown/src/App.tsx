import { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { Link, Route, Switch, useParams } from 'wouter';
import {
  ArrowLeft, ArrowUpRight, CircleDot, ChevronRight, CircleAlert, Film,
  Search, Sparkles, Timer, Zap, Megaphone, Copy, Check, ArrowRight, ShieldCheck,
  LockKeyhole, LogOut, Play, Download, RefreshCw, CircleCheck, AlertTriangle,
  Video, Volume2, CreditCard, X,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMoveCardQueryKey,
  getListMoveCardsQueryKey,
  getListCommunityCardsQueryKey,
  useGetMoveCard,
  useListMoveCards,
  useListCommunityCards,
  getGetStudioSessionQueryKey,
  getGetStudioSettingsQueryKey,
  getListStudioReelsQueryKey,
  useGetStudioSession,
  useCreateStudioSession,
  useDeleteStudioSession,
  useGetStudioSettings,
  useListStudioReels,
  useCreateStudioReel,
} from '@workspace/api-client-react';
import type { CommunityCard, MoveCard, StudioReel } from '@workspace/api-client-react';
import SubmissionBuilder from './pages/SubmissionBuilder';
import SubmissionReview from './pages/SubmissionReview';
import CommunityCardPage from './pages/CommunityCard';
import Showdown from './pages/Showdown';
import ContestResults from './pages/ContestResults';

import CreatorCardPage from './pages/CreatorCardPage';

const kobeImage = '/images/kobe-drive-frame.jpg';

function Brand() {
  return <Link href="/" className="brand" data-testid="link-home">
    <span className="brand-mark"><img src="/images/cup-of-tea-app-icon.png" alt="" aria-hidden="true" /></span>
    <span>VIRAL <i>REEL</i><small> PRO SPORTS ARCHIVE</small></span>
  </Link>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <>
    <header className="topbar">
      <Brand />
      <nav className="topnav" aria-label="Main navigation">
        <Link href="/" className={location === '/' ? 'nav-active' : ''} data-testid="link-discover"><Sparkles size={14} /> Discover</Link>
        {location === '/' ? <a href="#collection" data-testid="link-collection"><CircleDot size={14} /> The archive</a> : <Link href="/" data-testid="link-collection"><CircleDot size={14} /> The archive</Link>}
        <Link href="/launch" className={location === '/launch' ? 'nav-active' : ''} data-testid="link-launch"><Megaphone size={14} /> Launch</Link>
        <Link href="/submit" className={location === '/submit' ? 'nav-active' : ''} data-testid="link-submit-move"><Zap size={14} /> Submit a move</Link>
        <Link href="/showdown" className={location === '/showdown' ? 'nav-active' : ''} data-testid="link-showdown"><CircleDot size={14} /> Free showdown</Link>
        <Link href="/review" className={location === '/review' ? 'nav-active' : ''} data-testid="link-review-submissions"><LockKeyhole size={14} /> Review desk</Link>
      </nav>
      <span className="public-label"><span /> OPEN ARCHIVE · NO LOGIN</span>
    </header>
    {children}
    <footer className="footer">
      <Brand />
      <span>Study the detail. Feel the game.</span>
      <span className="footer-note">A public archive for sports people.</span>
    </footer>
  </>;
}

type CardArtData = Pick<MoveCard, 'athleteName' | 'sport' | 'moveName' | 'coverImageUrl'> & { era: string };

function artStyle(card: CardArtData): CSSProperties {
  const image = card.coverImageUrl || (card.athleteName.toLowerCase().includes('kobe') ? kobeImage : '');
  return image
    ? { backgroundImage: `linear-gradient(180deg, transparent 34%, rgba(10,8,20,.9)), url("${image}")` }
    : { backgroundImage: `radial-gradient(ellipse at 75% 22%, rgba(238,75,242,.44), transparent 36%), linear-gradient(145deg, #132c40, #191127 55%, #090b15)` };
}

function CardArt({ card, large = false }: { card: CardArtData; large?: boolean }) {
  return <div className={`card-art ${large ? 'card-art-large' : ''}`} style={artStyle(card)}>
    <div className="art-grid" />
    {!card.coverImageUrl && !card.athleteName.toLowerCase().includes('kobe') && <span className="art-initials">{card.athleteName.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>}
    <span className="art-topline">VIRAL REEL <b>•</b> {card.era.toUpperCase()}</span>
    <span className="art-player">{card.athleteName}</span>
    <span className="art-move">{card.moveName}</span>
    <span className="art-corner">{card.sport.toUpperCase()}</span>
  </div>;
}

function LoadingState() {
  return <div className="card-grid" aria-label="Loading cards" data-testid="status-loading">
    {Array.from({ length: 6 }, (_, index) => <div className="skeleton-card" key={index}><div className="skeleton-art" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>)}
  </div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="state-panel" data-testid="status-error">
    <CircleAlert size={25} /><h2>Couldn’t load the archive.</h2><p>The play is still there. We just can’t reach it right now.</p>
    <button className="button-primary" onClick={onRetry} data-testid="button-retry">Try again</button>
  </div>;
}

type ArchiveTile = CardArtData & {
  id: number | string;
  slug: string;
  href: string;
  team: string;
  tagline: string;
  sourceType: 'official' | 'user_clip';
  isCommunity: boolean;
};

function MoveTile({ card, index }: { card: ArchiveTile; index: number }) {
  return <Link href={card.href} className="move-tile" data-testid={`card-move-${card.slug}`}>
    <CardArt card={card} />
    <div className="tile-meta">
      <span className="tile-index">{String(index + 1).padStart(2, '0')} / {card.era}</span>
      <span className={`source-pill ${card.sourceType === 'user_clip' ? 'source-user' : ''}`}>{card.isCommunity ? 'COMMUNITY ENTRY' : card.sourceType === 'user_clip' ? 'USER CLIP' : 'OFFICIAL SOURCE'}</span>
    </div>
    <h3>{card.athleteName}</h3>
    <p className="tile-move">{card.moveName}</p>
    <p className="tile-tagline">{card.tagline}</p>
    <span className="tile-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span>
  </Link>;
}

function Collection() {
  const { data: cards, isLoading, isError, refetch } = useListMoveCards({
    query: { queryKey: getListMoveCardsQueryKey() },
  });
  const community = useListCommunityCards({
    query: { queryKey: getListCommunityCardsQueryKey(), refetchOnMount: 'always' },
  });
  const [search, setSearch] = useState('');
  const [era, setEra] = useState('All eras');
  const [source, setSource] = useState('All clips');
  const [sport, setSport] = useState('All sports');
  const [move, setMove] = useState('All moves');
  const archiveCards = useMemo<ArchiveTile[]>(() => [
    ...(cards ?? []).map((card) => ({
      ...card,
      id: card.id,
      slug: card.slug,
      href: `/cards/${card.slug}`,
      isCommunity: false,
    })),
    ...(community.data ?? []).map((card: CommunityCard) => ({
      id: card.id,
      slug: `community-${card.id}`,
      href: `/community-cards/${card.id}`,
      athleteName: card.displayName,
      sport: card.sport,
      era: 'Community',
      team: card.team ?? '',
      moveName: card.moveName,
      tagline: `${card.handle} · ${card.category}`,
      coverImageUrl: null,
      sourceType: 'user_clip' as const,
      isCommunity: true,
    })),
  ], [cards, community.data]);
  const sports = useMemo(() => [...new Set(archiveCards.map((card) => card.sport))].sort(), [archiveCards]);
  const moves = useMemo(() => [...new Set(archiveCards
    .filter((card) => sport === 'All sports' || card.sport === sport)
    .map((card) => card.moveName))].sort(), [archiveCards, sport]);
  const filtered = useMemo(() => archiveCards.filter((card) => {
    const term = search.toLowerCase().trim();
    return (!term || `${card.athleteName} ${card.moveName} ${card.sport} ${card.team} ${card.tagline}`.toLowerCase().includes(term))
      && (era === 'All eras' || card.era === era)
      && (sport === 'All sports' || card.sport === sport)
      && (move === 'All moves' || card.moveName === move)
      && (source === 'All clips' || card.sourceType === (source === 'Official sources' ? 'official' : 'user_clip'));
  }), [archiveCards, era, move, search, source, sport]);
  const featured = archiveCards.find((card) => card.athleteName.toLowerCase().includes('kobe')) ?? archiveCards[0];
  const loading = isLoading || community.isLoading;
  const archiveError = isError || community.isError;
  const retryArchive = () => { void refetch(); void community.refetch(); };

  return <Shell>
    <main className="page">
      <section className="hero">
        <div className="hero-orb" />
        <div className="hero-copy">
      <div className="eyebrow"><Sparkles size={12} /> THE OPEN PRO SPORTS ARCHIVE</div>
          <h1>Great moves<br />leave <span>a mark.</span></h1>
          <p>One play at a time. Explore the footwork, timing, and little decisions behind classic and current players’ most memorable moves.</p>
          <div className="hero-actions">
            <a href="#collection" className="button-primary" data-testid="button-browse">Browse the archive <ChevronRight size={16} /></a>
            <Link href="/submit" className="button-submit" data-testid="button-submit-digital-card">Submit your move <Zap size={15} /></Link>
          </div>
          <div className="hero-footnote"><span className="pulse-dot" /> FREE ENTRY <b>·</b> NO LOGIN OR OWNER CODE</div>
        </div>
        {featured ? <Link href={`/cards/${featured.slug}`} className="feature-card" data-testid={`featured-card-${featured.slug}`}>
          <CardArt card={featured} large />
          <div className="feature-details">
            <span className="feature-label"><span /> FEATURED CARD</span>
            <strong>{featured.athleteName}</strong>
            <span>{featured.moveName} <ArrowUpRight size={14} /></span>
          </div>
        </Link> : <div className="feature-placeholder"><CircleDot size={52} /><span>THE ARCHIVE IS WARMING UP</span></div>}
        <div className="hero-stamp"><span>STUDY</span><i>THE</i><b>GAME</b></div>
      </section>

      <section className="archive" id="collection">
        <div className="archive-head">
          <div><div className="eyebrow"><Film size={12} /> THE COLLECTION</div><h2>Moves worth rewinding.</h2></div>
          <span className="archive-count" data-testid="text-card-count">{archiveCards.length} <small>CARDS</small></span>
        </div>
        <div className="filters">
          <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a player or move..." aria-label="Search players and moves" data-testid="input-search" /></label>
          <div className="filter-tabs" aria-label="Filter by era">{['All eras', 'Classic', 'Current', 'Community'].map((item) =>
            <button key={item} className={era === item ? 'selected' : ''} onClick={() => setEra(item)} data-testid={`filter-era-${item.toLowerCase().replace(' ', '-')}`}>{item}</button>)}</div>
          <div className="filter-tabs source-tabs" aria-label="Filter by source">{['All clips', 'Official sources', 'User clips'].map((item) =>
            <button key={item} className={source === item ? 'selected' : ''} onClick={() => setSource(item)} data-testid={`filter-source-${item.toLowerCase().replace(' ', '-')}`}>{item}</button>)}</div>
          <label className="archive-select">Sport<select value={sport} onChange={(event) => { setSport(event.target.value); setMove('All moves'); }} aria-label="Filter by sport" data-testid="filter-sport">
            <option>All sports</option>{sports.map((item) => <option key={item}>{item}</option>)}
          </select></label>
          <label className="archive-select">Move<select value={moves.includes(move) ? move : 'All moves'} onChange={(event) => setMove(event.target.value)} aria-label="Filter by move" data-testid="filter-move">
            <option>All moves</option>{moves.map((item) => <option key={item}>{item}</option>)}
          </select></label>
        </div>
        {loading ? <LoadingState /> : archiveError ? <ErrorState onRetry={retryArchive} /> :
          !archiveCards.length ? <div className="state-panel empty-panel" data-testid="status-empty"><CircleDot size={27} /><h2>The archive is taking shape.</h2><p>Approved participant cards will join the collection here.</p></div> :
          filtered.length ? <div className="card-grid">{filtered.map((card, index) => <MoveTile key={card.id} card={card} index={index} />)}</div> :
          <div className="state-panel empty-panel" data-testid="status-no-results"><Search size={25} /><h2>No plays found.</h2><p>Try a different player, sport, move, era, or source.</p><button className="text-button" onClick={() => { setSearch(''); setEra('All eras'); setSource('All clips'); setSport('All sports'); setMove('All moves'); }} data-testid="button-clear-filters">Clear filters</button></div>}
        <div className="collection-note"><span>01 — {String(archiveCards.length).padStart(2, '0')}</span><p>Not every clip tells the whole story. Follow the source, then watch the feet.</p><span className="note-line" /></div>
      </section>
    </main>
  </Shell>;
}

function Detail() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? '';
  const { data: card, isLoading, isError, refetch } = useGetMoveCard(slug, {
    query: { enabled: Boolean(slug), queryKey: getGetMoveCardQueryKey(slug) },
  });
  if (isLoading) return <Shell><main className="detail-page"><div className="detail-skeleton" data-testid="status-loading"><div /><span /><span /></div></main></Shell>;
  if (isError) return <Shell><main className="detail-page"><ErrorState onRetry={() => void refetch()} /></main></Shell>;
  if (!card) return <Shell><main className="detail-page"><div className="state-panel" data-testid="status-not-found"><CircleAlert size={25} /><h2>That card isn’t in the archive.</h2><p>It may have moved, or the link may be out of bounds.</p><Link className="button-primary" href="/" data-testid="link-back-archive"><ArrowLeft size={15} /> Back to archive</Link></div></main></Shell>;

  return <Shell>
    <main className="detail-page">
      <Link className="back-link" href="/" data-testid="link-back"><ArrowLeft size={15} /> All move cards</Link>
      <div className="detail-layout">
        <div className="detail-art-wrap"><CardArt card={card} large /><div className="detail-art-caption"><span>VIRAL REEL ARCHIVE</span><span>{card.era.toUpperCase()} / {card.team.toUpperCase()}</span></div></div>
        <article className="detail-copy">
          <div className="eyebrow"><CircleDot size={13} /> {card.sport.toUpperCase()} <b>·</b> {card.era.toUpperCase()}</div>
          <h1 data-testid="text-athlete-name">{card.athleteName}</h1>
          <div className="detail-move" data-testid="text-move-name">{card.moveName}</div>
          <p className="detail-tagline" data-testid="text-tagline">{card.tagline}</p>
          <div className="rule" />
          <h2>Watch the setup.</h2>
          <p className="explanation" data-testid="text-explanation">{card.explanation}</p>
          <div className="cue-heading"><span>WHAT TO NOTICE</span><span>{String(card.cues.length).padStart(2, '0')} CUES</span></div>
          <ol className="cue-list">{card.cues.map((cue, index) => <li key={`${card.id}-${index}`} data-testid={`text-cue-${index + 1}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{cue}</p></li>)}</ol>
          <div className="source-box">
            <div className="source-symbol"><Timer size={17} /></div>
            <div className="source-text"><span>{card.sourceType === 'user_clip' ? 'CLIP CONTEXT' : 'SOURCE & FURTHER READING'}</span><strong>{card.sourceLabel}</strong>
              {card.sourceType === 'user_clip' && <small>This clip is an observed sequence, not a verified named signature move.</small>}</div>
            {card.sourceUrl && <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" className="source-link" data-testid="link-source">Open source <ArrowUpRight size={14} /></a>}
          </div>
          <div className="detail-foot"><span>CARD ADDED</span><time dateTime={card.createdAt}>{new Date(card.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time></div>
        </article>
      </div>
    </main>
  </Shell>;
}

function NotFound() {
  return <Shell><main className="detail-page"><div className="state-panel"><CircleAlert size={25} /><h2>Not in the playbook.</h2><p>This page doesn’t exist in the archive.</p><Link className="button-primary" href="/">Return to the archive</Link></div></main></Shell>;
}

const promoBriefs = [
  { number: '01', id: 'performance', title: 'Signature-move performance', message: 'One move. Pure expression.', caption: 'A signature move is a language of its own. Show the footwork, timing, and split-second choice behind an unforgettable play.', cta: 'Celebrate movement without depicting an identifiable athlete.', mood: 'cyan', direction: 'Generic, non-identifiable athlete only. No recognizable real person, likeness, or uniform.' },
  { number: '02', id: 'premium-card', title: 'Premium trading card', message: 'Your move, made collectible.', caption: 'From a moment on the court to a card worth keeping. Bring a signature move into focus with a premium collectible concept.', cta: 'Invite the community to submit a move and earn a place in the archive.', mood: 'violet', direction: 'Showcase the card concept; do not imply a purchase is required to participate.' },
  { number: '03', id: 'card-showdown', title: 'Card-versus-card showdown', message: 'Two cards. One community.', caption: 'Every card carries a different kind of brilliance. Compare the moves and get ready to back the one that moves you.', cta: 'Invite people to explore the archive and join the showdown.', mood: 'pink', direction: 'Frame the contest around the moves and community—not spending.' },
  { number: '04', id: 'enter-vote', title: 'Free entry & voting', message: 'Show up. Vote. That’s the whole ticket.', caption: 'Bring your move to the Cup of Tea Signature Move Showdown. When voting opens, cast your vote and celebrate the community.', cta: 'Entry is free. Voting is free.', mood: 'cyan', direction: 'Any optional generated creator reel is separate; purchases never affect eligibility, votes, or official results.' },
  { number: '05', id: 'merch-tease', title: 'Planned merchandise collection', message: 'The movement may travel further.', caption: 'We’re imagining ways to carry signature moves beyond the screen. A future collection is in the works—this is only a first look.', cta: 'Follow the campaign for future updates.', mood: 'violet', direction: 'Concept tease only. Planned for Phase 2; not for sale.', tease: true },
];

const studioTargetModel = 'Google Veo 3.1 Fast on Replicate';
const statusLabel: Record<StudioReel['status'], string> = { starting: 'Starting', processing: 'Processing', succeeded: 'Ready', failed: 'Failed', aborted: 'Stopped' };
const costLabel = (amount: number) => `$${amount.toFixed(2)}`;

function Studio() {
  const queryClient = useQueryClient();
  const session = useGetStudioSession({ query: { queryKey: getGetStudioSessionQueryKey(), retry: false } });
  const settings = useGetStudioSettings({ query: { queryKey: getGetStudioSettingsQueryKey(), retry: false } });
  const reels = useListStudioReels({
    query: {
      queryKey: getListStudioReelsQueryKey(),
      retry: false,
      refetchInterval: (query) => query.state.data?.reels.some((reel) => reel.status === 'starting' || reel.status === 'processing') ? 3500 : false,
    },
  });
  const createSession = useCreateStudioSession();
  const deleteSession = useDeleteStudioSession();
  const createReel = useCreateStudioReel();
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [brief, setBrief] = useState<(typeof promoBriefs)[number] | null>(null);
  const [duration, setDuration] = useState(4);
  const [confirmCost, setConfirmCost] = useState(false);
  const authenticated = Boolean(session.data?.authenticated);
  const tested = Boolean(reels.data?.firstTestPassed || settings.data?.firstTestPassed);
  const rate = settings.data?.costPerSecondUsd ?? 0.15;
  const estimate = rate * duration;
  const firstTestEstimate = rate * 4;
  const model = settings.data?.model || studioTargetModel;
  const ready = Boolean(authenticated && settings.data?.canGenerate && settings.data?.providerReady && settings.data?.storageReady);
  const durationOptions = settings.data?.durationOptions?.length ? settings.data.durationOptions : [4, 6, 8];
  const invalidateSession = () => {
    void queryClient.invalidateQueries({ queryKey: getGetStudioSessionQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetStudioSettingsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListStudioReelsQueryKey() });
  };
  const signIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');
    createSession.mutate({ data: { password } }, {
      onSuccess: () => { setPassword(''); invalidateSession(); },
      onError: (error) => setLoginError(error instanceof Error ? error.message : 'Owner sign-in was not accepted.'),
    });
  };
  const requestRun = (item: (typeof promoBriefs)[number]) => {
    if (!ready || (!tested && item.id !== 'performance')) return;
    setBrief(item);
    setDuration(tested ? 6 : 4);
    setConfirmCost(false);
  };
  const runConfirmed = () => {
    if (!brief || !confirmCost || !ready) return;
    const runDuration = tested ? duration : 4;
    createReel.mutate({
      data: {
        briefId: brief.id as 'performance' | 'premium-card' | 'card-showdown' | 'enter-vote' | 'merch-tease',
        durationSeconds: runDuration as 4 | 6 | 8,
        model,
        aspectRatio: '9:16',
        resolution: '720p',
        audioEnabled: true,
        estimatedCostUsd: rate * runDuration,
        confirmCost: true,
      },
    }, {
      onSuccess: () => {
        setBrief(null);
        setConfirmCost(false);
        void queryClient.invalidateQueries({ queryKey: getListStudioReelsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetStudioSettingsQueryKey() });
      },
    });
  };

  return <section className="studio-section" id="studio" aria-labelledby="studio-heading" data-testid="studio-panel">
    <header className="studio-heading">
      <div><div className="launch-label"><Video size={13} /> PRIVATE PRODUCTION SUITE</div><h2 id="studio-heading">The reel<br /><em>studio.</em></h2><p>Owner-operated generation for the five campaign concepts above. Public archive browsing stays open; production stays private.</p></div>
      <div className="studio-badge"><LockKeyhole size={14} /> OWNER ACCESS ONLY</div>
    </header>

    {(session.isError || settings.isError || reels.isError) && <div className="studio-alert" role="status" data-testid="status-studio-unavailable"><AlertTriangle size={18} /><div><strong>Studio connection unavailable</strong><p>{session.error instanceof Error ? session.error.message : settings.error instanceof Error ? settings.error.message : reels.error instanceof Error ? reels.error.message : 'Provider, account, or storage configuration is unavailable.'} Production is disabled; no run has been started.</p></div><button type="button" onClick={() => { void session.refetch(); void settings.refetch(); void reels.refetch(); }} data-testid="button-retry-studio"><RefreshCw size={14} /> Retry</button></div>}

    <div className="studio-grid">
      <div className="studio-access-panel">
        <div className="studio-access-top"><span className={`access-indicator ${authenticated ? 'is-ready' : ''}`} /><span data-testid="status-owner-session">{session.isLoading ? 'CHECKING OWNER SESSION' : authenticated ? 'OWNER SESSION ACTIVE' : 'OWNER SESSION REQUIRED'}</span></div>
        {authenticated ? <div className="owner-active"><div><strong>Production access</strong><p>Your session is private to the studio owner.</p></div><button className="studio-quiet-button" type="button" onClick={() => deleteSession.mutate(undefined, { onSuccess: invalidateSession })} disabled={deleteSession.isPending} data-testid="button-studio-signout"><LogOut size={14} /> {deleteSession.isPending ? 'Signing out' : 'Sign out'}</button></div> :
           <form className="studio-login" onSubmit={signIn}><label htmlFor="studio-password">Owner passphrase</label><input type="text" name="username" autoComplete="username" value="studio-owner" readOnly tabIndex={-1} aria-hidden="true" className="sr-only" /><div className="studio-login-row"><input id="studio-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter studio passphrase" disabled={createSession.isPending} data-testid="input-studio-password" /><button type="submit" disabled={!session.data?.configured || !password.trim() || createSession.isPending} data-testid="button-studio-login"><LockKeyhole size={14} /> {createSession.isPending ? 'Checking' : 'Unlock studio'}</button></div>
            {session.data?.configured === false && <p className="form-note" data-testid="status-studio-not-configured">Owner access is not configured on this server.</p>}{loginError && <p className="form-error" data-testid="status-login-error">{loginError}</p>}</form>}
        <div className="studio-access-foot"><ShieldCheck size={14} /><span>Paid predictions require owner login and a separate cost confirmation for every run.</span></div>
      </div>

      <div className="studio-config-panel">
        <div className="config-head"><span className="launch-label">CURRENT OUTPUT PROFILE</span><span className={`config-state ${ready ? 'ready' : 'blocked'}`} data-testid="status-provider-readiness">{ready ? 'READY TO PRODUCE' : 'GENERATION BLOCKED'}</span></div>
        <div className="config-model"><span className="model-mark"><Film size={18} /></span><div><small>MODEL / PROVIDER</small><strong data-testid="text-studio-model">{model}</strong></div></div>
        <div className="config-specs"><div><span>FRAME</span><strong data-testid="text-studio-aspect">9:16 vertical</strong></div><div><span>RESOLUTION</span><strong data-testid="text-studio-resolution">720p</strong></div><div><span>AUDIO</span><strong data-testid="text-studio-audio">Native audio on</strong></div><div><span>RATE</span><strong data-testid="text-studio-rate">{costLabel(rate)}/sec</strong></div></div>
        <p className="provider-message" data-testid="text-studio-config-message">{settings.data?.message || (settings.isLoading ? 'Checking provider, account, and storage configuration…' : 'Provider readiness is not confirmed. Generation remains disabled until the server reports ready.')}</p>
        <div className="config-checks"><span className={settings.data?.providerReady ? 'check-good' : 'check-off'}><CircleDot size={11} /> PROVIDER {settings.data?.providerReady ? 'READY' : 'UNAVAILABLE'}</span><span className={settings.data?.storageReady ? 'check-good' : 'check-off'}><CircleDot size={11} /> STORAGE {settings.data?.storageReady ? 'READY' : 'UNAVAILABLE'}</span></div>
      </div>
    </div>

    <div className="test-gate" data-testid="status-first-test-gate"><span className={`test-gate-icon ${tested ? 'passed' : ''}`}>{tested ? <CircleCheck size={18} /> : <Timer size={18} />}</span><div><span className="launch-label">FIRST-RUN SAFETY CHECK</span><strong>{tested ? 'Short test passed. Other briefs are unlocked.' : 'A successful 4-second test unlocks the remaining briefs.'}</strong><p>First run is fixed at 4 seconds with a {costLabel(firstTestEstimate)} estimate. No other concept can run before success is reported.</p></div><span className={`test-gate-state ${tested ? 'passed' : ''}`}>{tested ? 'PASSED' : 'REQUIRED'}</span></div>

    <div className="studio-run-head"><div><span className="launch-label">CHOOSE A CAMPAIGN BRIEF</span><h3>Every run starts with a review.</h3></div><span className="cost-policy"><CreditCard size={13} /> NO CHECKOUT · ESTIMATES ONLY</span></div>
    <div className="studio-brief-grid">{promoBriefs.map((item) => {
      const locked = !tested && item.id !== 'performance';
      return <article className={`studio-brief ${locked ? 'is-locked' : ''}`} key={item.id} data-testid={`studio-brief-${item.id}`}><div className="studio-brief-number">{item.number}</div><div className="studio-brief-copy"><span>{item.title}</span><p>{item.direction}</p></div><button type="button" onClick={() => requestRun(item)} disabled={!ready || locked} data-testid={`button-run-${item.id}`}>{locked ? <LockKeyhole size={14} /> : <Play size={14} />}{locked ? 'Test first' : 'Review run'}</button></article>;
    })}</div>

    <section className="reel-history" aria-labelledby="reel-history-heading"><div className="reel-history-head"><div><span className="launch-label">STUDIO OUTPUTS</span><h3 id="reel-history-heading">Run history</h3></div><button type="button" className="studio-quiet-button" onClick={() => void reels.refetch()} disabled={reels.isFetching} data-testid="button-refresh-reels"><RefreshCw size={14} /> Refresh</button></div>
      {reels.isLoading ? <div className="reel-skeleton" data-testid="status-reels-loading"><span /><span /><span /></div> : reels.isError ? <div className="reel-empty error" data-testid="status-reels-error"><AlertTriangle size={18} /><div><strong>Run history is unavailable.</strong><p>Check the owner session and try again. Existing reels are not assumed.</p></div></div> : !reels.data?.reels.length ? <div className="reel-empty" data-testid="status-reels-empty"><Film size={20} /><div><strong>No generated reels yet.</strong><p>Confirmed outputs and their playback will appear here.</p></div></div> :
        <div className="reel-list">{reels.data.reels.map((reel) => <article className="reel-item" key={reel.id} data-testid={`reel-${reel.id}`}><div className="reel-icon"><Film size={16} /></div><div className="reel-info"><div className="reel-title-line"><strong>{reel.title}</strong><span className={`reel-status status-${reel.status}`} data-testid={`status-reel-${reel.id}`}>{reel.status === 'succeeded' ? <CircleCheck size={12} /> : <CircleDot size={12} />}{statusLabel[reel.status]}</span></div><p>{reel.model} · {reel.durationSeconds}s · {reel.aspectRatio} · {reel.resolution} · {reel.audioEnabled ? 'Native audio on' : 'Audio off'} · est. {costLabel(reel.estimatedCostUsd)}{reel.isTest ? ' · First test' : ''}</p>{reel.error && <small className="reel-error" data-testid={`text-reel-error-${reel.id}`}>{reel.error}</small>}
          {reel.status === 'succeeded' && reel.videoUrl && <div className="reel-playback"><video controls playsInline preload="metadata" src={reel.videoUrl} aria-label={`Generated reel: ${reel.title}`} data-testid={`video-reel-${reel.id}`} /><a href={reel.videoUrl} download data-testid={`link-download-reel-${reel.id}`}><Download size={14} /> Download video</a></div>}</div></article>)}</div>}
    </section>

    {brief && <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !createReel.isPending) setBrief(null); }}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-heading" data-testid="dialog-run-confirmation">
      <button className="confirm-close" type="button" onClick={() => setBrief(null)} disabled={createReel.isPending} aria-label="Close confirmation" data-testid="button-close-confirmation"><X size={17} /></button>
      <span className="launch-label"><ShieldCheck size={13} /> FINAL COST REVIEW</span><h3 id="confirm-heading">Confirm this<br /><em>production run.</em></h3><p className="confirm-brief-name">{brief.number} / {brief.title}{!tested && ' · FIRST TEST'}</p>
      <div className="confirm-spec-list"><div><span>MODEL</span><strong data-testid="confirm-model">{model}</strong></div><div><span>DURATION</span>{tested ? <select value={duration} onChange={(event) => setDuration(Number(event.target.value))} data-testid="select-run-duration">{durationOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select> : <strong data-testid="confirm-duration">4 seconds · test</strong>}</div><div><span>ASPECT RATIO</span><strong data-testid="confirm-aspect">Vertical 9:16</strong></div><div><span>RESOLUTION</span><strong data-testid="confirm-resolution">720p</strong></div><div><span>AUDIO</span><strong data-testid="confirm-audio"><Volume2 size={14} /> Native audio on</strong></div></div>
       <div className="confirm-estimate"><span>ESTIMATED GENERATION COST</span><strong data-testid="text-confirm-estimate">{costLabel(tested ? estimate : firstTestEstimate)}</strong><small>{tested ? `${duration} seconds × ${costLabel(rate)} per output second.` : `4 seconds × ${costLabel(rate)} per output second.`} Estimate only; no checkout or payment is taken here.</small></div>
      <label className="confirm-check"><input type="checkbox" checked={confirmCost} onChange={(event) => setConfirmCost(event.target.checked)} data-testid="checkbox-confirm-cost" /><span>I reviewed and explicitly approve this exact model, duration, format, native-audio setting, and estimate.</span></label>
      {createReel.isError && <p className="form-error" data-testid="status-generation-error">{createReel.error instanceof Error ? createReel.error.message : 'The run could not be started. No success is assumed.'}</p>}
       <div className="confirm-actions"><button type="button" className="studio-quiet-button" onClick={() => setBrief(null)} disabled={createReel.isPending} data-testid="button-cancel-run">Cancel</button><button type="button" className="confirm-run-button" onClick={runConfirmed} disabled={!confirmCost || !ready || createReel.isPending} data-testid="button-confirm-run">{createReel.isPending ? 'Starting…' : `Confirm ${costLabel(tested ? estimate : firstTestEstimate)} run`}</button></div>
    </section></div>}
  </section>;
}

function Launch() {
  const [copied, setCopied] = useState<string | null>(null);
  const copyCaption = async (id: string, text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const field = document.createElement('textarea');
        field.value = text;
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const successful = document.execCommand('copy');
        field.remove();
        if (!successful) throw new Error('Clipboard copy unavailable');
      }
      setCopied(id);
      window.setTimeout(() => setCopied((current) => current === id ? null : current), 1800);
    } catch {
      setCopied(null);
    }
  };

  return <Shell>
    <main className="launch-page">
      <section className="launch-hero" data-testid="launch-campaign-overview">
        <div className="launch-hero-grid" aria-hidden="true" />
        <div className="launch-hero-content">
          <div className="launch-kicker"><span className="launch-live-dot" /> PHASE 1 / CAMPAIGN PREP</div>
          <h1>Cup of Tea<br /><em>Signature Move</em><br />Showdown<span className="launch-period">.</span></h1>
          <p className="launch-deck">Five short-form concepts for the Cup of Tea Signature Move Showdown. A free public archive up front; a private production suite behind the curtain.</p>
          <div className="launch-hero-actions">
            <a className="launch-cta" href="#reel-briefs" data-testid="button-view-briefs">Explore the five briefs <ArrowRight size={15} /></a>
            <span className="launch-no-login">FREE TO ENTER <b>·</b> FREE TO VOTE</span>
          </div>
        </div>
        <div className="launch-mark" aria-hidden="true"><span>CT</span><i>SM</i><b>01—05</b></div>
        <div className="launch-signal"><span>COMMUNITY<br />SHOWDOWN</span><span className="signal-lines"><i /><i /><i /><i /><i /></span></div>
      </section>

      <section className="launch-truth" aria-label="Important campaign information" data-testid="status-campaign-terms">
        <div className="truth-icon"><ShieldCheck size={20} /></div>
          <div className="truth-copy"><span className="launch-label">THE PROMISE</span><strong>Entry is free. Voting is free.</strong><p>An optional generated creator reel is separate from the free contest. Sales remain off until the owner approves the payment provider and final price, and purchases never affect eligibility, votes, standings, or official results.</p></div>
        <div className="phase-planned"><span>PHASE 2</span><strong>PLANNED</strong><small>Merchandise is not live.</small></div>
      </section>

      <section className="brief-section" id="reel-briefs">
        <header className="brief-heading">
          <div><div className="launch-label"><Megaphone size={13} /> SHORT-FORM CAMPAIGN</div><h2>Five reels.<br /><em>One community.</em></h2></div>
          <p>Ready-to-use creative direction for a vertical-first launch. Each brief carries the same clear promise: the community comes first.</p>
        </header>
        <div className="brief-list">
          {promoBriefs.map((brief) => <article className={`brief-card brief-${brief.mood}`} key={brief.number} data-testid={`card-brief-${brief.number}`}>
            <div className="brief-index"><span>{brief.number}</span><i /></div>
            <div className="brief-main">
              <div className="brief-title-row"><span className="brief-title">{brief.title}</span>{brief.tease && <span className="tease-tag">TEASE ONLY · PHASE 2</span>}</div>
              <h3>“{brief.message}”</h3>
              <div className="brief-detail-grid">
                <div className="brief-detail"><span className="brief-detail-label">SOCIAL CAPTION</span><p data-testid={`text-caption-${brief.number}`}>{brief.caption}</p><button className="copy-caption" onClick={() => void copyCaption(brief.number, brief.caption)} data-testid={`button-copy-caption-${brief.number}`} aria-label={`Copy caption for ${brief.title}`}><span>{copied === brief.number ? 'Copied' : 'Copy caption'}</span>{copied === brief.number ? <Check size={14} /> : <Copy size={14} />}</button></div>
                <div className="brief-detail brief-direction"><span className="brief-detail-label">TRUTHFUL CTA</span><p>{brief.cta}</p><span className="creative-note">{brief.direction}</span></div>
              </div>
              <div className="brief-footer"><span className="format-tag">9:16 VERTICAL</span><span>TIKTOK</span><span>INSTAGRAM REELS</span><span>YOUTUBE SHORTS</span></div>
            </div>
            <div className="brief-side-number" aria-hidden="true">{brief.number}</div>
          </article>)}
        </div>
      </section>

      <Studio />

      <section className="production-strip" data-testid="text-production-notes">
        <div className="production-heading"><span className="launch-label">IN THE EDIT SUITE</span><h2>Clip-based drafts ready.<br /><em>AI generation awaits approval.</em></h2></div>
        <div className="production-assets"><div><span className="asset-count">02</span><p>Vertical edits<br /><b>34.1 sec · 720 × 1280</b></p></div><div><span className="asset-count">01</span><p>Landscape clip<br /><b>10.1 sec · 1920 × 1080</b></p></div></div>
        <p className="date-note">Refresh any on-screen dates before publishing. Do not reuse the expired date shown in the older vertical edit.</p>
      </section>

      <footer className="launch-footer">
        <span>THE MOVE IS YOURS.</span><span>THE SHOWDOWN IS OURS.</span><i>01 / 05 — PHASE 1</i>
      </footer>
    </main>
  </Shell>;
}

export default function App() {
  return <Switch>
    <Route path="/" component={Collection} />
    <Route path="/cards/:slug" component={Detail} />
    <Route path="/community-cards/:id" component={CommunityCardPage} />
    <Route path="/showdown" component={Showdown} />
    <Route path="/launch" component={Launch} />
    <Route path="/submit" component={SubmissionBuilder} />
    <Route path="/creator-cards/:id" component={CreatorCardPage} />
    <Route path="/review" component={SubmissionReview} />
    <Route path="/studio/results" component={ContestResults} />
    <Route component={NotFound} />
  </Switch>;
}
