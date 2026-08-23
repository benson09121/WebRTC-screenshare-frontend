import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readManifest = async filename => JSON.parse(await readFile(
  new URL(`../../extension/${filename}`, import.meta.url),
  'utf8',
));

test('keeps the Chromium MV3 background manifest Chrome-only', async () => {
  const manifest = await readManifest('manifest.json');

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal('scripts' in manifest.background, false);
  assert.equal('browser_specific_settings' in manifest, false);
});

test('keeps the Firefox MV3 background manifest Firefox-only', async () => {
  const manifest = await readManifest('manifest.firefox.json');

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.background.scripts, ['background.js']);
  assert.equal('service_worker' in manifest.background, false);
  assert.equal(typeof manifest.browser_specific_settings.gecko.id, 'string');
});
