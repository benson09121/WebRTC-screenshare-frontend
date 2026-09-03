import { test } from 'vitest';
import assert from 'node:assert/strict';
import { getNextSelectedView } from './viewSelection.js';

test('does not select a remote share until its media stream is available', () => {
  assert.equal(
    getNextSelectedView({
      selectedView: 'remote-camera',
      hasRemoteScreen: false,
      hasLocalScreen: false,
      previousShares: { local: false, remote: false },
    }),
    'remote-camera',
  );
});

test('selects a newly available remote screen from the participant view', () => {
  assert.equal(
    getNextSelectedView({
      selectedView: 'remote-camera',
      hasRemoteScreen: true,
      hasLocalScreen: false,
      previousShares: { local: false, remote: false },
    }),
    'remote-screen',
  );
});

test('falls back to the other available share when the selected share ends', () => {
  assert.equal(
    getNextSelectedView({
      selectedView: 'remote-screen',
      hasRemoteScreen: false,
      hasLocalScreen: true,
      previousShares: { local: true, remote: true },
    }),
    'local-screen',
  );
});

test('keeps an explicitly focused local camera selected', () => {
  assert.equal(
    getNextSelectedView({
      selectedView: 'local-camera',
      hasRemoteScreen: true,
      hasLocalScreen: false,
      previousShares: { local: false, remote: true },
    }),
    'local-camera',
  );
});

test('does not override the synchronized provider selection', () => {
  assert.equal(
    getNextSelectedView({
      selectedView: 'external-watch',
      hasRemoteScreen: false,
      hasLocalScreen: false,
      previousShares: { local: false, remote: false },
    }),
    'external-watch',
  );
});
