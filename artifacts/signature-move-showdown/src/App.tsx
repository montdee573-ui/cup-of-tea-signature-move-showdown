import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CircleAlert,
  ExternalLink,
  Menu,
  Play,
  RefreshCcw,
  Trophy,
} from 'lucide-react';
import {
  getGetContestantQueryKey,
  getGetContestSummaryQueryKey,
  getListContestantsQueryKey,
  useCreateContestant,
  useGetContestant,
  useGetContestSummary,
  useListContestants,
} from '@workspace/api-client-react';
import type { Contestant, ContestantInput } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient();

function Header() {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" data-testid="link-brand">
          <span className="brand-mark" aria-hidden="true"><Trophy size={18} strokeWidth={2.7} /></span>
          <span className="brand-word">Signature <em>Move</em></span>
        </Link>
        <nav className={`nav-links ${menuOpen ? 'menu-open' : ''}`} aria-label="Main navigation">
          <Link href="/" className={`nav-link ${location === '/' ? 'active' : ''}`} data-testid="link-home">The board</Link>
          <Link href="/submit" className={`nav-link ${location === '/submit' ? 'active' : ''}`} data-testid="link-submit-nav">How to enter</Link>
          <Link href="/submit" className="nav-cta" data-testid="link-submit-cta">Submit your move <ArrowUpRight size={14} /></Link>
        </nav>
        <button className="button-secondary mobile-menu" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle navigation" data-testid="button-mobile-menu">
          <Menu size={16} />
        </button>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="content-wrap footer-inner">
        <span data-testid="text-footer-brand">Signature Move Showdown / CORE review system</span>
        <span data-testid="text-footer-season">Season 01 · prove one move</span>
      </div>
    </footer>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status.toLowerCase().includes('verified') || status.toLowerCase().includes('top') || status.toLowerCase().includes('cleared')
    ? 'verified'
    : 'pending';
  return <span className={`status-pill ${tone}`} data-testid={`status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>;
}

function PageFrame({ children }: { children: ReactNode }) {
  return <div className="app-shell"><Header /><main className="page-content">{children}</main><Footer /></div>;
}

function LoadingRows() {
  return <div aria-label="Loading leaderboard" data-testid="loading-leaderboard">{[1, 2, 3, 4].map((item) => <div className="skeleton" key={item} />)}</div>;
}

function ErrorState({ onRetry, message = 'The board could not be read right now.' }: { onRetry: () => void; message?: string }) {
  return (
    <div className="error-state" role="alert" data-testid="status-error">
      <CircleAlert size={26} />
      <p>{message}</p>
      <button className="button-secondary" onClick={onRetry} data-testid="button-retry"><RefreshCcw size={14} /> Try again</button>
    </div>
  );
}

function Leaderboard({ contestants, loading, error, onRetry }: { contestants: Contestant[]; loading: boolean; error: boolean; onRetry: () => void }) {
  return (
    <div className="leaderboard-shell" data-testid="section-leaderboard">
      <div className="board-header">
        <span>Rank</span><span>Athlete</span><span>Signature move</span><span>Division</span><span>CORE verdict</span><span />
      </div>
      {loading ? <LoadingRows /> : error ? <ErrorState onRetry={onRetry} /> : contestants.length === 0 ? (
        <div className="empty-state" data-testid="status-empty-leaderboard">
          <Trophy size={27} />
          <p>No moves on the board yet. The first one gets remembered.</p>
          <Link href="/submit" className="button-primary" data-testid="link-empty-submit">Claim the first spot <ArrowUpRight size={14} /></Link>
        </div>
      ) : contestants.map((contestant, index) => (
        <Link href={`/contestants/${contestant.id}`} className="board-row" key={contestant.id} data-testid={`row-contestant-${contestant.id}`}>
          <span className={`rank ${index < 3 ? 'top' : ''}`} data-testid={`text-rank-${contestant.id}`}>{String(index + 1).padStart(2, '0')}</span>
          <span className="athlete">
            <span className="avatar" aria-hidden="true">{contestant.handle.slice(0, 1).toUpperCase()}</span>
            <span className="athlete-text"><span className="handle" data-testid={`text-handle-${contestant.id}`}>{contestant.handle}</span><span className="group">{contestant.group || 'Open run'}</span></span>
          </span>
          <span className="move-name" data-testid={`text-move-${contestant.id}`}>{contestant.signatureMove}</span>
          <span className="category" data-testid={`text-category-${contestant.id}`}>{contestant.category}</span>
          <span className="verdict"><StatusPill status={contestant.coreVerdict} /></span>
          <span className="row-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span>
        </Link>
      ))}
    </div>
  );
}

function Home() {
  const contestantsQuery = useListContestants({ query: { queryKey: getListContestantsQueryKey() } });
  const summaryQuery = useGetContestSummary({ query: { queryKey: getGetContestSummaryQueryKey() } });
  const contestants = useMemo(() => {
    const list = contestantsQuery.data ?? [];
    return list.length ? list : (summaryQuery.data?.leaderboard ?? []);
  }, [contestantsQuery.data, summaryQuery.data?.leaderboard]);
  const summary = summaryQuery.data;

  return (
    <PageFrame>
      <section className="hero content-wrap">
        <div className="hero-grid">
          <div className="animate-rise">
            <div className="eyebrow">Live board / season 01</div>
            <h1>One move.<span className="accent">No excuses.</span></h1>
            <p className="hero-copy">The public showcase for basketball&apos;s most undeniable signature moves. Drop your clip, clear the CORE review, and earn your place where everyone can see it.</p>
            <div className="hero-actions">
              <Link href="/submit" className="button-primary" data-testid="link-hero-submit">Enter the showdown <ArrowUpRight size={15} /></Link>
              <a href="#leaderboard" className="button-secondary" data-testid="link-hero-board">Read the board <ArrowUpRight size={14} /></a>
            </div>
          </div>
          <div className="hero-stamp animate-rise" style={{ animationDelay: '100ms' }}>
            <div className="stamp-kicker">Signature Move Showdown</div>
            <div className="stamp-title">Make the move<br />mean more.</div>
            <div className="stamp-rule"><span>Streetball → pro</span><span>CORE / 01</span></div>
          </div>
        </div>
      </section>

      <section className="content-wrap stats-band" aria-label="Contest statistics">
        <div className="stat-block"><div className="stat-value" data-testid="text-total-entries">{summary?.totalEntries ?? '—'}</div><div className="stat-label">Moves submitted</div></div>
        <div className="stat-block"><div className="stat-value" data-testid="text-verified-entries">{summary?.verifiedEntries ?? '—'}</div><div className="stat-label">Verified clean</div></div>
        <div className="stat-block"><div className="stat-value" data-testid="text-average-fidelity">{summary ? `${summary.averageFidelity.toFixed(1)}` : '—'}</div><div className="stat-label">Avg. fidelity / 100</div></div>
        <div className="stat-block"><div className="stat-value" data-testid="text-top-move">{summary?.topMove || '—'}</div><div className="stat-label">Move to beat</div></div>
      </section>

      <section className="section content-wrap" id="leaderboard">
        <div className="section-heading">
          <div><div className="eyebrow">The live ranking</div><h2>Who brought<br />the sauce?</h2></div>
          <p className="section-note">Rankings move when the board moves. Every entry is scored on control, originality, repeatability, and execution.</p>
        </div>
        <Leaderboard contestants={contestants} loading={contestantsQuery.isLoading || summaryQuery.isLoading} error={contestantsQuery.isError && summaryQuery.isError} onRetry={() => { void contestantsQuery.refetch(); void summaryQuery.refetch(); }} />
      </section>

      <section className="section content-wrap" style={{ paddingTop: 0 }}>
        <div className="section-heading">
          <div><div className="eyebrow">The review code</div><h2>CORE sees<br />the whole move.</h2></div>
        </div>
        <div className="stats-band" style={{ background: 'hsl(185 42% 88% / .5)' }}>
          {['Control', 'Originality', 'Repeatability', 'Execution'].map((item, index) => (
            <div className="stat-block" key={item} data-testid={`card-core-${item.toLowerCase()}`}><div className="stat-value">0{index + 1}</div><div className="stat-label">{item}</div></div>
          ))}
        </div>
      </section>
    </PageFrame>
  );
}

function Submit() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createContestant = useCreateContestant();
  const [handle, setHandle] = useState('');
  const [signatureMove, setSignatureMove] = useState('');
  const [category, setCategory] = useState<ContestantInput['category']>('Open');
  const [referenceClipUrl, setReferenceClipUrl] = useState('');
  const [visualProofName, setVisualProofName] = useState('');
  const [formError, setFormError] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (handle.trim().length < 2 || signatureMove.trim().length < 2 || !referenceClipUrl.trim()) {
      setFormError('Handle, move name, and a reference clip are required.');
      return;
    }
    createContestant.mutate({
      data: { handle: handle.trim(), signatureMove: signatureMove.trim(), category, referenceClipUrl: referenceClipUrl.trim(), visualProofName: visualProofName || null },
    }, {
      onSuccess: (contestant) => {
        void queryClient.invalidateQueries({ queryKey: getListContestantsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetContestSummaryQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetContestantQueryKey(contestant.id) });
        setLocation(`/contestants/${contestant.id}`);
      },
      onError: () => setFormError('That submission did not land. Check the details and try again.'),
    });
  };

  return (
    <PageFrame>
      <div className="content-wrap form-layout">
        <div className="form-intro">
          <div className="eyebrow">Put your move on record</div>
          <h1>Make your<br /><span className="accent">case.</span></h1>
          <p>This is not a highlight reel. Submit the one move that explains your game. Our CORE review checks the detail, not the hype.</p>
          <form className="submission-form" onSubmit={submit} data-testid="form-submit-contestant">
            <div className="field-grid">
              <div className="field"><label htmlFor="handle">Your handle</label><input id="handle" value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@handle" data-testid="input-handle" /><small>What should the board call you?</small></div>
              <div className="field"><label htmlFor="category">Category</label><select id="category" value={category} onChange={(event) => setCategory(event.target.value as ContestantInput['category'])} data-testid="select-category"><option value="Open">Open</option><option value="Male">Male</option><option value="Female">Female</option></select><small>Choose the board you want to play on.</small></div>
              <div className="field full"><label htmlFor="signatureMove">Signature move</label><input id="signatureMove" value={signatureMove} onChange={(event) => setSignatureMove(event.target.value)} placeholder="The Freeze Step" data-testid="input-signature-move" /><small>Give it a name people can repeat.</small></div>
              <div className="field full"><label htmlFor="referenceClipUrl">Reference clip URL</label><input id="referenceClipUrl" type="url" value={referenceClipUrl} onChange={(event) => setReferenceClipUrl(event.target.value)} placeholder="https://..." data-testid="input-reference-url" /><small>Link to the clip that proves the move. Public links work best.</small></div>
              <div className="field full"><label htmlFor="visualProof">Visual proof filename <span style={{ color: 'hsl(var(--muted-foreground))' }}>(optional)</span></label><input id="visualProof" type="file" onChange={(event) => setVisualProofName(event.target.files?.[0]?.name ?? '')} data-testid="input-visual-proof" /><small>{visualProofName || 'A filename is stored with your entry; upload hosting is not required.'}</small></div>
            </div>
            {formError && <div className="field-error" role="alert" data-testid="status-submit-error">{formError}</div>}
            <div className="submit-foot"><button type="submit" className="button-primary" disabled={createContestant.isPending} data-testid="button-submit-contestant">{createContestant.isPending ? 'Sending to review…' : 'Submit for review'} <ArrowUpRight size={14} /></button><span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>No spam. No disappearing acts.</span></div>
          </form>
        </div>
        <aside className="form-aside">
          <h3>Before you<br />step in.</h3>
          <ul className="core-list">
            <li><b>C</b><span><strong>Control</strong><br />Can you own the ball through the full motion?</span></li>
            <li><b>O</b><span><strong>Originality</strong><br />Does the move have a point of view?</span></li>
            <li><b>R</b><span><strong>Repeatability</strong><br />Can another player recognize the pattern?</span></li>
            <li><b>E</b><span><strong>Execution</strong><br />Does it hold up at game speed?</span></li>
          </ul>
          <p className="aside-note">Every submission enters as pending check. Verified entries get a score, a verdict, and a place on the public board.</p>
        </aside>
      </div>
    </PageFrame>
  );
}

function Detail() {
  const params = useParams<{ id?: string }>();
  const id = Number(params.id);
  const validId = Number.isFinite(id) && id > 0;
  const query = useGetContestant(id, { query: { enabled: validId, queryKey: getGetContestantQueryKey(id) } });
  const contestant = query.data;

  return (
    <PageFrame>
      <div className="content-wrap detail-layout">
        <div className="detail-top"><Link href="/" className="back-link" data-testid="link-back-board"><ArrowLeft size={14} /> Back to the board</Link>{contestant && <StatusPill status={contestant.verificationStatus} />}</div>
        {query.isLoading ? <div className="detail-loading skeleton" data-testid="loading-contestant" /> : query.isError || !validId ? (
          <ErrorState onRetry={() => void query.refetch()} message={validId ? 'This entry is still finding its footing.' : 'That entry number is not on the board.'} />
        ) : contestant ? (
          <article className="detail-card" data-testid={`card-contestant-${contestant.id}`}>
            <div className="detail-score">
              <div className="detail-score-label">Overall fidelity / CORE score</div>
              <div className="score-big" data-testid={`text-detail-score-${contestant.id}`}>{contestant.overallFidelity}<span>/100</span></div>
              <div className="score-status"><strong>{contestant.coreVerdict}</strong><span style={{ color: 'hsl(42 36% 94% / .62)', fontFamily: 'var(--app-font-mono)', fontSize: 9 }}>ENTRY #{String(contestant.id).padStart(4, '0')}</span></div>
            </div>
            <div className="detail-main">
              <div className="eyebrow">Verified entry</div>
              <h1 data-testid={`text-detail-handle-${contestant.id}`}>{contestant.handle}</h1>
              <div className="subtitle">{contestant.group || 'Open run'} / submitted {new Date(contestant.createdAt).toLocaleDateString()}</div>
              <div className="detail-fields">
                <div className="detail-field"><label>Signature move</label><p data-testid={`text-detail-move-${contestant.id}`}>{contestant.signatureMove}</p></div>
                <div className="detail-field"><label>Category</label><p>{contestant.category}</p></div>
                <div className="detail-field"><label>Verification</label><p><StatusPill status={contestant.verificationStatus} /></p></div>
                <div className="detail-field"><label>CORE verdict</label><p>{contestant.coreVerdict}</p></div>
              </div>
              <div className="detail-links">
                {contestant.referenceClipUrl && <a className="button-primary" href={contestant.referenceClipUrl} target="_blank" rel="noreferrer" data-testid={`link-reference-clip-${contestant.id}`}><Play size={14} /> Watch reference clip <ExternalLink size={13} /></a>}
                {contestant.visualProofName && <span className="button-secondary" data-testid={`text-visual-proof-${contestant.id}`}><Check size={14} /> {contestant.visualProofName}</span>}
              </div>
            </div>
          </article>
        ) : null}
      </div>
    </PageFrame>
  );
}

function NotFound() {
  return <PageFrame><div className="content-wrap error-state" style={{ minHeight: '65dvh', display: 'grid', placeItems: 'center' }}><div><div className="eyebrow" style={{ justifyContent: 'center' }}>Out of bounds</div><h1 style={{ fontFamily: 'var(--app-font-display)', fontSize: 78, lineHeight: .85, margin: '20px 0' }}>No move<br />here.</h1><Link href="/" className="button-primary" data-testid="link-not-found-home">Back to the board <ArrowLeft size={14} /></Link></div></div></PageFrame>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={Home} /><Route path="/submit" component={Submit} /><Route path="/contestants/:id" component={Detail} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;