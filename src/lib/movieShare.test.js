import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMediaTime,
  getCaptureStream,
  getDirectMediaDisplayName,
  getMovieDisplayName,
  normalizeDirectMediaUrl,
} from './movieShare.js';

test('formats movie times without exposing invalid values', () => {
  assert.equal(formatMediaTime(Number.NaN), '0:00');
  assert.equal(formatMediaTime(65.9), '1:05');
  assert.equal(formatMediaTime(3661), '1:01:01');
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
  assert.throws(() => normalizeDirectMediaUrl('https://youtube.com/watch?v=123'), /video page/);
  assert.throws(() => normalizeDirectMediaUrl('not a url'), /valid http/);
});
