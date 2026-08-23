import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createTmdbCatalogClient } from './catalogApi.js';

test('TMDB catalog searches directly and normalizes movie and series metadata', async () => {
  const calls = [];
  const client = createTmdbCatalogClient({
    token: 'frontend-token',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          page: 1,
          total_pages: 2,
          total_results: 3,
          results: [
            {
              id: 7,
              media_type: 'movie',
              title: 'Movie',
              poster_path: '/poster.jpg',
              vote_average: 8.2,
            },
            {
              id: 8,
              media_type: 'tv',
              name: 'Series',
              first_air_date: '2025-01-02',
            },
            { id: 9, media_type: 'person', name: 'Person' },
          ],
        }),
      };
    },
  });

  const data = await client.search('movie', 1);
  assert.equal(data.results.length, 2);
  assert.equal(data.results[0].title, 'Movie');
  assert.equal(data.results[0].posterPath, '/poster.jpg');
  assert.equal(data.results[1].mediaType, 'tv');
  assert.match(
    calls[0].url,
    /^https:\/\/api\.themoviedb\.org\/3\/search\/multi\?/,
  );
  assert.match(calls[0].url, /query=movie/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer frontend-token');
});

test('TMDB catalog normalizes series seasons and episodes', async () => {
  const responses = [
    {
      id: 5,
      name: 'Show',
      number_of_seasons: 1,
      seasons: [
        { id: 50, name: 'Season 1', season_number: 1, episode_count: 2 },
      ],
    },
    {
      id: 50,
      name: 'Season 1',
      season_number: 1,
      episodes: [
        {
          id: 51,
          name: 'Pilot',
          episode_number: 1,
          season_number: 1,
          runtime: 42,
        },
      ],
    },
  ];
  const client = createTmdbCatalogClient({
    token: 'frontend-token',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift(),
    }),
  });

  const details = await client.details('tv', 5);
  const season = await client.season(5, 1);
  assert.equal(details.numberOfSeasons, 1);
  assert.equal(details.seasons[0].seasonNumber, 1);
  assert.equal(season.episodes[0].title, 'Pilot');
  assert.equal(season.episodes[0].runtime, 42);
});

test('TMDB catalog requires a frontend token and rejects unknown media types', async () => {
  await assert.rejects(
    () => createTmdbCatalogClient().search('movie'),
    /VITE_TMDB_READ_ACCESS_TOKEN/,
  );
  await assert.rejects(
    () => createTmdbCatalogClient({ token: 'x' }).details('person', 1),
    /Unsupported/,
  );
});
