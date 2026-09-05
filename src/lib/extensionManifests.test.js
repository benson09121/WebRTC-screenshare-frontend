import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

const readManifest = async (filename) =>
  JSON.parse(
    await readFile(
      new URL(`../../extension/${filename}`, import.meta.url),
      'utf8',
    ),
  );

const EXPECTED_PROVIDER_ORIGINS = [
  'https://anixo.buzz/*',
  'https://supaplay.fun/*',
  'https://www.vidking.net/*',
  'https://zoryva.me/*',
  'https://www.2embed.cc/*',
  'https://vidsrc.io/*',
];

const expectNarrowProviderPermissions = (manifest) => {
  for (const origin of EXPECTED_PROVIDER_ORIGINS) {
    expect(manifest.host_permissions).toContain(origin);
    expect(manifest.content_scripts[1].matches).toContain(origin);
  }
  expect(manifest.host_permissions).not.toContain('<all_urls>');
  expect(manifest.host_permissions).not.toContain('https://*/*');
};

test('keeps the Chromium MV3 background manifest Chrome-only', async () => {
  const manifest = await readManifest('manifest.json');

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.version).toBe('0.6.0');
  expect(manifest.background.service_worker).toBe('background.js');
  expect('scripts' in manifest.background).toBe(false);
  expect('browser_specific_settings' in manifest).toBe(false);
  expectNarrowProviderPermissions(manifest);
});

test('keeps the Firefox MV3 background manifest Firefox-only', async () => {
  const manifest = await readManifest('manifest.firefox.json');

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.version).toBe('0.6.0');
  expect(manifest.background.scripts).toEqual(['background.js']);
  expect('service_worker' in manifest.background).toBe(false);
  expect(typeof manifest.browser_specific_settings.gecko.id).toBe('string');
  expectNarrowProviderPermissions(manifest);
});

test('packages the Chromium manifest at the archive root for Load unpacked', async () => {
  const archive = await readFile(
    new URL('../../pairbeam-extension.zip', import.meta.url),
  );
  const archiveIndex = archive.toString('latin1');

  expect(archiveIndex).toContain('manifest.json');
  expect(archiveIndex).not.toContain('extension/manifest.json');
});
