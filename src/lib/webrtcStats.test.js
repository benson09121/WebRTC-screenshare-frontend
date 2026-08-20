import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWebRTCStats } from './webrtcStats.js';

const makeReport = entries => new Map(entries.map(entry => [entry.id, entry]));

test('summarizes interval rates, packet loss, relay path, and video dimensions', () => {
  const previous = new Map([
    ['out-video', { timestamp: 1000, bytesSent: 1000000 }],
    ['in-video', {
      timestamp: 1000,
      bytesReceived: 500000,
      packetsReceived: 100,
      packetsLost: 0,
      framesDropped: 2,
    }],
  ]);

  const report = makeReport([
    { id: 'transport', type: 'transport', timestamp: 3000, selectedCandidatePairId: 'pair' },
    {
      id: 'pair',
      type: 'candidate-pair',
      timestamp: 3000,
      state: 'succeeded',
      nominated: true,
      localCandidateId: 'local',
      remoteCandidateId: 'remote',
      currentRoundTripTime: 0.25,
      availableOutgoingBitrate: 6000000,
    },
    { id: 'local', type: 'local-candidate', timestamp: 3000, candidateType: 'relay', protocol: 'udp' },
    { id: 'remote', type: 'remote-candidate', timestamp: 3000, candidateType: 'srflx', protocol: 'udp' },
    {
      id: 'out-video',
      type: 'outbound-rtp',
      timestamp: 3000,
      kind: 'video',
      bytesSent: 2000000,
      frameWidth: 1920,
      frameHeight: 1080,
      framesPerSecond: 60,
      targetBitrate: 5000000,
      qualityLimitationReason: 'bandwidth',
    },
    {
      id: 'in-video',
      type: 'inbound-rtp',
      timestamp: 3000,
      kind: 'video',
      bytesReceived: 1000000,
      packetsReceived: 190,
      packetsLost: 10,
      framesDropped: 5,
      frameWidth: 1280,
      frameHeight: 720,
      framesPerSecond: 30,
    },
  ]);

  const { stats } = summarizeWebRTCStats(report, previous);

  assert.equal(stats.sendBitrateKbps, 4000);
  assert.equal(stats.receiveBitrateKbps, 2000);
  assert.equal(stats.packetLossPercent, 10);
  assert.equal(stats.roundTripTimeMs, 250);
  assert.equal(stats.droppedFrames, 3);
  assert.equal(stats.connectionPath, 'relay');
  assert.equal(stats.protocol, 'udp');
  assert.equal(stats.qualityLimitationReason, 'bandwidth');
  assert.equal(stats.quality, 'poor');
  assert.deepEqual(stats.outboundVideo, {
    width: 1920,
    height: 1080,
    framesPerSecond: 60,
    targetBitrateKbps: 5000,
  });
});

test('reports CPU limitation as fair when transport metrics are otherwise healthy', () => {
  const report = makeReport([
    {
      id: 'pair',
      type: 'candidate-pair',
      timestamp: 2000,
      state: 'succeeded',
      nominated: true,
      currentRoundTripTime: 0.05,
    },
    {
      id: 'out-video',
      type: 'outbound-rtp',
      timestamp: 2000,
      kind: 'video',
      bytesSent: 1000,
      qualityLimitationReason: 'cpu',
    },
  ]);

  const { stats } = summarizeWebRTCStats(report);

  assert.equal(stats.quality, 'fair');
  assert.equal(stats.qualityLimitationReason, 'cpu');
  assert.equal(stats.roundTripTimeMs, 50);
});
