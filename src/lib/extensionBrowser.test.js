import test from 'node:test';
import assert from 'node:assert/strict';
import { detectExtensionBrowser } from './extensionBrowser.js';

test('detects desktop Firefox for the Firefox extension flow', () => {
  assert.deepEqual(
    detectExtensionBrowser({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0' }),
    { family: 'firefox', label: 'Firefox', supported: true },
  );
});

test('maps Chrome and Edge to the Chromium extension flow', () => {
  assert.deepEqual(
    detectExtensionBrowser({ userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36' }),
    { family: 'chromium', label: 'Chrome/Chromium', supported: true },
  );
  assert.deepEqual(
    detectExtensionBrowser({ userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0' }),
    { family: 'chromium', label: 'Microsoft Edge', supported: true },
  );
});

test('does not offer a desktop extension flow to mobile or Safari browsers', () => {
  assert.equal(detectExtensionBrowser({ userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0' }).supported, false);
  assert.deepEqual(
    detectExtensionBrowser({ userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' }),
    { family: 'unsupported', label: 'Safari', supported: false },
  );
});
