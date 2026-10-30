import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, Route, Switch, useParams } from 'wouter';
import {
  ArrowLeft, ArrowUpRight, CircleDot, ChevronRight, CircleAlert, Film,
  Search, Sparkles, Timer, Zap, Megaphone, Copy, Check, ArrowRight, ShieldCheck,
} from 'lucide-react';
import { useLocation } from 'wouter';
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
  const [location] = useLocation();
  return <>
    <header className="topbar">
      <Brand />
      <nav className="topnav" aria-label="Main navigation">
        <Link href="/" className={location === '/' ? 'nav-active' : ''} data-testid="link-discover"><Sparkles size={14} /> Discover</Link>
        {location === '/' ? <a href="#collection" data-testid="link-collection"><CircleDot size={14} /> The archive</a> : <Link href="/" data-testid="link-collection"><CircleDot size={14} /> The archive</Link>}
        <Link href="/launch" className={location === '/launch' ? 'nav-active' : ''} data-testid="link-launch"><Megaphone size={14} /> Launch</Link>
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

const promoBriefs = [
  {
    number: '01',
    title: 'The Challenge',
    message: 'Your move deserves a card.',
    caption: 'You’ve got a move people remember. Put it on the board, earn your card, and let the community see what makes it yours.',
    cta: 'Invite your community to submit a move.',
    mood: 'cyan',
    direction: 'Open with a single move, then land on the card reveal.',
  },
  {
    number: '02',
    title: 'Get Your Card',
    message: 'Submit your move. Become a card.',
    caption: 'One signature move. One card that carries your name. Step into the Cup of Tea Signature Move Showdown and make your play count.',
    cta: 'Share the invitation to submit.',
    mood: 'violet',
    direction: 'Make the card the payoff: movement first, identity second.',
  },
  {
    number: '03',
    title: 'Wear the Movement',
    message: 'Rep your move. Wear your identity.',
    caption: 'The move is the statement. We’re imagining ways to rep it beyond the screen—more on that in Phase 2.',
    cta: 'Tease the idea; invite people to follow the campaign.',
    mood: 'pink',
    direction: 'Concept tease only. Merchandise is planned for Phase 2 and is not for sale.',
    tease: true,
  },
  {
    number: '04',
    title: 'The Community',
    message: 'Support. Vote. Make it legendary.',
    caption: 'Every move has a story. Back the ones that move you, show up for the community, and help make this showdown legendary.',
    cta: 'Invite people to support and vote when voting opens.',
    mood: 'cyan',
    direction: 'Build the crowd around the moves—not around a checkout.',
  },
  {
    number: '05',
    title: 'The Final Push',
    message: 'Submit. Share. Join the showdown.',
    caption: 'Your move deserves its moment. Submit it, share the challenge with your people, and join the Cup of Tea Signature Move Showdown.',
    cta: 'Invite people to submit, share, and join.',
    mood: 'violet',
    direction: 'A clear three-beat close: submit your move, share the invite, join in.',
  },
];

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
          <p className="launch-deck">A move with your name on it. Five short-form reels to invite the community in—and give every signature its moment.</p>
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
        <div className="truth-copy"><span className="launch-label">THE PROMISE</span><strong>Entry is free. Voting is free.</strong><p>Purchases never affect eligibility, votes, or winners. The POD provider and payment checkout are not connected yet.</p></div>
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

      <section className="production-strip" data-testid="text-production-notes">
        <div className="production-heading"><span className="launch-label">IN THE EDIT SUITE</span><h2>Assets received.<br /><em>Ready for the cut.</em></h2></div>
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
    <Route path="/launch" component={Launch} />
    <Route component={NotFound} />
  </Switch>;
}
