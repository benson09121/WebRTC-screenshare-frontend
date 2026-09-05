import { expect, test } from 'vitest';
import {
  buildProviderEmbedUrl,
  EXTERNAL_WATCH_PROVIDERS,
  getExternalWatchProvider,
} from './externalWatchProviders.js';

const movie = { mediaType: 'movie', tmdbId: 27205 };
const episode = {
  mediaType: 'tv',
  tmdbId: 1399,
  season: 2,
  episode: 3,
};

test('exposes the provider-first choices in a stable order', () => {
  expect(EXTERNAL_WATCH_PROVIDERS.map(({ id }) => id)).toEqual([
    'anixo-extension',
    'supaplay-extension',
    'vidking-extension',
    'zoryva-extension',
    '2embed-extension',
    'vidsrc-io-extension',
  ]);
  expect(getExternalWatchProvider('missing')).toBeNull();
});

test.each([
  [
    'vidking-extension',
    'https://www.vidking.net/embed/movie/27205?autoPlay=false&color=6ee7d2',
    'https://www.vidking.net/embed/tv/1399/2/3?autoPlay=false&color=6ee7d2&episodeSelector=false&nextEpisode=false',
  ],
  [
    'zoryva-extension',
    'https://zoryva.me/embedded/movie/27205',
    'https://zoryva.me/embedded/tv/1399/2/3',
  ],
  [
    '2embed-extension',
    'https://www.2embed.cc/embed/27205',
    'https://www.2embed.cc/embedtv/1399&s=2&e=3',
  ],
  [
    'vidsrc-io-extension',
    'https://vidsrc.io/embed/movie/27205?autoplay=0',
    'https://vidsrc.io/embed/tv/1399/2/3?autoplay=0',
  ],
])('builds documented %s movie and episode URLs', (id, movieUrl, tvUrl) => {
  expect(buildProviderEmbedUrl(id, movie)).toBe(movieUrl);
  expect(buildProviderEmbedUrl(id, episode)).toBe(tvUrl);
});
