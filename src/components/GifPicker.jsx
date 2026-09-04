import React, { useEffect, useState } from 'react';
import { Images, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const GIPHY_KEY = import.meta.env.VITE_GIPHY_API_KEY;

export const GifPicker = ({ disabled, onSelect, triggerClassName = '' }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !GIPHY_KEY) return undefined;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      async () => {
        try {
          setError('');
          const endpoint = query.trim() ? 'search' : 'trending';
          const params = new URLSearchParams({
            api_key: GIPHY_KEY,
            limit: '18',
            rating: 'pg-13',
          });
          if (query.trim()) params.set('q', query.trim());
          const response = await fetch(
            `https://api.giphy.com/v1/gifs/${endpoint}?${params}`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error('GIF search failed.');
          const payload = await response.json();
          setResults(payload.data || []);
        } catch (fetchError) {
          if (fetchError.name !== 'AbortError') setError(fetchError.message);
        }
      },
      query ? 250 : 0,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`size-11 ${triggerClassName}`}
          disabled={disabled}
          aria-label="Choose a GIF"
        >
          <Images className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-[min(22rem,calc(100vw-1rem))] p-3"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
            placeholder="Search GIFs"
            aria-label="Search GIFs"
          />
        </div>
        {!GIPHY_KEY ? (
          <p className="py-6 text-center text-xs leading-5 text-zinc-400">
            Add <code>VITE_GIPHY_API_KEY</code> to enable GIF search.
          </p>
        ) : error ? (
          <p role="alert" className="py-6 text-center text-xs text-red-300">
            {error}
          </p>
        ) : (
          <div className="custom-scrollbar mt-3 grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
            {results.map((gif) => {
              const preview =
                gif.images?.fixed_width_small?.url ||
                gif.images?.preview_gif?.url;
              const url =
                gif.images?.downsized_medium?.url || gif.images?.original?.url;
              return preview && url ? (
                <button
                  key={gif.id}
                  type="button"
                  className="overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                  onClick={() => {
                    onSelect({
                      kind: 'gif',
                      url,
                      alt: gif.title || 'Shared GIF',
                    });
                    setOpen(false);
                  }}
                >
                  <img
                    src={preview}
                    alt={gif.title || 'GIF'}
                    className="aspect-video size-full object-cover"
                    loading="lazy"
                  />
                </button>
              ) : null;
            })}
          </div>
        )}
        {GIPHY_KEY ? (
          <p className="pt-2 text-right text-[10px] text-zinc-600">
            Powered by GIPHY
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
