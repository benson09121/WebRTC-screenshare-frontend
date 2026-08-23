import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAYBACK_VOLUMES,
  getRemoteContentVolume,
  normalizePlaybackVolume,
} from './playbackVolume.js';

test('normalizes playback volume to an integer percentage', () => {
  assert.equal(normalizePlaybackVolume(-12), 0);
  assert.equal(normalizePlaybackVolume(47.6), 48);
  assert.equal(normalizePlaybackVolume(140), 100);
  assert.equal(normalizePlaybackVolume('not-a-number'), 100);
});

test('selects independent screen and movie playback volume', () => {
  const volumes = { ...DEFAULT_PLAYBACK_VOLUMES, screen: 35, movie: 72 };

  assert.equal(getRemoteContentVolume('screen', volumes), 35);
  assert.equal(getRemoteContentVolume('movie', volumes), 72);
});
