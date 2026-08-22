import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMediaTime,
  getCaptureStream,
  getDirectMediaDisplayName,
  getActiveSubtitleText,
  getNativeAudioTrackOptions,
  getActiveNativeSubtitleText,
  getNativeSubtitleTrackOptions,
  getMovieDisplayName,
  getMovieVideoGeometry,
  isExpectedPlaybackInterruption,
  normalizeDirectMediaUrl,
  parseSrt,
  selectNativeAudioTrack,
  selectNativeSubtitleTrack,
  sanitizeSharedDirectMediaUrl,
  waitForCapturedTrack,
  waitForMovieFrame,
} from './movieShare.js';

test('treats a superseded play request as normal synchronization cancellation', () => {
  assert.equal(isExpectedPlaybackInterruption({ name: 'AbortError' }), true);
  assert.equal(isExpectedPlaybackInterruption(new Error('The play() request was interrupted by a call to pause().')), true);
  assert.equal(isExpectedPlaybackInterruption(new Error('The decoder failed.')), false);
});

test('formats movie times without exposing invalid values', () => {
  assert.equal(formatMediaTime(Number.NaN), '0:00');
  assert.equal(formatMediaTime(65.9), '1:05');
  assert.equal(formatMediaTime(3661), '1:01:01');
});

test('preserves the movie natural dimensions and display aspect ratio', () => {
  assert.deepEqual(getMovieVideoGeometry({ videoWidth: 1920, videoHeight: 800 }), {
    width: 1920,
    height: 800,
    aspectRatio: 2.4,
  });
  assert.deepEqual(getMovieVideoGeometry({ videoWidth: 0, videoHeight: 0 }), {
    width: null,
    height: null,
    aspectRatio: null,
  });
});

test('normalizes and bounds movie display names', () => {
  assert.equal(getMovieDisplayName('  movie.mp4  '), 'movie.mp4');
  assert.equal(getMovieDisplayName(''), 'Untitled movie');
  assert.ok(getMovieDisplayName('a'.repeat(150)).length <= 96);
});

test('uses the standard captureStream implementation when available', () => {
  const expected = { id: 'stream' };
  assert.equal(getCaptureStream({ captureStream: () => expected }), expected);
});

test('falls back to the Firefox-prefixed capture implementation', () => {
  const expected = { id: 'firefox-stream' };
  assert.equal(getCaptureStream({ mozCaptureStream: () => expected }), expected);
  assert.equal(getCaptureStream({}), null);
});

test('waits for a captured video track that is added asynchronously', async () => {
  const stream = new EventTarget();
  const tracks = [];
  stream.getTracks = () => tracks;
  const track = { kind: 'video', readyState: 'live' };

  const waiting = waitForCapturedTrack(stream, 'video', { timeoutMs: 250 });
  tracks.push(track);
  const event = new Event('addtrack');
  Object.defineProperty(event, 'track', { value: track });
  stream.dispatchEvent(event);

  assert.equal(await waiting, track);
});

test('waits for the first decoded movie frame', async () => {
  const mediaElement = new EventTarget();
  mediaElement.readyState = 1;
  mediaElement.videoWidth = 0;
  mediaElement.videoHeight = 0;

  const waiting = waitForMovieFrame(mediaElement, { timeoutMs: 250 });
  mediaElement.readyState = 2;
  mediaElement.videoWidth = 1920;
  mediaElement.videoHeight = 1080;
  mediaElement.dispatchEvent(new Event('loadeddata'));

  await waiting;
});

test('normalizes direct http media URLs without exposing query data as a title', () => {
  assert.equal(
    normalizeDirectMediaUrl(' https://media.example/movie.mp4?token=secret '),
    'https://media.example/movie.mp4?token=secret',
  );
  assert.equal(
    getDirectMediaDisplayName('https://media.example/movies/My%20Movie.mp4?token=secret'),
    'My Movie.mp4',
  );
});

test('rejects unsupported protocols and known video-page URLs', () => {
  assert.throws(() => normalizeDirectMediaUrl('file:///tmp/movie.mp4'), /valid http/);
  assert.throws(
    () => normalizeDirectMediaUrl('https://viewer:secret@example.com/movie.mp4'),
    /username or password/,
  );
  assert.throws(() => normalizeDirectMediaUrl('https://youtube.com/watch?v=123'), /video page/);
  assert.throws(() => normalizeDirectMediaUrl('not a url'), /valid http/);
});

test('sanitizes a direct URL received from a peer', () => {
  assert.equal(
    sanitizeSharedDirectMediaUrl('https://media.example/movie.mp4?token=abc'),
    'https://media.example/movie.mp4?token=abc',
  );
  assert.equal(sanitizeSharedDirectMediaUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeSharedDirectMediaUrl('https://youtube.com/watch?v=1'), null);
  assert.equal(sanitizeSharedDirectMediaUrl('x'.repeat(4097)), null);
});

test('parses SRT cues and finds the active subtitle with binary search', () => {
  const cues = parseSrt(`1
00:00:01,250 --> 00:00:03,000
First line

2
00:01:04.500 --> 00:01:06.000
Second\nline`);

  assert.deepEqual(cues, [
    { startTime: 1.25, endTime: 3, text: 'First line' },
    { startTime: 64.5, endTime: 66, text: 'Second\nline' },
  ]);
  assert.equal(getActiveSubtitleText(cues, 2), 'First line');
  assert.equal(getActiveSubtitleText(cues, 10), '');
});

test('reads and changes native audio tracks when the browser exposes them', () => {
  const mediaElement = {
    audioTracks: [
      { label: 'English', language: 'en', enabled: true },
      { label: '', language: 'ja', enabled: false },
    ],
  };

  assert.deepEqual(getNativeAudioTrackOptions(mediaElement), [
    { index: 0, label: 'English', language: 'en', enabled: true },
    { index: 1, label: 'ja', language: 'ja', enabled: false },
  ]);
  assert.equal(selectNativeAudioTrack(mediaElement, 1), true);
  assert.equal(mediaElement.audioTracks[0].enabled, false);
  assert.equal(mediaElement.audioTracks[1].enabled, true);
});

test('reads, selects, and renders native subtitle tracks when exposed', () => {
  const mediaElement = {
    textTracks: [
      { kind: 'metadata', mode: 'hidden', activeCues: [] },
      { kind: 'subtitles', label: 'English', language: 'en', mode: 'disabled', activeCues: [] },
      { kind: 'subtitles', label: '', language: 'ja', mode: 'showing', activeCues: [{ text: 'こんにちは' }] },
    ],
  };

  assert.deepEqual(getNativeSubtitleTrackOptions(mediaElement), [
    { index: 1, label: 'English', language: 'en', active: false },
    { index: 2, label: 'ja', language: 'ja', active: true },
  ]);
  assert.equal(selectNativeSubtitleTrack(mediaElement, 2), true);
  assert.equal(mediaElement.textTracks[2].mode, 'hidden');
  assert.equal(getActiveNativeSubtitleText(mediaElement, 2), 'こんにちは');
});
