import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, Route, Switch, useParams } from 'wouter';
import {
  ArrowLeft, ArrowUpRight, CircleDot, ChevronRight, CircleAlert, Film,
  Search, Sparkles, Timer, Zap,
} from 'lucide-react';
import {
  getGetMoveCardQueryKey,
  getListMoveCardsQueryKey,
  useGetMoveCard,
  useListMoveCards,
} from '@workspace/api-client-react';
import type { MoveCard } from '@workspace/api-client-react';

const kobeImage = '/images/kobe-drive-frame.jpg';

function Brand() {
  return <Link href="/" className="brand" data-testid="link-home">
    <span className="brand-mark"><Zap size={17} fill="currentColor" /></span>
    <span>VIRAL <i>REEL</i><small> PRO SPORTS ARCHIVE</small></span>
  </Link>;
}

function Shell({ children }: { children: ReactNode }) {
  return <>
    <header className="topbar">
      <Brand />
      <nav className="topnav" aria-label="Main navigation">
        <Link href="/" className="nav-active" data-testid="link-discover"><Sparkles size={14} /> Discover</Link>
        <a href="#collection" data-testid="link-collection"><CircleDot size={14} /> The archive</a>
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

function artStyle(card: MoveCard): CSSProperties {
  const image = card.coverImageUrl || (card.athleteName.toLowerCase().includes('kobe') ? kobeImage : '');
  return image
    ? { backgroundImage: `linear-gradient(180deg, transparent 34%, rgba(10,8,20,.9)), url("${image}")` }
    : { backgroundImage: `radial-gradient(ellipse at 75% 22%, rgba(238,75,242,.44), transparent 36%), linear-gradient(145deg, #132c40, #191127 55%, #090b15)` };
}

function CardArt({ card, large = false }: { card: MoveCard; large?: boolean }) {
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

function MoveTile({ card, index }: { card: MoveCard; index: number }) {
  return <Link href={`/cards/${card.slug}`} className="move-tile" data-testid={`card-move-${card.slug}`}>
    <CardArt card={card} />
    <div className="tile-meta">
      <span className="tile-index">{String(index + 1).padStart(2, '0')} / {card.era}</span>
      <span className={`source-pill ${card.sourceType === 'user_clip' ? 'source-user' : ''}`}>{card.sourceType === 'user_clip' ? 'USER CLIP' : 'OFFICIAL SOURCE'}</span>
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
  const [search, setSearch] = useState('');
  const [era, setEra] = useState('All eras');
  const [source, setSource] = useState('All clips');
  const filtered = useMemo(() => (cards ?? []).filter((card) => {
    const term = search.toLowerCase().trim();
    return (!term || `${card.athleteName} ${card.moveName} ${card.team} ${card.tagline}`.toLowerCase().includes(term))
      && (era === 'All eras' || card.era === era)
      && (source === 'All clips' || card.sourceType === (source === 'Official sources' ? 'official' : 'user_clip'));
  }), [cards, era, search, source]);
  const featured = cards?.find((card) => card.athleteName.toLowerCase().includes('kobe')) ?? cards?.[0];

  return <Shell>
    <main className="page">
      <section className="hero">
        <div className="hero-orb" />
        <div className="hero-copy">
      <div className="eyebrow"><Sparkles size={12} /> THE OPEN PRO SPORTS ARCHIVE</div>
          <h1>Great moves<br />leave <span>a mark.</span></h1>
          <p>One play at a time. Explore the footwork, timing, and little decisions behind classic and current players’ most memorable moves.</p>
          <a href="#collection" className="button-primary" data-testid="button-browse">Browse the archive <ChevronRight size={16} /></a>
          <div className="hero-footnote"><span className="pulse-dot" /> PUBLIC BY DESIGN <b>·</b> NO ACCOUNT, NO PAYWALL</div>
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
          <span className="archive-count" data-testid="text-card-count">{cards?.length ?? 0} <small>CARDS</small></span>
        </div>
        <div className="filters">
          <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a player or move..." aria-label="Search players and moves" data-testid="input-search" /></label>
          <div className="filter-tabs" aria-label="Filter by era">{['All eras', 'Classic', 'Current'].map((item) =>
            <button key={item} className={era === item ? 'selected' : ''} onClick={() => setEra(item)} data-testid={`filter-era-${item.toLowerCase().replace(' ', '-')}`}>{item}</button>)}</div>
          <div className="filter-tabs source-tabs" aria-label="Filter by source">{['All clips', 'Official sources', 'User clips'].map((item) =>
            <button key={item} className={source === item ? 'selected' : ''} onClick={() => setSource(item)} data-testid={`filter-source-${item.toLowerCase().replace(' ', '-')}`}>{item}</button>)}</div>
        </div>
        {isLoading ? <LoadingState /> : isError ? <ErrorState onRetry={() => void refetch()} /> :
          !cards?.length ? <div className="state-panel empty-panel" data-testid="status-empty"><CircleDot size={27} /><h2>The archive is taking shape.</h2><p>New player cards will appear here as they’re added.</p></div> :
          filtered.length ? <div className="card-grid">{filtered.map((card, index) => <MoveTile key={card.id} card={card} index={index} />)}</div> :
          <div className="state-panel empty-panel" data-testid="status-no-results"><Search size={25} /><h2>No plays found.</h2><p>Try a different player, move, era, or source.</p><button className="text-button" onClick={() => { setSearch(''); setEra('All eras'); setSource('All clips'); }} data-testid="button-clear-filters">Clear filters</button></div>}
        <div className="collection-note"><span>01 — {String(cards?.length ?? 0).padStart(2, '0')}</span><p>Not every clip tells the whole story. Follow the source, then watch the feet.</p><span className="note-line" /></div>
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

export default function App() {
  return <Switch>
    <Route path="/" component={Collection} />
    <Route path="/cards/:slug" component={Detail} />
    <Route component={NotFound} />
  </Switch>;
}
