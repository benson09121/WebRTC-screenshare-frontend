import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  assert.match(getScreenVideoLayout('pixel').viewportClassName, /overflow-auto/);
  assert.match(getScreenVideoLayout('pixel').videoClassName, /max-w-none/);
});

test('resets to fit when the selected main view is no longer a screen', () => {
  assert.equal(getNextScreenViewMode('pixel', true), 'pixel');
  assert.equal(getNextScreenViewMode('pixel', false), 'fit');
});
