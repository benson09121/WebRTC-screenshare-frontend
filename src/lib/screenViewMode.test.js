import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  getContainedMediaSize,
  getNextScreenViewMode,
  getScreenVideoLayout,
  normalizeScreenViewMode,
} from './screenViewMode.js';

test('normalizes unsupported screen view modes to fit', () => {
  assert.equal(normalizeScreenViewMode('fill'), 'fill');
  assert.equal(normalizeScreenViewMode('unknown'), 'fit');
  assert.equal(normalizeScreenViewMode(null), 'fit');
});

test('maps fit, fill, and pixel modes to distinct video layouts', () => {
  assert.match(getScreenVideoLayout('fit').videoClassName, /object-contain/);
  assert.match(getScreenVideoLayout('fill').videoClassName, /object-cover/);
  assert.match(
    getScreenVideoLayout('pixel').viewportClassName,
    /overflow-auto/,
  );
  assert.match(getScreenVideoLayout('pixel').videoClassName, /max-w-none/);
});

test('resets to fit when the selected main view is no longer a screen', () => {
  assert.equal(getNextScreenViewMode('pixel', true), 'pixel');
  assert.equal(getNextScreenViewMode('pixel', false), 'fit');
});

test('contains media in fullscreen without changing its aspect ratio', () => {
  assert.deepEqual(getContainedMediaSize(1920, 1080, 2.4), {
    width: 1920,
    height: 800,
  });
  assert.deepEqual(getContainedMediaSize(1280, 720, 4 / 3), {
    width: 960,
    height: 720,
  });
  assert.equal(getContainedMediaSize(0, 720, 16 / 9), null);
});
