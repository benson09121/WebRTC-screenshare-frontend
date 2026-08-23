const WATCH_ID_PATTERN = /^[a-zA-Z0-9_-]{8,96}$/;
const PROVIDERS = new Set(['vidking-extension']);
const MEDIA_TYPES = new Set(['movie', 'tv']);
const COMMANDS = new Set(['play', 'pause', 'seek']);

const boundedText = (value, maximum) =>
  typeof value === 'string' ? value.trim().slice(0, maximum) : '';

const positiveInteger = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : null;

export const normalizeExternalWatchMedia = (value) => {
  if (
    !value ||
    !PROVIDERS.has(value.providerId) ||
    !MEDIA_TYPES.has(value.mediaType)
  )
    return null;
  const tmdbId = positiveInteger(value.tmdbId);
  if (!tmdbId) return null;
  const title = boundedText(value.title, 160);
  if (!title) return null;

  const media = {
    providerId: value.providerId,
    mediaType: value.mediaType,
    tmdbId,
    title,
    posterPath: boundedText(value.posterPath, 240) || null,
  };
  if (value.mediaType === 'tv') {
    media.season = positiveInteger(value.season);
    media.episode = positiveInteger(value.episode);
    if (!media.season || !media.episode) return null;
    media.episodeTitle = boundedText(value.episodeTitle, 160) || null;
  }
  return media;
};

export const createExternalWatchProposal = ({ clientId, sequence, media }) => {
  const normalizedMedia = normalizeExternalWatchMedia(media);
  const normalizedClientId = boundedText(clientId, 48).replace(
    /[^a-zA-Z0-9_-]/g,
    '',
  );
  if (
    !normalizedMedia ||
    normalizedClientId.length < 4 ||
    !Number.isSafeInteger(sequence) ||
    sequence < 0
  )
    return null;
  return {
    type: 'external-watch-proposal',
    proposalId: `${normalizedClientId}-${sequence}`.slice(0, 96),
    media: normalizedMedia,
  };
};

export const normalizeExternalWatchProposal = (value) => {
  if (
    value?.type !== 'external-watch-proposal' ||
    !WATCH_ID_PATTERN.test(value.proposalId || '')
  )
    return null;
  const media = normalizeExternalWatchMedia(value.media);
  return media
    ? { type: value.type, proposalId: value.proposalId, media }
    : null;
};

export const normalizeExternalWatchResponse = (value) =>
  value?.type === 'external-watch-response' &&
  WATCH_ID_PATTERN.test(value.proposalId || '') &&
  typeof value.accepted === 'boolean'
    ? {
        type: value.type,
        proposalId: value.proposalId,
        accepted: value.accepted,
      }
    : null;

export const normalizeExternalWatchEpisodeRequest = (value) => {
  if (
    value?.type !== 'external-watch-episode-request' ||
    !WATCH_ID_PATTERN.test(value.proposalId || '') ||
    !WATCH_ID_PATTERN.test(value.requestId || '')
  )
    return null;
  const media = normalizeExternalWatchMedia(value.media);
  return media?.mediaType === 'tv'
    ? {
        type: value.type,
        proposalId: value.proposalId,
        requestId: value.requestId,
        media,
      }
    : null;
};

export const normalizeExternalWatchMediaState = (value) => {
  if (
    value?.type !== 'external-watch-media-state' ||
    !WATCH_ID_PATTERN.test(value.proposalId || '') ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  )
    return null;
  const media = normalizeExternalWatchMedia(value.media);
  return media?.mediaType === 'tv'
    ? {
        type: value.type,
        proposalId: value.proposalId,
        revision: value.revision,
        media,
      }
    : null;
};

export const normalizeExternalWatchCommand = (value) => {
  if (
    value?.type !== 'external-watch-command' ||
    !WATCH_ID_PATTERN.test(value.proposalId || '') ||
    !WATCH_ID_PATTERN.test(value.commandId || '') ||
    !COMMANDS.has(value.action) ||
    !Number.isSafeInteger(value.mediaRevision) ||
    value.mediaRevision < 0
  )
    return null;
  const position = Number.isFinite(value.position)
    ? Math.max(0, Math.min(value.position, 86_400))
    : null;
  if (value.action === 'seek' && position === null) return null;
  return {
    type: value.type,
    proposalId: value.proposalId,
    commandId: value.commandId,
    mediaRevision: value.mediaRevision,
    action: value.action,
    position,
    resumeAfterSeek: value.action === 'seek' && value.resumeAfterSeek === true,
  };
};

export const normalizeExternalWatchState = (value) => {
  if (
    value?.type !== 'external-watch-state' ||
    !WATCH_ID_PATTERN.test(value.proposalId || '') ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Number.isSafeInteger(value.mediaRevision) ||
    value.mediaRevision < 0 ||
    typeof value.paused !== 'boolean' ||
    !Number.isFinite(value.position)
  )
    return null;
  return {
    type: value.type,
    proposalId: value.proposalId,
    revision: value.revision,
    mediaRevision: value.mediaRevision,
    paused: value.paused,
    position: Math.max(0, Math.min(value.position, 86_400)),
    duration: Number.isFinite(value.duration)
      ? Math.max(0, Math.min(value.duration, 86_400))
      : null,
  };
};

export const normalizeExternalWatchRecovery = (value) => {
  if (
    value?.type !== 'external-watch-recovery' ||
    !WATCH_ID_PATTERN.test(value.proposalId || '') ||
    !Number.isSafeInteger(value.mediaRevision) ||
    value.mediaRevision < 0 ||
    typeof value.isAuthority !== 'boolean'
  )
    return null;

  const media = normalizeExternalWatchMedia(value.media);
  if (!media) return null;

  let playback = null;
  if (value.playback !== null && value.playback !== undefined) {
    playback = normalizeExternalWatchState({
      ...value.playback,
      type: 'external-watch-state',
      proposalId: value.proposalId,
      mediaRevision: value.mediaRevision,
    });
    if (!playback) return null;
  }

  return {
    type: value.type,
    proposalId: value.proposalId,
    media,
    mediaRevision: value.mediaRevision,
    isAuthority: value.isAuthority,
    playback,
  };
};

const RECOVERABLE_PEER_RESETS = new Set([
  'peer-left-with-active-session',
  'peer-joined-with-active-session',
  'peer-reconnected',
  'renegotiation-offer',
]);

export const shouldPreserveExternalWatchSession = (reason, session) =>
  Boolean(session?.proposalId && RECOVERABLE_PEER_RESETS.has(reason));

export const buildVidkingEmbedUrl = (media) => {
  const normalized = normalizeExternalWatchMedia(media);
  if (!normalized) return null;
  const path =
    normalized.mediaType === 'movie'
      ? `/embed/movie/${normalized.tmdbId}`
      : `/embed/tv/${normalized.tmdbId}/${normalized.season}/${normalized.episode}`;
  const url = new URL(path, 'https://www.vidking.net');
  url.searchParams.set('autoPlay', 'false');
  url.searchParams.set('color', '6ee7d2');
  if (normalized.mediaType === 'tv') {
    url.searchParams.set('episodeSelector', 'false');
    url.searchParams.set('nextEpisode', 'false');
  }
  return url.toString();
};

export const isNewerExternalWatchState = (current, candidate) =>
  Boolean(candidate && (!current || candidate.revision > current.revision));
