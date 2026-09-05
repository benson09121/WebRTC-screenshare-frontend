import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { anilistCatalog } from '../lib/anilistApi';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';

export const AnimeEpisodeDrawer = ({ media, onSelect, hidden }) => {
  const [open, setOpen] = useState(false);
  const [episode, setEpisode] = useState(media.episode);
  const [language, setLanguage] = useState(media.audioLanguage);
  const [count, setCount] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (hidden) setOpen(false); }, [hidden]);
  useEffect(() => {
    if (!open) return undefined;
    setEpisode(media.episode);
    setLanguage(media.audioLanguage);
    setCount(null);
    setError('');
    const controller = new AbortController();
    anilistCatalog.details(media.anilistId, controller.signal).then((details) => {
      if (!controller.signal.aborted) setCount(details.episodes);
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(reason.message);
    });
    return () => controller.abort();
  }, [open, media.anilistId, media.episode, media.audioLanguage]);
  return <Sheet open={open} onOpenChange={setOpen}>
    <div className={`absolute top-1/2 left-0 z-50 -translate-y-1/2 transition-opacity ${hidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`} inert={hidden}>
      <Button variant="secondary" size="icon" onClick={() => setOpen(true)} aria-label={`Choose another episode of ${media.title}`} aria-expanded={open} aria-haspopup="dialog"><ChevronRight className="size-4" /></Button>
    </div>
    <SheetContent side="left" aria-describedby="anime-episodes-description">
      <SheetTitle>{media.title}</SheetTitle>
      <SheetDescription id="anime-episodes-description">Change the episode and sub/dub version for both participants. Availability depends on the provider.</SheetDescription>
      <label className="mt-6 block text-sm">Episode{count ? ` (1–${count})` : ''}
        <Input className="mt-2" type="number" min="1" max={count || undefined} step="1" value={episode} onChange={(event) => setEpisode(Number(event.target.value))} />
      </label>
      <label className="mt-4 block text-sm">Audio
        <select className="mt-2 block w-full rounded-lg border border-border bg-panel p-2" value={language} onChange={(event) => setLanguage(event.target.value)}>
          <option value="sub">Japanese · Sub</option><option value="dub">English · Dub</option>
        </select>
      </label>
      <Button className="mt-5" disabled={!Number.isSafeInteger(episode) || episode < 1 || Boolean(count && episode > count)} onClick={() => {
        if (onSelect({ ...media, episode, audioLanguage: language, episodeTitle: `Episode ${episode}` })) setOpen(false);
        else setError('Could not change the episode. Check the room connection.');
      }}>Watch together</Button>
      {error ? <p className="mt-4 text-sm text-red-300" role="alert">{error}</p> : null}
    </SheetContent>
  </Sheet>;
};
