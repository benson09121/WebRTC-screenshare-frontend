import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock3, ListVideo, LoaderCircle } from 'lucide-react';
import { tmdbCatalog } from '../lib/catalogApi';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';

const episodeCode = episode => `S${String(episode.seasonNumber).padStart(2, '0')} E${String(episode.episodeNumber).padStart(2, '0')}`;

export const SeriesEpisodeDrawer = ({ media, onSelect, hidden = false }) => {
  const [open, setOpen] = useState(false);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(media?.season || 1);
  const [episodes, setEpisodes] = useState([]);
  const [detailsStatus, setDetailsStatus] = useState('idle');
  const [episodesStatus, setEpisodesStatus] = useState('idle');
  const [error, setError] = useState('');
  const seasonListRef = useRef(null);

  useEffect(() => {
    setSelectedSeason(media?.season || 1);
  }, [media?.season, media?.tmdbId]);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useEffect(() => {
    if (!open || media?.mediaType !== 'tv') return undefined;
    const controller = new AbortController();
    setDetailsStatus('loading');
    setError('');
    tmdbCatalog.details('tv', media.tmdbId, controller.signal)
      .then(details => {
        setSeasons(Array.isArray(details.seasons) ? details.seasons : []);
        setDetailsStatus('ready');
      })
      .catch(requestError => {
        if (requestError.name !== 'AbortError') {
          setDetailsStatus('error');
          setError(requestError.message);
        }
      });
    return () => controller.abort();
  }, [open, media?.mediaType, media?.tmdbId]);

  useEffect(() => {
    if (!open || media?.mediaType !== 'tv') return undefined;
    const controller = new AbortController();
    setEpisodesStatus('loading');
    setEpisodes([]);
    setError('');
    tmdbCatalog.season(media.tmdbId, selectedSeason, controller.signal)
      .then(season => {
        setEpisodes(Array.isArray(season.episodes) ? season.episodes : []);
        setEpisodesStatus('ready');
      })
      .catch(requestError => {
        if (requestError.name !== 'AbortError') {
          setEpisodesStatus('error');
          setError(requestError.message);
        }
      });
    return () => controller.abort();
  }, [open, media?.mediaType, media?.tmdbId, selectedSeason]);

  useEffect(() => {
    if (!open || !seasons.length) return undefined;
    const frame = window.requestAnimationFrame(() => {
      seasonListRef.current
        ?.querySelector(`[data-season-number="${selectedSeason}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, seasons.length, selectedSeason]);

  if (media?.mediaType !== 'tv') return null;

  const scrollSeasons = direction => {
    const list = seasonListRef.current;
    if (!list) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollBy({
      left: direction * Math.max(160, list.clientWidth * 0.75),
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  const selectEpisode = episode => {
    if (episode.seasonNumber === media.season && episode.episodeNumber === media.episode) {
      setOpen(false);
      return;
    }
    const accepted = onSelect?.({
      ...media,
      season: episode.seasonNumber,
      episode: episode.episodeNumber,
      episodeTitle: episode.title || `Episode ${episode.episodeNumber}`,
    });
    if (accepted) {
      setOpen(false);
    } else {
      setError('The episode could not be changed. Check that the participant is still connected.');
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <div
        className={`absolute left-0 top-1/2 z-50 -translate-y-1/2 transition-opacity duration-200 ease-out motion-reduce:transition-none ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        aria-hidden={hidden}
        inert={hidden}
      >
        <Button
          variant="secondary"
          size="icon"
          className="size-11 rounded-l-none border-l-0 bg-black/75 shadow-xl backdrop-blur-md"
          onClick={() => setOpen(true)}
          aria-label={`Choose another episode of ${media.title}`}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <SheetContent side="left" className="flex overflow-hidden p-0" aria-describedby="series-drawer-description">
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="shrink-0 border-b border-border px-5 pb-4 pt-5 pr-14">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-300">Episode selector</p>
            <SheetTitle className="mt-1 truncate">{media.title}</SheetTitle>
            <SheetDescription id="series-drawer-description" className="mt-1 truncate text-xs">
              Currently {`S${String(media.season).padStart(2, '0')} E${String(media.episode).padStart(2, '0')}`} · {media.episodeTitle || 'Selected episode'}
            </SheetDescription>
          </header>

          <div className="shrink-0 border-b border-border px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-subtle-foreground">Season</p>
            {detailsStatus === 'loading' ? (
              <div className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" />Loading seasons…</div>
            ) : seasons.length ? (
              <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-1.5" role="group" aria-label="Seasons">
                <Button variant="ghost" size="icon" className="size-10" onClick={() => scrollSeasons(-1)} aria-label="Scroll to earlier seasons">
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </Button>
                <div
                  ref={seasonListRef}
                  className="flex min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-2 [scrollbar-gutter:stable]"
                >
                  {seasons.map(season => (
                    <button
                      type="button"
                      key={season.seasonNumber}
                      data-season-number={season.seasonNumber}
                      onClick={() => setSelectedSeason(season.seasonNumber)}
                      aria-pressed={selectedSeason === season.seasonNumber}
                      className={`min-h-10 shrink-0 snap-start rounded-lg border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus ${selectedSeason === season.seasonNumber ? 'border-teal-300/30 bg-teal-300/15 text-teal-100' : 'border-border bg-white/[0.03] text-muted-foreground hover:bg-white/[0.07] hover:text-foreground'}`}
                    >
                      Season {season.seasonNumber}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="icon" className="size-10" onClick={() => scrollSeasons(1)} aria-label="Scroll to later seasons">
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {episodesStatus === 'loading' ? (
              <div className="grid min-h-40 place-items-center text-sm text-muted-foreground" role="status"><span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Loading episodes…</span></div>
            ) : episodesStatus === 'error' || detailsStatus === 'error' ? (
              <p className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs leading-5 text-red-100" role="alert">{error}</p>
            ) : episodes.length ? (
              <ol className="space-y-2" aria-label={`Season ${selectedSeason} episodes`}>
                {episodes.map(episode => {
                  const current = episode.seasonNumber === media.season && episode.episodeNumber === media.episode;
                  return (
                    <li key={episode.id || `${episode.seasonNumber}-${episode.episodeNumber}`}>
                      <button
                        type="button"
                        onClick={() => selectEpisode(episode)}
                        aria-current={current ? 'true' : undefined}
                        className={`flex min-h-16 w-full items-start gap-3 rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus ${current ? 'border-teal-300/30 bg-teal-300/[0.1]' : 'border-border bg-white/[0.025] hover:bg-white/[0.06]'}`}
                      >
                        <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${current ? 'bg-teal-300 text-primary-foreground' : 'bg-white/[0.06] text-teal-200'}`}>
                          {current ? <Check className="size-4" aria-hidden="true" /> : <ListVideo className="size-4" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-200">{episodeCode(episode)}</span>
                          <span className="mt-0.5 block text-xs font-medium leading-5 text-foreground">{episode.title || `Episode ${episode.episodeNumber}`}</span>
                          {episode.runtime ? <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-subtle-foreground"><Clock3 className="size-3" aria-hidden="true" />{episode.runtime} min</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="p-3 text-sm text-muted-foreground">No episodes are available for this season.</p>
            )}
          </div>
          <p className="shrink-0 border-t border-border px-4 py-3 text-[10px] leading-4 text-subtle-foreground" aria-live="polite">
            Either participant may request an episode. The playback authority applies it so both screens switch together.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
