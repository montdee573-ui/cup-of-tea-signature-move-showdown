import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';

// Same-origin shared API (not the artifact base path).
export const PROMO_SRC = '/api/campaign-media/cards-brackets.mp4';
const POSTER = `${import.meta.env.BASE_URL}images/campaign-key-art.png`;

type Status = 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'error';

export default function PromoPlayer() {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState('');
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const on = (e: string, f: () => void) => { v.addEventListener(e, f); return () => v.removeEventListener(e, f); };
    const offs = [
      on('loadedmetadata', () => { setDur(v.duration || 0); setStatus((s) => (s === 'loading' ? 'ready' : s)); }),
      on('canplay', () => setStatus((s) => (s === 'loading' ? 'ready' : s))),
      on('playing', () => setStatus('playing')),
      on('pause', () => setStatus((s) => (s === 'ended' ? s : 'paused'))),
      on('ended', () => setStatus('ended')),
      on('timeupdate', () => setT(v.currentTime)),
      on('volumechange', () => setMuted(v.muted)),
      on('error', () => { const c = v.error?.code; setErr(c === 4 ? 'Video source unavailable or unsupported.' : c === 2 ? 'Network error while loading video.' : 'Video failed to load.'); setStatus('error'); }),
    ];
    return () => offs.forEach((o) => o());
  }, []);

  const play = async () => {
    const v = ref.current; if (!v) return;
    try { await v.play(); } catch (e) {
      // Fallback: retry muted if the browser blocks audible playback.
      try { v.muted = true; await v.play(); } catch { setErr((e as Error)?.message || 'Playback was blocked.'); }
    }
  };
  const pause = () => ref.current?.pause();
  const replay = () => { const v = ref.current; if (!v) return; v.currentTime = 0; void play(); };
  const toggleSound = () => { const v = ref.current; if (!v) return; v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 1; };
  const retry = () => { const v = ref.current; if (!v) return; setErr(''); setStatus('loading'); v.load(); };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const btn = 'flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-95 disabled:opacity-40';
  return (
    <main className="min-h-[100dvh] w-full flex flex-col items-center justify-center gap-5 px-4 py-8" style={{ background: 'radial-gradient(circle at 50% 0%, #2a1f3d, #120d1c 70%)', color: '#f6efe4', fontFamily: 'DM Sans, sans-serif' }}>
      <header className="text-center">
        <p className="text-xs tracking-[0.3em] uppercase opacity-70" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Campaign promo</p>
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Cup of Tea — Cards &amp; Brackets</h1>
        <p className="text-xs opacity-60 mt-1">Promotional reel · demo examples · not a contest entry</p>
      </header>
      <section className="w-full max-w-[380px] rounded-3xl p-2.5" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}>
        <div className="relative overflow-hidden rounded-2xl" style={{ aspectRatio: '9 / 16', background: '#0b0812' }}>
          <video
            ref={ref}
            className="absolute inset-0 h-full w-full object-contain"
            src={PROMO_SRC}
            poster={POSTER}
            playsInline
            controls
            preload="metadata"
            data-testid="promo-video"
          >
            <source src={PROMO_SRC} type="video/mp4" />
          </video>
          {status === 'loading' && <div className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs">Loading video…</div>}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 p-6 text-center">
              <p className="text-sm">{err}</p>
              <button onClick={retry} className={btn} style={{ background: '#f2b544', color: '#1a1226' }}>Retry</button>
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button onClick={() => void play()} disabled={status === 'playing' || status === 'error'} className={btn} style={{ background: '#f2b544', color: '#1a1226' }} aria-label="Play"><Play className="h-4 w-4" />Play</button>
          <button onClick={pause} disabled={status !== 'playing'} className={btn} style={{ background: 'rgba(255,255,255,0.12)' }} aria-label="Pause"><Pause className="h-4 w-4" />Pause</button>
          <button onClick={replay} disabled={status === 'error'} className={btn} style={{ background: 'rgba(255,255,255,0.12)' }} aria-label="Replay"><RotateCcw className="h-4 w-4" />Replay</button>
          <button onClick={toggleSound} className={btn} style={{ background: 'rgba(255,255,255,0.12)' }} aria-pressed={muted} aria-label={muted ? 'Sound on' : 'Mute'}>{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}{muted ? 'Sound off' : 'Sound on'}</button>
        </div>
        <p className="mt-2 text-center text-xs opacity-60" style={{ fontFamily: 'JetBrains Mono, monospace' }} role="timer">{fmt(t)} / {fmt(dur)}</p>
        {err && status !== 'error' && <p className="mt-1 text-center text-xs text-amber-300">{err}</p>}
      </section>
    </main>
  );
}
