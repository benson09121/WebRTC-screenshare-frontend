import { test } from 'vitest';
import assert from 'node:assert/strict';
import { shouldIgnoreIdleActivity } from './idleActivity.js';

test('ignores activity originating inside an idle-exempt surface', () => {
  assert.equal(
    shouldIgnoreIdleActivity({ closest: (selector) => selector }),
    true,
  );
  assert.equal(shouldIgnoreIdleActivity({ closest: () => null }), false);
  assert.equal(shouldIgnoreIdleActivity(null), false);
});
