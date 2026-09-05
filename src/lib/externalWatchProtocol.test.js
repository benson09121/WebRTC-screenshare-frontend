import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  buildExternalWatchEmbedUrl,
  buildVidkingEmbedUrl,
  createExternalWatchProposal,
  isNewerExternalWatchState,
  normalizeExternalWatchCommand,
  normalizeExternalWatchEpisodeRequest,
  normalizeExternalWatchMedia,
  normalizeExternalWatchMediaState,
  normalizeExternalWatchRecovery,
  normalizeExternalWatchState,
  shouldPreserveExternalWatchSession,
} from './externalWatchProtocol.js';

test('anime providers preserve AniList identity, exact episode and language', () => {
  for (const [providerId, origin, route] of [
    ['anixo-extension', 'https://anixo.buzz', '/embed/ani'],
    ['supaplay-extension', 'https://supaplay.fun', '/stream/ani'],
  ]) {
    const input = { providerId, mediaType: 'anime', anilistId: 154587, title: 'Frieren', episode: 2, audioLanguage: 'sub' };
    const media = normalizeExternalWatchMedia(input);
    assert.equal(media.anilistId, 154587);
    assert.equal(media.tmdbId, undefined);
    assert.equal(buildExternalWatchEmbedUrl(media), `${origin}${route}/154587/2/sub`);
    assert.equal(normalizeExternalWatchMedia({ ...input, audioLanguage: 'invalid' }), null);
    assert.equal(normalizeExternalWatchMedia({ ...input, episode: 0 }), null);
    assert.equal(normalizeExternalWatchMedia({ ...input, providerId: 'vidking-extension' }), null);
    assert.equal(normalizeExternalWatchMedia({ ...input, mediaType: 'movie', tmdbId: 154587 }), null);
  }
});

test('creates a bounded Vidking movie proposal and embed URL', () => {
  const media = normalizeExternalWatchMedia({
    providerId: 'vidking-extension',
    mediaType: 'movie',
    tmdbId: 27205,
    title: 'Inception',
  });
  const proposal = createExternalWatchProposal({
    clientId: 'client_1234',
    sequence: 4,
    media,
  });
  assert.equal(proposal.proposalId, 'client_1234-4');
  assert.equal(
    buildVidkingEmbedUrl(media),
    'https://www.vidking.net/embed/movie/27205?autoPlay=false&color=6ee7d2',
  );
});

test('requires an exact TV episode and rejects unsupported providers', () => {
  assert.equal(
    normalizeExternalWatchMedia({
      providerId: 'vidking-extension',
      mediaType: 'tv',
      tmdbId: 10,
      title: 'Show',
    }),
    null,
  );
  assert.equal(
    normalizeExternalWatchMedia({
      providerId: 'unknown',
      mediaType: 'movie',
      tmdbId: 10,
      title: 'Movie',
    }),
    null,
  );

  const episode = normalizeExternalWatchMedia({
    providerId: 'vidking-extension',
    mediaType: 'tv',
    tmdbId: 1399,
    title: 'Game of Thrones',
    season: 2,
    episode: 3,
    episodeTitle: 'What Is Dead May Never Die',
  });
  assert.deepEqual(episode, {
    providerId: 'vidking-extension',
    mediaType: 'tv',
    tmdbId: 1399,
    title: 'Game of Thrones',
    posterPath: null,
    season: 2,
    episode: 3,
    episodeTitle: 'What Is Dead May Never Die',
  });
  assert.equal(
    buildVidkingEmbedUrl(episode),
    'https://www.vidking.net/embed/tv/1399/2/3?autoPlay=false&color=6ee7d2&episodeSelector=false&nextEpisode=false',
  );
});

test('accepts every supported extension provider and builds its embed URL', () => {
  const expectedOrigins = {
    'vidking-extension': 'https://www.vidking.net/',
    'zoryva-extension': 'https://zoryva.me/',
    '2embed-extension': 'https://www.2embed.cc/',
    'vidsrc-io-extension': 'https://vidsrc.io/',
  };

  for (const [providerId, origin] of Object.entries(expectedOrigins)) {
    const media = normalizeExternalWatchMedia({
      providerId,
      mediaType: 'movie',
      tmdbId: 27205,
      title: 'Inception',
    });
    assert.equal(media.providerId, providerId);
    assert.equal(buildExternalWatchEmbedUrl(media).startsWith(origin), true);
  }
});

test('validates commands and accepts only newer authoritative state', () => {
  const command = normalizeExternalWatchCommand({
    type: 'external-watch-command',
    proposalId: 'proposal_123',
    commandId: 'command_123',
    mediaRevision: 0,
    action: 'seek',
    position: 42,
    resumeAfterSeek: true,
  });
  assert.equal(command.position, 42);
  assert.equal(command.resumeAfterSeek, true);
  const state = normalizeExternalWatchState({
    type: 'external-watch-state',
    proposalId: 'proposal_123',
    revision: 3,
    mediaRevision: 0,
    paused: false,
    position: 42,
    duration: 100,
  });
  assert.equal(isNewerExternalWatchState({ revision: 2 }, state), true);
  assert.equal(isNewerExternalWatchState({ revision: 3 }, state), false);
});

test('validates synchronized episode requests and authoritative media state', () => {
  const media = {
    providerId: 'vidking-extension',
    mediaType: 'tv',
    tmdbId: 1399,
    title: 'Game of Thrones',
    season: 3,
    episode: 4,
    episodeTitle: 'And Now His Watch Is Ended',
  };
  const request = normalizeExternalWatchEpisodeRequest({
    type: 'external-watch-episode-request',
    proposalId: 'proposal_123',
    requestId: 'request_123',
    media,
  });
  assert.equal(request.media.episode, 4);
  const state = normalizeExternalWatchMediaState({
    type: 'external-watch-media-state',
    proposalId: 'proposal_123',
    revision: 2,
    media,
  });
  assert.equal(state.revision, 2);
  assert.equal(state.media.episodeTitle, 'And Now His Watch Is Ended');
  assert.equal(
    normalizeExternalWatchMediaState({ ...state, revision: 0 }),
    null,
  );
});

test('preserves an accepted watch session only for recoverable peer transport resets', () => {
  const session = { proposalId: 'proposal_123' };
  assert.equal(
    shouldPreserveExternalWatchSession('peer-reconnected', session),
    true,
  );
  assert.equal(
    shouldPreserveExternalWatchSession('renegotiation-offer', session),
    true,
  );
  assert.equal(
    shouldPreserveExternalWatchSession('automatic-recovery', session),
    true,
  );
  assert.equal(
    shouldPreserveExternalWatchSession(
      'peer-joined-with-active-session',
      session,
    ),
    true,
  );
  assert.equal(
    shouldPreserveExternalWatchSession(
      'peer-left-with-active-session',
      session,
    ),
    true,
  );
  assert.equal(
    shouldPreserveExternalWatchSession('room-error', session),
    false,
  );
  assert.equal(
    shouldPreserveExternalWatchSession('peer-reconnected', null),
    false,
  );
});

test('validates bounded watch recovery snapshots for a replacement data channel', () => {
  const recovery = normalizeExternalWatchRecovery({
    type: 'external-watch-recovery',
    proposalId: 'proposal_123',
    mediaRevision: 0,
    isAuthority: true,
    media: {
      providerId: 'vidking-extension',
      mediaType: 'movie',
      tmdbId: 27205,
      title: 'Inception',
    },
    playback: {
      revision: 7,
      paused: false,
      position: 1540.5,
      duration: 8880,
    },
  });

  assert.equal(recovery.playback.position, 1540.5);
  assert.equal(recovery.playback.proposalId, 'proposal_123');
  assert.equal(recovery.isAuthority, true);
  assert.equal(
    normalizeExternalWatchRecovery({ ...recovery, mediaRevision: -1 }),
    null,
  );
});
