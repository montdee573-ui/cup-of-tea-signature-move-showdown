import { type CSSProperties, useMemo, useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronRight,
  Clapperboard,
  Compass,
  ExternalLink,
  Film,
  Flame,
  ArrowDown,
  ArrowUp,
  ListVideo,
  Play,
  Search,
  Sparkles,
  Star,
  X,
} from 'lucide-react';

type Movie = {
  id: string;
  title: string;
  year: number;
  genres: string[];
  duration: string;
  score: number;
  label: string;
  description: string;
  watchUrl: string;
  trailerUrl?: string;
  poster: string;
  accent: string;
  freeToWatch?: boolean;
  availabilityGuide?: boolean;
  watchLabel?: string;
};

const movies: Movie[] = [
  {
    id: 'his-girl-friday',
    title: 'His Girl Friday',
    year: 1940,
    genres: ['Comedy', 'Romance'],
    duration: '1h 32m',
    score: 94,
    label: 'Editor’s pick',
    description:
      'A fast-talking newsroom classic about a reporter, her former editor, and one last impossible deadline.',
    watchUrl: 'https://archive.org/details/his-girl-friday-1940',
    poster:
      'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=900&q=85',
    accent: '#e15c38',
  },
  {
    id: 'night-of-the-living-dead',
    title: 'Night of the Living Dead',
    year: 1968,
    genres: ['Horror', 'Thriller'],
    duration: '1h 36m',
    score: 91,
    label: 'Cult favorite',
    description:
      'A group of strangers barricades themselves inside a farmhouse as the dead begin to walk.',
    watchUrl: 'https://archive.org/details/night_of_the_living_dead',
    poster:
      'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=900&q=85',
    accent: '#9f3154',
  },
  {
    id: 'the-general',
    title: 'The General',
    year: 1926,
    genres: ['Comedy', 'Adventure'],
    duration: '1h 18m',
    score: 96,
    label: 'Timeless',
    description:
      'Buster Keaton races across the Civil War South in one of cinema’s most inventive silent comedies.',
    watchUrl: 'https://archive.org/details/the_general_1926',
    poster:
      'https://images.unsplash.com/photo-1440404653325-ab127d49?auto=format&fit=crop&w=900&q=85',
    accent: '#c28b4d',
  },
  {
    id: 'charade',
    title: 'Charade',
    year: 1963,
    genres: ['Mystery', 'Romance'],
    duration: '1h 53m',
    score: 92,
    label: 'Midnight pick',
    description:
      'Paris, a missing fortune, and a stranger with too many names. A stylish mystery with perfect chemistry.',
    watchUrl: 'https://archive.org/details/Charade1963',
    poster:
      'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=900&q=85',
    accent: '#28627a',
  },
  {
    id: 'sherlock-jr',
    title: 'Sherlock Jr.',
    year: 1924,
    genres: ['Comedy', 'Mystery'],
    duration: '45m',
    score: 95,
    label: 'Short & sharp',
    description:
      'A movie projectionist dreams himself into the detective role in a burst of impossible visual jokes.',
    watchUrl: 'https://archive.org/details/sherlock-jr.-1924',
    poster:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=85',
    accent: '#d3a437',
  },
  {
    id: 'detour',
    title: 'Detour',
    year: 1945,
    genres: ['Crime', 'Thriller'],
    duration: '1h 8m',
    score: 89,
    label: 'Dark room',
    description:
      'A down-on-his-luck pianist takes a ride west and finds himself trapped in a noir nightmare.',
    watchUrl: 'https://archive.org/details/Detour1945',
    poster:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=85',
    accent: '#4f5d75',
  },
  {
    id: 'caligari',
    title: 'The Cabinet of Dr. Caligari',
    year: 1920,
    genres: ['Horror', 'Mystery'],
    duration: '1h 17m',
    score: 90,
    label: 'Visual landmark',
    description:
      'A hypnotist, a somnambulist, and a town twisted into one of the earliest great cinematic nightmares.',
    watchUrl: 'https://archive.org/details/the-cabinet-of-dr.-caligari-1920',
    poster:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=85',
    accent: '#7c4b89',
  },
  {
    id: 'plan-9',
    title: 'Plan 9 from Outer Space',
    year: 1959,
    genres: ['Sci-Fi', 'Cult'],
    duration: '1h 19m',
    score: 76,
    label: 'So bad it’s good',
    description:
      'Flying saucers, resurrected corpses, and a determined alien warning humanity to stop making bombs.',
    watchUrl: 'https://archive.org/details/plan-9-from-outer-space_202101',
    poster:
      'https://images.unsplash.com/photo-1446776877081-d282a0f896e2?auto=format&fit=crop&w=900&q=85',
    accent: '#3c8f91',
  },
  {
    id: 'scream',
    title: 'Scream',
    year: 1996,
    genres: ['Horror', 'Mystery', 'Thriller'],
    duration: '1h 51m',
    score: 93,
    label: 'Ghostface classic',
    description:
      'A masked killer turns horror movie rules into a deadly game in the sharp, self-aware Woodsboro original.',
    watchUrl: 'https://www.justwatch.com/us/movie/scream',
    poster:
      'https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=900&q=85',
    accent: '#a62f45',
    freeToWatch: true,
    availabilityGuide: true,
    watchLabel: 'View free options',
  },
  {
    id: 'scream-2',
    title: 'Scream 2',
    year: 1997,
    genres: ['Horror', 'Mystery', 'Thriller'],
    duration: '2h',
    score: 87,
    label: 'Campus sequel',
    description:
      'Sidney tries to rebuild her life at college while a new Ghostface turns the sequel into the scene of the crime.',
    watchUrl: 'https://www.justwatch.com/us/movie/scream-2',
    poster:
      'https://images.unsplash.com/photo-1515630278258-407f66498911?auto=format&fit=crop&w=900&q=85',
    accent: '#6f3f68',
    freeToWatch: true,
    availabilityGuide: true,
    watchLabel: 'View free options',
  },
  {
    id: 'scream-3',
    title: 'Scream 3',
    year: 2000,
    genres: ['Horror', 'Mystery', 'Thriller'],
    duration: '1h 56m',
    score: 75,
    label: 'Hollywood chapter',
    description:
      'The survivors head to a movie set in Hollywood, where the rules of the franchise get dangerously personal.',
    watchUrl: 'https://www.justwatch.com/us/movie/scream-3',
    poster:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=85',
    accent: '#374b68',
    freeToWatch: false,
  },
  {
    id: 'scream-4',
    title: 'Scream 4',
    year: 2011,
    genres: ['Horror', 'Mystery', 'Thriller'],
    duration: '1h 51m',
    score: 82,
    label: 'Requel energy',
    description:
      'A return to Woodsboro brings a new generation, a new killer, and a very familiar set of rules.',
    watchUrl: 'https://www.justwatch.com/us/movie/scream-4',
    poster:
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=85',
    accent: '#a64255',
    freeToWatch: false,
  },
  {
    id: 'scream-2022',
    title: 'Scream',
    year: 2022,
    genres: ['Horror', 'Mystery', 'Thriller'],
    duration: '1h 54m',
    score: 84,
    label: 'Legacy sequel',
    description:
      'A new Ghostface brings the original survivors back to Woodsboro for a brutal update of the rules.',
    watchUrl: 'https://www.justwatch.com/us/movie/scream-2022',
    poster:
      'https://images.unsplash.com/photo-1531259683007-016a7b628fc3?auto=format&fit=crop&w=900&q=85',
    accent: '#b44b37',
    freeToWatch: true,
    availabilityGuide: true,
    watchLabel: 'View free options',
  },
  {
    id: 'scream-6',
    title: 'Scream VI',
    year: 2023,
    genres: ['Horror', 'Mystery', 'Thriller'],
    duration: '2h 3m',
    score: 86,
    label: 'City of terror',
    description:
      'The survivors leave Woodsboro for New York, but Ghostface follows them into the biggest city and the darkest corners.',
    watchUrl: 'https://www.justwatch.com/us/movie/scream-6',
    poster:
      'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=85',
    accent: '#7f323c',
    freeToWatch: false,
  },
];

const genres = ['All', 'Comedy', 'Horror', 'Mystery', 'Thriller', 'Romance', 'Sci-Fi'];

type Playlist = {
  id: string;
  name: string;
  description: string;
  movieIds: string[];
  accent: string;
};

const curatedPlaylists: Playlist[] = [
  {
    id: 'late-night-legends',
    name: 'Late-night legends',
    description: 'Shadowy mysteries and after-dark favorites.',
    movieIds: ['charade', 'detour', 'caligari'],
    accent: '#7c4b89',
  },
  {
    id: 'laughs-after-dark',
    name: 'Laughs after dark',
    description: 'Fast jokes, big chases, zero homework.',
    movieIds: ['his-girl-friday', 'the-general', 'sherlock-jr'],
    accent: '#c28b4d',
  },
  {
    id: 'short-sharp',
    name: 'Short & sharp',
    description: 'Three compact classics for one free hour.',
    movieIds: ['sherlock-jr', 'detour', 'plan-9'],
    accent: '#3c8f91',
  },
  {
    id: 'scream-franchise',
    name: 'Scream franchise',
    description: 'Every Ghostface chapter, from Woodsboro to New York.',
    movieIds: ['scream', 'scream-2', 'scream-3', 'scream-4', 'scream-2022', 'scream-6'],
    accent: '#a62f45',
  },
];

function Poster({ movie, large = false }: { movie: Movie; large?: boolean }) {
  return (
    <div
      className={`poster ${large ? 'poster-large' : ''}`}
      style={{ '--poster-image': `url("${movie.poster}")`, '--poster-accent': movie.accent } as CSSProperties}
    >
      <div className="poster-wash" />
      <div className="poster-copy">
        <span className="poster-kicker">FREE REEL</span>
        <strong>{movie.title}</strong>
        <span>{movie.year}</span>
      </div>
      <span className="poster-rating"><Star size={11} fill="currentColor" /> {movie.score}</span>
    </div>
  );
}

function MovieCard({
  movie,
  saved,
  onOpen,
  onToggleSaved,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
}: {
  movie: Movie;
  saved: boolean;
  onOpen: (movie: Movie) => void;
  onToggleSaved: (id: string) => void;
  onMove?: (id: string, direction: 'up' | 'down') => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  return (
    <article className="movie-card">
      <button className="poster-button" onClick={() => onOpen(movie)} aria-label={`Open ${movie.title}`}>
        <Poster movie={movie} />
        <span className="play-overlay"><Play size={17} fill="currentColor" /></span>
      </button>
      <div className="movie-card-meta">
        <div>
          <h3>{movie.title}</h3>
          <p>{movie.year} · {movie.genres[0]} · {movie.duration}</p>
          {movie.availabilityGuide && <small className="availability-tag free-tag">FREE OPTIONS</small>}
          {movie.freeToWatch === false && <small className="availability-tag">WHERE TO WATCH</small>}
        </div>
        <div className="card-actions">
          <button
            className={`save-button ${saved ? 'saved' : ''}`}
            onClick={() => onToggleSaved(movie.id)}
            aria-label={saved ? `Remove ${movie.title} from My List` : `Save ${movie.title} to My List`}
          >
            {saved ? <Check size={15} /> : <Bookmark size={15} />}
          </button>
          {onMove && (
            <div className="queue-controls" aria-label={`Reorder ${movie.title}`}>
              <button type="button" onClick={() => onMove(movie.id, 'up')} disabled={!canMoveUp} aria-label={`Move ${movie.title} up`}>
                <ArrowUp size={12} />
              </button>
              <button type="button" onClick={() => onMove(movie.id, 'down')} disabled={!canMoveDown} aria-label={`Move ${movie.title} down`}>
                <ArrowDown size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function PlaylistCard({ playlist, onOpen }: { playlist: Playlist; onOpen: (id: string) => void }) {
  const previewMovies = playlist.movieIds.map((id) => movies.find((movie) => movie.id === id)).filter((movie): movie is Movie => Boolean(movie)).slice(0, 3);

  return (
    <button className="playlist-card" onClick={() => onOpen(playlist.id)} style={{ '--playlist-accent': playlist.accent } as CSSProperties}>
      <div className="playlist-collage">
        {previewMovies.map((movie) => <div key={movie.id} className="playlist-thumb" style={{ backgroundImage: `url("${movie.poster}")` }} />)}
        <span className="playlist-count">{playlist.movieIds.length} films</span>
      </div>
      <div className="playlist-card-copy">
        <strong>{playlist.name}</strong>
        <span>{playlist.description}</span>
      </div>
      <ChevronRight className="playlist-arrow" size={16} />
    </button>
  );
}

function SectionTitle({ eyebrow, title, onSeeAll }: { eyebrow: string; title: string; onSeeAll?: () => void }) {
  return (
    <div className="section-title">
      <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
      {onSeeAll && <button className="see-all" onClick={onSeeAll}>See all <ChevronRight size={15} /></button>}
    </div>
  );
}

function App() {
  const [query, setQuery] = useState('');
  const [activeGenre, setActiveGenre] = useState('All');
  const [freeOnly, setFreeOnly] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('viral-reel-list') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  const playlists = useMemo<Playlist[]>(() => [
    {
      id: 'my-list',
      name: 'My playlist',
      description: savedIds.length ? 'Your saved queue, ready for the next watch.' : 'Save films here to build your own queue.',
      movieIds: savedIds,
      accent: '#d8f24b',
    },
    ...curatedPlaylists,
  ], [savedIds]);

  const activePlaylist = playlists.find((playlist) => playlist.id === activePlaylistId);
  const showList = activePlaylistId === 'my-list';

  const toggleSaved = (id: string) => {
    setSavedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      localStorage.setItem('viral-reel-list', JSON.stringify(next));
      return next;
    });
  };

  const moveSaved = (id: string, direction: 'up' | 'down') => {
    setSavedIds((current) => {
      const index = current.indexOf(id);
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      localStorage.setItem('viral-reel-list', JSON.stringify(next));
      return next;
    });
  };

  const openPlaylist = (id: string) => {
    setActivePlaylistId(id);
    setActiveGenre('All');
    setFreeOnly(false);
    setQuery('');
    window.setTimeout(() => document.getElementById('playlist-view')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const clearPlaylist = () => setActivePlaylistId(null);
  const showFreeMovies = () => {
    setActivePlaylistId(null);
    setActiveGenre('All');
    setFreeOnly(true);
    setQuery('');
    window.setTimeout(() => document.getElementById('free-tonight')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  const filteredMovies = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const orderedMovies = showList
      ? savedIds.map((id) => movies.find((movie) => movie.id === id)).filter((movie): movie is Movie => Boolean(movie))
      : movies;
    return orderedMovies.filter((movie) => {
      const matchesGenre = activeGenre === 'All' || movie.genres.includes(activeGenre);
      const matchesQuery = !normalized || `${movie.title} ${movie.genres.join(' ')}`.toLowerCase().includes(normalized);
      const matchesPlaylist = !activePlaylist || activePlaylist.movieIds.includes(movie.id);
      const matchesFree = !freeOnly || movie.freeToWatch !== false;
      return matchesGenre && matchesQuery && matchesPlaylist && matchesFree;
    });
  }, [activeGenre, activePlaylist, freeOnly, query, savedIds, showList]);

  const openFirstFree = () => document.getElementById('free-tonight')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="movie-app">
      <header className="movie-header">
        <a className="movie-brand" href="#top" aria-label="Viral Reel home">
          <span className="brand-icon"><Clapperboard size={19} /></span>
          <span>VIRAL <em>REEL</em></span>
        </a>
        <nav className="movie-nav" aria-label="Main navigation">
          <a href="#discover"><Compass size={15} /> Discover</a>
           <button onClick={showFreeMovies}><Film size={15} /> Free now</button>
           <button onClick={() => openPlaylist('my-list')}><ListVideo size={15} /> My playlist <span>{savedIds.length}</span></button>
        </nav>
        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movies..." aria-label="Search movies" />
        </label>
      </header>

      <main id="top">
        <section className="movie-hero">
          <div className="hero-glow" />
          <div className="hero-content">
            <div className="hero-tag"><Flame size={14} fill="currentColor" /> WHAT EVERYONE IS WATCHING</div>
            <h1>Good movies.<br /><span>Zero rent.</span></h1>
            <p>Free picks and legal watch guides worth texting your group chat about. No sign-up. No paywall. Just press play.</p>
            <div className="hero-buttons">
              <a className="button-primary" href={movies[0].watchUrl} target="_blank" rel="noreferrer"><Play size={15} fill="currentColor" /> Watch free</a>
              <button className="button-ghost" onClick={openFirstFree}>Browse the reel <ChevronRight size={15} /></button>
            </div>
            <div className="hero-footnote"><Sparkles size={13} /> Curated from free-to-watch sources</div>
          </div>
          <div className="hero-feature">
            <Poster movie={movies[0]} large />
            <div className="feature-caption"><span>Tonight’s feature</span><strong>{movies[0].title}</strong><small>{movies[0].year} · {movies[0].genres.join(' / ')} · {movies[0].duration}</small></div>
          </div>
        </section>

        <section className="content" id="discover">
          <div className="category-row" aria-label="Filter by genre">
            <button className={freeOnly && !activePlaylistId ? 'active' : ''} onClick={showFreeMovies}>Free now</button>
            {genres.map((genre) => <button key={genre} className={activeGenre === genre && !activePlaylistId && !freeOnly ? 'active' : ''} onClick={() => { setActiveGenre(genre); setFreeOnly(false); clearPlaylist(); }}>{genre}</button>)}
          </div>

          <section className="playlist-section">
            <SectionTitle eyebrow="Make a night of it" title="Playlists" />
            <div className="playlist-grid">
              {playlists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} onOpen={openPlaylist} />)}
            </div>
          </section>

          {activePlaylistId ? (
            <section className="catalog-section">
              <SectionTitle eyebrow={showList ? 'Your watch queue' : 'Curated for tonight'} title={activePlaylist?.name ?? 'Playlist'} onSeeAll={clearPlaylist} />
              {filteredMovies.length === 0 ? <div className="empty-list"><ListVideo size={27} /><h3>Your playlist is empty.</h3><p>Save a movie and it’ll show up in your queue.</p><button className="button-primary" onClick={clearPlaylist}>Browse movies</button></div> : <div className="movie-grid">{filteredMovies.map((movie, index) => <MovieCard key={movie.id} movie={movie} saved={savedIds.includes(movie.id)} onOpen={setSelectedMovie} onToggleSaved={toggleSaved} onMove={showList ? moveSaved : undefined} canMoveUp={index > 0} canMoveDown={index < filteredMovies.length - 1} />)}</div>}
            </section>
          ) : (
            <>
              <section className="catalog-section">
                <SectionTitle eyebrow="The internet agrees" title="Trending right now" />
                <div className="movie-grid">{movies.slice(0, 4).map((movie) => <MovieCard key={movie.id} movie={movie} saved={savedIds.includes(movie.id)} onOpen={setSelectedMovie} onToggleSaved={toggleSaved} />)}</div>
              </section>
              <section className="catalog-section" id="free-tonight">
                <SectionTitle eyebrow={freeOnly ? 'No account or subscription required' : activeGenre === 'All' ? 'Free picks + legal watch guides' : `${activeGenre} picks`} title={freeOnly ? 'Free now' : 'Browse the reel'} />
                {filteredMovies.length === 0 ? <div className="empty-list"><Search size={27} /><h3>No free movies found.</h3><p>Try another title or browse the full reel.</p></div> : <div className="movie-grid">{filteredMovies.map((movie) => <MovieCard key={movie.id} movie={movie} saved={savedIds.includes(movie.id)} onOpen={setSelectedMovie} onToggleSaved={toggleSaved} />)}</div>}
              </section>
            </>
          )}
        </section>
      </main>

      <footer className="movie-footer">
        <div className="movie-brand"><span className="brand-icon"><Clapperboard size={17} /></span><span>VIRAL <em>REEL</em></span></div>
        <p>Free movies plus legal availability guides. Sources can change by region.</p>
        <span>Made for movie people.</span>
      </footer>

      {selectedMovie && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMovie(null); }}>
          <article className="movie-modal" role="dialog" aria-modal="true" aria-label={selectedMovie.title}>
            <button className="modal-close" onClick={() => setSelectedMovie(null)} aria-label="Close"><X size={19} /></button>
            <div className="modal-poster"><Poster movie={selectedMovie} large /></div>
            <div className="modal-copy">
              <span className="eyebrow">{selectedMovie.label}</span>
              <h2>{selectedMovie.title}</h2>
              <div className="modal-stats"><span><Star size={14} fill="currentColor" /> {selectedMovie.score}/100</span><span>{selectedMovie.year}</span><span>{selectedMovie.duration}</span></div>
              <div className="modal-genres">{selectedMovie.genres.map((genre) => <span key={genre}>{genre}</span>)}</div>
              <p>{selectedMovie.description}</p>
              <div className="modal-actions">
                <a className="button-primary" href={selectedMovie.watchUrl} target="_blank" rel="noreferrer"><Play size={15} fill="currentColor" /> {selectedMovie.watchLabel ?? (selectedMovie.freeToWatch === false ? 'Find where to watch' : 'Watch free')} <ExternalLink size={13} /></a>
                <button className="button-ghost" onClick={() => toggleSaved(selectedMovie.id)}>{savedIds.includes(selectedMovie.id) ? <Check size={15} /> : <Bookmark size={15} />} {savedIds.includes(selectedMovie.id) ? 'Saved' : 'Save'}</button>
              </div>
              <small className="source-note">{selectedMovie.availabilityGuide ? 'Opens a legal availability guide with free options when available. Kanopy or Hoopla may require a participating library card; Pluto TV may include ads.' : selectedMovie.freeToWatch === false ? 'Opens a legal availability guide in a new tab. Rental or subscription options may vary by region.' : 'Opens the free source in a new tab. No account required by Viral Reel.'}</small>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}

export default App;