import { expect, test, vi } from 'vitest';
import { createAnilistCatalogClient } from './anilistApi';

test('anime search goes directly to AniList without credentials and preserves its identity', async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ data: {
    Page: { pageInfo: { hasNextPage: true }, media: [{ id: 154587, title: { romaji: 'Sousou no Frieren' }, description: '<b>Adventure</b>', averageScore: 91, episodes: 28 }] },
  } }) }));
  const signal = new AbortController().signal;
  const result = await createAnilistCatalogClient({ fetchImpl }).search('Frieren', 1, signal);
  expect(result.results[0]).toMatchObject({ anilistId: 154587, mediaType: 'anime', rating: 9.1, overview: 'Adventure', episodes: 28 });
  expect(result.results[0]).not.toHaveProperty('tmdbId');
  expect(result.totalPages).toBe(2);
  expect(fetchImpl).toHaveBeenCalledWith('https://graphql.anilist.co', expect.objectContaining({ credentials: 'omit', signal, method: 'POST' }));
});

test('rate limit and GraphQL errors are surfaced instead of treated as empty results', async () => {
  for (const response of [{ status: 429 }, { ok: true, json: async () => ({ errors: [{ message: 'Failed' }] }) }]) {
    const client = createAnilistCatalogClient({ fetchImpl: async () => response });
    await expect(client.search('Naruto')).rejects.toThrow(/AniList/);
  }
});

test('unknown episode count remains unknown and details validate IDs', async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ data: { Media: { id: 21, title: { english: 'One Piece' }, episodes: null } } }) }));
  const client = createAnilistCatalogClient({ fetchImpl });
  expect((await client.details(21)).episodes).toBeNull();
  await expect(client.details(-1)).rejects.toThrow(/valid/);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
