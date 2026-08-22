import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWatchProviderAudit,
  isProviderSynchronizationReady,
  REQUIRED_METHODS,
  REQUIRED_WATCH_CAPABILITIES,
  validateWatchProviderAdapter,
} from './watchProvider.js';

test('blocks audited providers that cannot accept synchronized playback commands', () => {
  const audit = getWatchProviderAudit();
  assert.deepEqual(audit.map(provider => provider.id), ['vidking', 'vidsrc-sbs']);
  assert.equal(audit.every(provider => provider.synchronizationReady === false), true);
  assert.equal(audit.find(provider => provider.id === 'vidking').missingCapabilities.includes('acceptsSeek'), true);
  assert.equal(audit.find(provider => provider.id === 'vidsrc-sbs').missingCapabilities.includes('emitsPlaybackState'), true);
});

test('accepts only a production-enabled HTTPS adapter with the full bidirectional contract', () => {
  const adapter = {
    id: 'authorized-test-provider',
    origin: 'https://player.example.test',
    productionEnabled: true,
    capabilities: { ...REQUIRED_WATCH_CAPABILITIES },
  };
  REQUIRED_METHODS.forEach(method => { adapter[method] = () => undefined; });

  assert.equal(isProviderSynchronizationReady(adapter), true);
  assert.deepEqual(validateWatchProviderAdapter(adapter), { valid: true, reason: null });
});

test('rejects a nominally capable adapter when a lifecycle method is absent', () => {
  const adapter = {
    origin: 'https://player.example.test',
    productionEnabled: true,
    capabilities: { ...REQUIRED_WATCH_CAPABILITIES },
  };
  REQUIRED_METHODS.slice(1).forEach(method => { adapter[method] = () => undefined; });
  assert.match(validateWatchProviderAdapter(adapter).reason, /buildEmbedUrl/);
});
