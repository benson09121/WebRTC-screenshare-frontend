// @vitest-environment jsdom

import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('announces an installed extension before the MV3 worker responds', async () => {
  const postMessage = vi
    .spyOn(window, 'postMessage')
    .mockImplementation(() => {});
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'pairbeam-test-extension',
      getManifest: () => ({ version: '0.5.1' }),
      // Deliberately do not invoke the callback. This models a worker that has
      // not woken yet; the content bridge must still prove installation.
      sendMessage: vi.fn(),
      onMessage: { addListener: vi.fn() },
    },
  });

  await import('../../extension/pairbeam-bridge.js');

  expect(postMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      channel: 'pairbeam-extension',
      extensionVersion: '0.5.1',
      type: 'status',
      detected: true,
      playerReady: false,
    }),
    window.location.origin,
  );
});
