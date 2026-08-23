import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const readManifest = async (filename) =>
  JSON.parse(
    await readFile(
      new URL(`../../extension/${filename}`, import.meta.url),
      'utf8',
    ),
  );

test('keeps the Chromium MV3 background manifest Chrome-only', async () => {
  const manifest = await readManifest('manifest.json');

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.background.service_worker).toBe('background.js');
  expect('scripts' in manifest.background).toBe(false);
  expect('browser_specific_settings' in manifest).toBe(false);
});

test('keeps the Firefox MV3 background manifest Firefox-only', async () => {
  const manifest = await readManifest('manifest.firefox.json');

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.background.scripts).toEqual(['background.js']);
  expect('service_worker' in manifest.background).toBe(false);
  expect(typeof manifest.browser_specific_settings.gecko.id).toBe('string');
});
