import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceAutoQuality,
  createAutoQualityState,
  getAutoQualityPreset,
  summarizeScreenSenderStats,
} from './screenShareQuality.js';

test('downgrades only after sustained encoder pressure', () => {
  let state = createAutoQualityState(1);
  state = advanceAutoQuality(state, { qualityLimitationReason: 'cpu' }, 1000);
  state = advanceAutoQuality(state, { qualityLimitationReason: 'cpu' }, 3000);
  assert.equal(state.index, 1);

  state = advanceAutoQuality(state, { qualityLimitationReason: 'cpu' }, 5000);
  assert.equal(state.index, 2);
});

test('uses constrained outgoing bitrate to react faster to bandwidth pressure', () => {
  let state = createAutoQualityState(1);
  state = advanceAutoQuality(state, {
    qualityLimitationReason: 'bandwidth',
    sendBitrateKbps: 1200,
    targetBitrateKbps: 3000,
  }, 1000);
  assert.equal(state.index, 1);

  state = advanceAutoQuality(state, {
    qualityLimitationReason: 'bandwidth',
    sendBitrateKbps: 1200,
    targetBitrateKbps: 3000,
  }, 3000);
  assert.equal(state.index, 2);
});

test('recovers gradually after eight healthy samples and honors cooldown', () => {
  let state = { ...createAutoQualityState(2), lastChangedAt: 5000 };
  for (let index = 0; index < 8; index += 1) {
    state = advanceAutoQuality(state, { qualityLimitationReason: 'none' }, 7000 + index * 1000);
  }
  assert.equal(state.index, 2);

  state = advanceAutoQuality(state, { qualityLimitationReason: 'none' }, 15000);
  assert.equal(state.index, 1);
});

test('keeps profile selection within the available range', () => {
  assert.equal(getAutoQualityPreset('motion', -5).label, '1080p · 60fps');
  assert.equal(getAutoQualityPreset('detail', 99).label, '480p · 15fps');
});

test('summarizes the active screen sender dimensions, fps, bitrate, and limitation', () => {
  const previous = new Map([
    ['screen', { timestamp: 1000, bytesSent: 100000 }],
  ]);
  const report = new Map([
    ['screen', {
      id: 'screen',
      type: 'outbound-rtp',
      timestamp: 3000,
      kind: 'video',
      bytesSent: 1100000,
      frameWidth: 1280,
      frameHeight: 720,
      framesPerSecond: 55,
      targetBitrate: 6000000,
      qualityLimitationReason: 'bandwidth',
    }],
  ]);

  const { stats } = summarizeScreenSenderStats(report, previous);
  assert.deepEqual(stats, {
    width: 1280,
    height: 720,
    framesPerSecond: 55,
    sendBitrateKbps: 4000,
    targetBitrateKbps: 6000,
    qualityLimitationReason: 'bandwidth',
  });
});
