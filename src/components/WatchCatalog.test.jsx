// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { anilistCatalog } from '../lib/anilistApi';
import { WatchCatalog } from './WatchCatalog.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test.each(['AniXo', 'SupaPlay'])('%s searches AniList and invites the exact episode and audio version', async (providerName) => {
  const anime = { id: 154587, anilistId: 154587, mediaType: 'anime', title: 'Frieren', episodes: 28, rating: 9.1, ratingSource: 'AniList' };
  const search = vi.spyOn(anilistCatalog, 'search').mockResolvedValue({ results: [anime], totalPages: 1 });
  vi.spyOn(anilistCatalog, 'details').mockResolvedValue(anime);
  const onProposal = vi.fn(() => true);
  render(<WatchCatalog open onClose={() => undefined} onProposal={onProposal} />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(providerName) }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search anime on AniList' }), { target: { value: 'Frieren' } });
  fireEvent.click(await screen.findByRole('button', { name: /Frieren/ }));
  const episode = await screen.findByRole('spinbutton');
  fireEvent.change(episode, { target: { value: '3' } });
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dub' } });
  fireEvent.click(screen.getByRole('button', { name: 'Invite to watch episode' }));
  expect(search).toHaveBeenCalledWith('Frieren', 1, expect.any(AbortSignal));
  expect(onProposal).toHaveBeenCalledWith(expect.objectContaining({ anilistId: 154587, mediaType: 'anime', episode: 3, audioLanguage: 'dub', providerId: `${providerName.toLowerCase()}-extension` }));
  expect(onProposal.mock.calls[0][0]).not.toHaveProperty('tmdbId');
});

test('requires a provider choice before showing catalog search', () => {
  render(
    <WatchCatalog open onClose={() => undefined} onProposal={() => true} />,
  );

  expect(
    screen.getByRole('heading', { name: 'Choose the provider first' }),
  ).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /2Embed/ }));

  expect(
    screen.getByRole('textbox', { name: 'Search movies and TV shows' }),
  ).toBeTruthy();
  expect(screen.getByText('Browse with 2Embed')).toBeTruthy();
});
