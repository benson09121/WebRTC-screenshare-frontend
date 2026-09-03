// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { WatchCatalog } from './WatchCatalog.jsx';

afterEach(cleanup);

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
