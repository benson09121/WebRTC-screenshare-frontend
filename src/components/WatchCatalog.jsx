import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Film,
  ListVideo,
  Play,
  Search,
  Star,
  X,
} from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { tmdbCatalog } from '../lib/catalogApi';

const imageUrl = (path, size = 'w342') => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `https://image.tmdb.org/t/p/${size}${path.startsWith('/') ? path : `/${path}`}`;
};

const yearOf = (date) => (date ? String(date).slice(0, 4) : '—');
const mediaLabel = (type) => (type === 'tv' ? 'TV series' : 'Movie');
const episodeCode = (episode) =>
  `S${String(episode.seasonNumber).padStart(2, '0')} E${String(episode.episodeNumber).padStart(2, '0')}`;

const Poster = ({ item, className = '' }) => {
  const [failed, setFailed] = useState(false);
  const src = imageUrl(item.posterPath);
  return (
    <div
      className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-white/[0.06] ${className}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="grid size-full place-items-center text-zinc-600">
          <Film className="size-6" aria-hidden="true" />
        </div>
      )}
    </div>
  );
};

const EpisodeStill = ({ episode }) => {
  const [failed, setFailed] = useState(false);
  const src = imageUrl(episode.stillPath, 'w500');
  return (
    <div className="aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-white/[0.05] sm:w-44">
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="grid size-full place-items-center text-zinc-700">
          <Film className="size-5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
};

const Skeletons = () => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    {Array.from({ length: 10 }, (_, index) => (
      <div key={index} className="animate-pulse" aria-hidden="true">
        <div className="aspect-[2/3] rounded-xl bg-white/[0.07]" />
        <div className="mt-2 h-3 w-4/5 rounded bg-white/[0.07]" />
        <div className="mt-1 h-2 w-2/5 rounded bg-white/[0.05]" />
      </div>
    ))}
  </div>
);

const Rating = ({ item }) =>
  item.rating == null ? null : (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-amber-200"
      title="TMDB rating"
    >
      <Star className="size-3 fill-current" aria-hidden="true" />
      {Number(item.rating).toFixed(1)}{' '}
      <span className="text-zinc-600">TMDB</span>
    </span>
  );

const SeasonButtons = ({ seasons, selectedSeason, onSelect }) => (
  <nav className="space-y-1" aria-label="Seasons">
    {seasons.map((season) => (
      <button
        type="button"
        key={season.seasonNumber}
        onClick={() => onSelect(season.seasonNumber)}
        aria-current={
          selectedSeason === season.seasonNumber ? 'page' : undefined
        }
        className={`focus-visible:ring-focus flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-xs transition-colors outline-none focus-visible:ring-2 ${selectedSeason === season.seasonNumber ? 'bg-teal-300/15 text-teal-100' : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]'}`}
      >
        <span>{season.title || `Season ${season.seasonNumber}`}</span>
        <span className="text-subtle-foreground font-mono text-[10px]">
          {season.episodeCount || '—'}
        </span>
      </button>
    ))}
  </nav>
);

const EpisodeList = ({ episodes, status, error, onWatch }) => {
  if (status === 'loading') {
    return (
      <div className="space-y-3" role="status" aria-label="Loading episodes">
        {[1, 2, 3].map((value) => (
          <div
            key={value}
            className="h-36 animate-pulse rounded-2xl bg-white/[0.05]"
          />
        ))}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <p
        className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100"
        role="alert"
      >
        {error}
      </p>
    );
  }
  if (!episodes?.length) {
    return (
      <p className="border-border text-muted-foreground rounded-xl border border-dashed p-5 text-sm">
        No episodes are available for this season.
      </p>
    );
  }

  return (
    <ol className="grid gap-3">
      {episodes.map((episode) => (
        <li
          key={episode.id || `${episode.seasonNumber}-${episode.episodeNumber}`}
        >
          <article className="motion-content-swap border-border grid gap-3 rounded-2xl border bg-white/[0.025] p-3 sm:grid-cols-[11rem_1fr]">
            <EpisodeStill episode={episode} />
            <div className="flex min-w-0 flex-col">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-semibold tracking-[0.14em] text-teal-200 uppercase">
                    {episodeCode(episode)}
                  </p>
                  <h4 className="text-foreground mt-1 text-sm font-medium">
                    {episode.title || 'Untitled episode'}
                  </h4>
                </div>
                <Rating item={episode} />
              </div>
              <div className="text-subtle-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {episode.runtime ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3" aria-hidden="true" />
                    {episode.runtime} min
                  </span>
                ) : null}
                {episode.airDate ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3" aria-hidden="true" />
                    {episode.airDate}
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground mt-2 line-clamp-3 text-xs leading-5">
                {episode.overview || 'Episode details unavailable.'}
              </p>
              <Button
                variant="active"
                size="sm"
                className="mt-3 self-start"
                onClick={() => onWatch(episode)}
                aria-label={`Watch ${episodeCode(episode)} ${episode.title || ''}`.trim()}
              >
                <Play className="size-3.5" aria-hidden="true" />
                Watch episode
              </Button>
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
};

export const WatchCatalog = ({ open, onClose, onProposal }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState(null);
  const [detailStatus, setDetailStatus] = useState('idle');
  const [season, setSeason] = useState(1);
  const [seasonData, setSeasonData] = useState(null);
  const [seasonStatus, setSeasonStatus] = useState('idle');
  const [seasonError, setSeasonError] = useState('');
  const [seasonSheetOpen, setSeasonSheetOpen] = useState(false);
  const [proposalError, setProposalError] = useState('');
  const searchAbortRef = useRef(null);
  const detailAbortRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setResults([]);
    setSelected(null);
    setStatus('idle');
    setError('');
    setPage(1);
    setProposalError('');
    return () => {
      searchAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, [open]);

  useEffect(() => {
    if (!open || selected || query.trim().length < 2) {
      if (!selected) setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;
    const timer = window.setTimeout(async () => {
      setStatus('loading');
      setError('');
      try {
        const data = await tmdbCatalog.search(query, page, controller.signal);
        setResults(Array.isArray(data.results) ? data.results : []);
        setTotalPages(Number(data.totalPages) || 1);
        setStatus('ready');
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setStatus('error');
          setError(requestError.message);
        }
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, page, selected]);

  const openDetail = async (item) => {
    const controller = new AbortController();
    detailAbortRef.current?.abort();
    detailAbortRef.current = controller;
    setSelected(item);
    setDetailStatus('loading');
    setSeasonData(null);
    setSeason(1);
    setProposalError('');
    try {
      const details = await tmdbCatalog.details(
        item.mediaType === 'tv' ? 'tv' : 'movie',
        item.id,
        controller.signal,
      );
      setSelected({ ...item, ...details });
      setSeason(details.seasons?.[0]?.seasonNumber || 1);
      setDetailStatus('ready');
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setDetailStatus('error');
        setError(requestError.message);
      }
    }
  };

  useEffect(() => {
    if (!selected || selected.mediaType !== 'tv' || detailStatus !== 'ready')
      return undefined;
    const controller = new AbortController();
    setSeasonData(null);
    setSeasonStatus('loading');
    setSeasonError('');
    tmdbCatalog
      .season(selected.id, season, controller.signal)
      .then((data) => {
        setSeasonData(data);
        setSeasonStatus('ready');
      })
      .catch((requestError) => {
        if (requestError.name !== 'AbortError') {
          setSeasonStatus('error');
          setSeasonError(requestError.message);
        }
      });
    return () => controller.abort();
  }, [selected, season, detailStatus]);

  const seasons = useMemo(() => {
    if (Array.isArray(selected?.seasons)) return selected.seasons;
    const count = Number(selected?.numberOfSeasons || 0);
    return count > 0
      ? Array.from({ length: count }, (_, index) => ({
          seasonNumber: index + 1,
          title: `Season ${index + 1}`,
          episodeCount: 0,
        }))
      : [];
  }, [selected]);

  const submitProposal = (media) => {
    setProposalError('');
    if (onProposal?.(media)) {
      onClose();
      return;
    }
    setProposalError(
      'The watch invitation could not be sent. Make sure the participant is connected and no other provider session is active.',
    );
  };

  const watchEpisode = (episode) =>
    submitProposal({
      ...selected,
      season: episode.seasonNumber || season,
      episode: episode.episodeNumber,
      episodeTitle: episode.title || `Episode ${episode.episodeNumber}`,
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        showClose={false}
        className="catalog-dialog-surface border-border bg-panel flex h-[min(94dvh,56rem)] min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border shadow-2xl sm:rounded-3xl"
        aria-describedby="watch-catalog-description"
        data-idle-exempt="true"
      >
        <header className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6">
          {selected ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelected(null);
                setError('');
                setProposalError('');
              }}
              aria-label="Back to catalog search"
            >
              <ArrowLeft className="size-4" />
            </Button>
          ) : (
            <div className="grid size-9 place-items-center rounded-xl bg-teal-300/10 text-teal-200">
              <Film className="size-4" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-foreground truncate text-sm font-semibold">
              {selected ? selected.title : 'Find something to watch'}
            </DialogTitle>
            <DialogDescription
              id="watch-catalog-description"
              className="text-subtle-foreground text-xs"
            >
              Browse titles to propose for the room
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close catalog"
          >
            <X className="size-4" />
          </Button>
        </header>

        {selected ? (
          <div className="motion-content-swap min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {detailStatus === 'loading' ? (
              <div
                className="h-56 animate-pulse rounded-2xl bg-white/[0.06]"
                role="status"
                aria-label="Loading title details"
              />
            ) : detailStatus === 'error' ? (
              <p
                className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-100"
                role="alert"
              >
                {error}
              </p>
            ) : (
              <>
                <div className="grid gap-5 md:grid-cols-[10rem_1fr]">
                  <Poster
                    item={selected}
                    className="mx-auto w-36 md:mx-0 md:w-40"
                  />
                  <div>
                    <div className="text-subtle-foreground flex flex-wrap items-center gap-2 text-xs">
                      <span>{mediaLabel(selected.mediaType)}</span>
                      <span>·</span>
                      <span>{yearOf(selected.releaseDate)}</span>
                      {selected.runtime ? (
                        <>
                          <span>·</span>
                          <span>{selected.runtime} min</span>
                        </>
                      ) : null}
                      <Rating item={selected} />
                    </div>
                    {selected.genres?.length ? (
                      <p className="text-muted-foreground mt-2 text-xs">
                        {selected.genres.map((genre) => genre.name).join(' · ')}
                      </p>
                    ) : null}
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
                      {selected.overview ||
                        'No overview is available for this title.'}
                    </p>
                    {selected.mediaType === 'movie' ? (
                      <Button
                        className="mt-5"
                        variant="active"
                        onClick={() => submitProposal(selected)}
                      >
                        <Film className="size-4" />
                        Try synchronized playback
                      </Button>
                    ) : (
                      <p className="mt-5 inline-flex items-center gap-2 rounded-lg border border-teal-300/15 bg-teal-300/[0.06] px-3 py-2 text-xs text-teal-100">
                        <ListVideo className="size-4" aria-hidden="true" />
                        Choose an episode below to start the synchronized
                        session.
                      </p>
                    )}
                    <p className="text-subtle-foreground mt-2 max-w-2xl text-[11px] leading-5">
                      Experimental desktop-browser prototype. Both participants
                      need the PairBeam extension for Chrome/Chromium or
                      Firefox; each browser loads Vidking locally while only
                      playback state travels through the private room.
                    </p>
                    {proposalError ? (
                      <p
                        className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-100"
                        role="alert"
                      >
                        {proposalError}
                      </p>
                    ) : null}
                  </div>
                </div>

                {selected.mediaType === 'tv' ? (
                  <section
                    className="border-border mt-7 border-t pt-5"
                    aria-labelledby="episodes-title"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3
                          id="episodes-title"
                          className="text-foreground text-sm font-medium"
                        >
                          Episodes
                        </h3>
                        <p className="text-subtle-foreground mt-1 text-xs">
                          Select one exact episode for both participants.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="md:hidden"
                        onClick={() => setSeasonSheetOpen(true)}
                        aria-haspopup="dialog"
                      >
                        Season {season}
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-[10rem_minmax(0,1fr)]">
                      <aside className="border-border hidden self-start rounded-xl border bg-white/[0.02] p-2 md:block">
                        <SeasonButtons
                          seasons={seasons}
                          selectedSeason={season}
                          onSelect={setSeason}
                        />
                      </aside>
                      <EpisodeList
                        episodes={seasonData?.episodes}
                        status={seasonStatus}
                        error={seasonError}
                        onWatch={watchEpisode}
                      />
                    </div>
                    <Sheet
                      open={seasonSheetOpen}
                      onOpenChange={setSeasonSheetOpen}
                    >
                      <SheetContent
                        side="bottom"
                        aria-describedby="season-sheet-description"
                      >
                        <SheetTitle>Choose a season</SheetTitle>
                        <SheetDescription
                          id="season-sheet-description"
                          className="mt-1"
                        >
                          Episodes update after you choose a season.
                        </SheetDescription>
                        <div className="mt-5">
                          <SeasonButtons
                            seasons={seasons}
                            selectedSeason={season}
                            onSelect={(value) => {
                              setSeason(value);
                              setSeasonSheetOpen(false);
                            }}
                          />
                        </div>
                      </SheetContent>
                    </Sheet>
                  </section>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div className="motion-content-swap min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
            <div className="bg-panel/95 sticky top-0 z-10 -mx-4 -mt-4 px-4 pt-4 pb-3 backdrop-blur-md sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-600"
                  aria-hidden="true"
                />
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search movies and TV shows"
                  className="pl-9"
                  aria-label="Search movies and TV shows"
                />
              </div>
            </div>
            <div className="mt-2 pb-3" aria-live="polite">
              {query.trim().length < 2 ? (
                <div className="border-border grid min-h-48 place-items-center rounded-2xl border border-dashed text-center">
                  <div>
                    <Search className="mx-auto size-6 text-zinc-700" />
                    <p className="text-muted-foreground mt-2 text-sm">
                      Search by title to start browsing.
                    </p>
                  </div>
                </div>
              ) : status === 'loading' ? (
                <Skeletons />
              ) : status === 'error' ? (
                <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5 text-sm text-red-100">
                  {error}
                </div>
              ) : results.length === 0 ? (
                <div className="border-border grid min-h-48 place-items-center rounded-2xl border border-dashed text-center">
                  <p className="text-muted-foreground text-sm">
                    No titles found for “{query.trim()}”.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {results.map((item) => (
                      <button
                        type="button"
                        key={`${item.mediaType}-${item.id}`}
                        onClick={() => openDetail(item)}
                        className="motion-result-card group focus-visible:ring-focus min-w-0 rounded-xl text-left outline-none focus-visible:ring-2"
                      >
                        <Poster
                          item={item}
                          className="transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transition-none"
                        />
                        <p className="mt-2 truncate text-sm font-medium text-zinc-200 group-hover:text-teal-200">
                          {item.title}
                        </p>
                        <div className="text-subtle-foreground mt-1 flex items-center gap-2 text-[11px]">
                          <span>{mediaLabel(item.mediaType)}</span>
                          <span>{yearOf(item.releaseDate)}</span>
                          <Rating item={item} />
                        </div>
                      </button>
                    ))}
                  </div>
                  {totalPages > 1 ? (
                    <div className="mt-6 flex items-center justify-center gap-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={page <= 1}
                        onClick={() => setPage((value) => value - 1)}
                      >
                        Previous
                      </Button>
                      <span className="text-subtle-foreground text-xs">
                        Page {page} of {totalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={page >= totalPages}
                        onClick={() => setPage((value) => value + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
        <footer className="border-border text-subtle-foreground shrink-0 border-t px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-[10px] leading-4 sm:px-6">
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground font-semibold underline-offset-2 hover:underline"
          >
            TMDB metadata
          </a>
          {' · '}This product uses the TMDB API but is not endorsed or certified
          by TMDB.
        </footer>
      </DialogContent>
    </Dialog>
  );
};
