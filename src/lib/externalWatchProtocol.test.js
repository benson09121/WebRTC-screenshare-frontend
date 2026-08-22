import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVidkingEmbedUrl,
  createExternalWatchProposal,
  isNewerExternalWatchState,
  normalizeExternalWatchCommand,
  normalizeExternalWatchEpisodeRequest,
  normalizeExternalWatchMedia,
  normalizeExternalWatchMediaState,
  normalizeExternalWatchState,
} from './externalWatchProtocol.js';

test('creates a bounded Vidking movie proposal and embed URL', () => {
  const media = normalizeExternalWatchMedia({ providerId: 'vidking-extension', mediaType: 'movie', tmdbId: 27205, title: 'Inception' });
  const proposal = createExternalWatchProposal({ clientId: 'client_1234', sequence: 4, media });
  assert.equal(proposal.proposalId, 'client_1234-4');
  assert.equal(buildVidkingEmbedUrl(media), 'https://www.vidking.net/embed/movie/27205?autoPlay=false&color=6ee7d2');
});

test('requires an exact TV episode and rejects unsupported providers', () => {
  assert.equal(normalizeExternalWatchMedia({ providerId: 'vidking-extension', mediaType: 'tv', tmdbId: 10, title: 'Show' }), null);
  assert.equal(normalizeExternalWatchMedia({ providerId: 'unknown', mediaType: 'movie', tmdbId: 10, title: 'Movie' }), null);

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
  assert.equal(buildVidkingEmbedUrl(episode), 'https://www.vidking.net/embed/tv/1399/2/3?autoPlay=false&color=6ee7d2&episodeSelector=false&nextEpisode=false');
});

test('validates commands and accepts only newer authoritative state', () => {
  const command = normalizeExternalWatchCommand({
    type: 'external-watch-command', proposalId: 'proposal_123', commandId: 'command_123', mediaRevision: 0, action: 'seek', position: 42, resumeAfterSeek: true,
  });
  assert.equal(command.position, 42);
  assert.equal(command.resumeAfterSeek, true);
  const state = normalizeExternalWatchState({
    type: 'external-watch-state', proposalId: 'proposal_123', revision: 3, mediaRevision: 0, paused: false, position: 42, duration: 100,
  });
  assert.equal(isNewerExternalWatchState({ revision: 2 }, state), true);
  assert.equal(isNewerExternalWatchState({ revision: 3 }, state), false);
});

test('validates synchronized episode requests and authoritative media state', () => {
  const media = {
    providerId: 'vidking-extension', mediaType: 'tv', tmdbId: 1399, title: 'Game of Thrones', season: 3, episode: 4, episodeTitle: 'And Now His Watch Is Ended',
  };
  const request = normalizeExternalWatchEpisodeRequest({
    type: 'external-watch-episode-request', proposalId: 'proposal_123', requestId: 'request_123', media,
  });
  assert.equal(request.media.episode, 4);
  const state = normalizeExternalWatchMediaState({
    type: 'external-watch-media-state', proposalId: 'proposal_123', revision: 2, media,
  });
  assert.equal(state.revision, 2);
  assert.equal(state.media.episodeTitle, 'And Now His Watch Is Ended');
  assert.equal(normalizeExternalWatchMediaState({ ...state, revision: 0 }), null);
});
