const REQUIRED_METHODS = Object.freeze([
  'buildEmbedUrl',
  'load',
  'play',
  'pause',
  'seek',
  'subscribe',
  'destroy',
]);

export const REQUIRED_WATCH_CAPABILITIES = Object.freeze({
  emitsReady: true,
  emitsPlaybackState: true,
  acceptsPlay: true,
  acceptsPause: true,
  acceptsSeek: true,
  reportsCurrentTime: true,
  reportsDuration: true,
});

export const AUDITED_WATCH_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'vidking',
    name: 'Vidking',
    origin: 'https://www.vidking.net',
    productionEnabled: false,
    capabilities: Object.freeze({
      emitsReady: false,
      emitsPlaybackState: true,
      acceptsPlay: false,
      acceptsPause: false,
      acceptsSeek: false,
      reportsCurrentTime: true,
      reportsDuration: true,
    }),
    blocker:
      'The public player emits playback events but does not document inbound play, pause, or seek commands.',
  }),
  Object.freeze({
    id: 'vidsrc-sbs',
    name: 'Vidsrc.sbs',
    origin: 'https://vidsrc.sbs',
    productionEnabled: false,
    capabilities: Object.freeze({
      emitsReady: false,
      emitsPlaybackState: false,
      acceptsPlay: false,
      acceptsPause: false,
      acceptsSeek: false,
      reportsCurrentTime: false,
      reportsDuration: false,
    }),
    blocker:
      'The public integration exposes embed/start-time URLs and nested player domains, not a stable bidirectional control contract.',
  }),
]);

export const getMissingWatchCapabilities = (capabilities) =>
  Object.entries(REQUIRED_WATCH_CAPABILITIES)
    .filter(([name, required]) => required && capabilities?.[name] !== true)
    .map(([name]) => name);

export const isProviderSynchronizationReady = (provider) =>
  Boolean(
    provider?.productionEnabled &&
    typeof provider.origin === 'string' &&
    provider.origin.startsWith('https://') &&
    getMissingWatchCapabilities(provider.capabilities).length === 0,
  );

export const validateWatchProviderAdapter = (adapter) => {
  if (!adapter || typeof adapter !== 'object')
    return { valid: false, reason: 'Adapter is missing.' };
  if (!isProviderSynchronizationReady(adapter)) {
    return {
      valid: false,
      reason:
        adapter.blocker ||
        `Missing capabilities: ${getMissingWatchCapabilities(adapter.capabilities).join(', ')}`,
    };
  }
  const missingMethods = REQUIRED_METHODS.filter(
    (method) => typeof adapter[method] !== 'function',
  );
  if (missingMethods.length)
    return {
      valid: false,
      reason: `Missing adapter methods: ${missingMethods.join(', ')}`,
    };
  return { valid: true, reason: null };
};

export const getWatchProviderAudit = () =>
  AUDITED_WATCH_PROVIDERS.map((provider) => ({
    ...provider,
    synchronizationReady: isProviderSynchronizationReady(provider),
    missingCapabilities: getMissingWatchCapabilities(provider.capabilities),
  }));

export { REQUIRED_METHODS };
