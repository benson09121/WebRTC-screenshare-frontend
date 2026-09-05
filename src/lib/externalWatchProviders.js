const provider = (config) => Object.freeze(config);

export const EXTERNAL_WATCH_PROVIDERS = Object.freeze([
  ...[
    { id: 'anixo-extension', name: 'AniXo', origin: 'https://anixo.buzz', path: '/embed/ani' },
    { id: 'supaplay-extension', name: 'SupaPlay', origin: 'https://supaplay.fun', path: '/stream/ani', availabilityWarning: 'Recent checks returned “Content Removed” for tested episodes. Other titles may vary; PairBeam cannot restore unavailable provider content.' },
  ].map((config) => provider({
    ...config,
    catalog: 'anilist',
    referrerPolicy: 'strict-origin-when-cross-origin',
    description: 'Anime episodes with AniList search and sub/dub selection. Playback verification pending.',
    status: 'Experimental',
    buildEmbedUrl(media) {
      return new URL(`${this.path}/${media.anilistId}/${media.episode}/${media.audioLanguage}`, this.origin).toString();
    },
  })),
  provider({
    id: 'vidking-extension',
    name: 'Vidking',
    origin: 'https://www.vidking.net',
    referrerPolicy: 'no-referrer',
    description: 'The currently verified PairBeam watch-together provider.',
    status: 'Tested',
    buildEmbedUrl(media) {
      const path =
        media.mediaType === 'movie'
          ? `/embed/movie/${media.tmdbId}`
          : `/embed/tv/${media.tmdbId}/${media.season}/${media.episode}`;
      const url = new URL(path, this.origin);
      url.searchParams.set('autoPlay', 'false');
      url.searchParams.set('color', '6ee7d2');
      if (media.mediaType === 'tv') {
        url.searchParams.set('episodeSelector', 'false');
        url.searchParams.set('nextEpisode', 'false');
      }
      return url.toString();
    },
  }),
  provider({
    id: 'zoryva-extension',
    name: 'Zoryva',
    origin: 'https://zoryva.me',
    referrerPolicy: 'strict-origin-when-cross-origin',
    description: 'Direct movie and exact-episode embeds from Zoryva.',
    status: 'Experimental',
    buildEmbedUrl(media) {
      const path =
        media.mediaType === 'movie'
          ? `/embedded/movie/${media.tmdbId}`
          : `/embedded/tv/${media.tmdbId}/${media.season}/${media.episode}`;
      return new URL(path, this.origin).toString();
    },
  }),
  provider({
    id: '2embed-extension',
    name: '2Embed',
    origin: 'https://www.2embed.cc',
    referrerPolicy: 'strict-origin-when-cross-origin',
    description: 'TMDB-based movie and exact-episode embeds from 2Embed.',
    status: 'Experimental',
    buildEmbedUrl(media) {
      return media.mediaType === 'movie'
        ? `${this.origin}/embed/${media.tmdbId}`
        : `${this.origin}/embedtv/${media.tmdbId}&s=${media.season}&e=${media.episode}`;
    },
  }),
  provider({
    id: 'vidsrc-io-extension',
    name: 'VidSrc.io',
    origin: 'https://vidsrc.io',
    referrerPolicy: 'strict-origin-when-cross-origin',
    description:
      'VidSrc.io embeds; its nested player host may change without notice.',
    status: 'Experimental',
    buildEmbedUrl(media) {
      const path =
        media.mediaType === 'movie'
          ? `/embed/movie/${media.tmdbId}`
          : `/embed/tv/${media.tmdbId}/${media.season}/${media.episode}`;
      const url = new URL(path, this.origin);
      url.searchParams.set('autoplay', '0');
      return url.toString();
    },
  }),
]);

const providersById = new Map(
  EXTERNAL_WATCH_PROVIDERS.map((item) => [item.id, item]),
);

export const getExternalWatchProvider = (providerId) =>
  providersById.get(providerId) || null;

export const isExternalWatchProviderId = (providerId) =>
  providersById.has(providerId);

export const buildProviderEmbedUrl = (providerId, media) =>
  getExternalWatchProvider(providerId)?.buildEmbedUrl(media) || null;
