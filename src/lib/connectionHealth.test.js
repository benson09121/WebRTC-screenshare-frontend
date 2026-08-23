import { test } from 'vitest';
import assert from 'node:assert/strict';
import { getConnectionHealthPresentation } from './connectionHealth.js';

test('keeps healthy transport status separate from upload encoder adaptation', () => {
  const presentation = getConnectionHealthPresentation({
    connected: true,
    wsStatus: 'connected',
    peerPresence: 'connected',
    stats: {
      quality: 'good',
      qualityLimitationReason: 'bandwidth',
      connectionPath: 'direct',
      protocol: 'udp',
      roundTripTimeMs: 8,
      packetLossPercent: 0,
      sendBitrateKbps: 4100,
      receiveBitrateKbps: 1700,
      availableOutgoingBitrateKbps: 7600,
      outboundVideo: { width: 640, height: 360, framesPerSecond: 7 },
      inboundVideo: { width: 960, height: 540, framesPerSecond: 14 },
    },
  });

  assert.equal(presentation.quality, 'good');
  assert.equal(presentation.statusLabel, 'Connection good');
  assert.equal(presentation.action.title, 'Video adapting to upload');
  assert.match(
    presentation.action.description,
    /transport is otherwise healthy/,
  );
});

test('shows signaling reconnect separately when media is not connected', () => {
  const presentation = getConnectionHealthPresentation({
    connected: false,
    wsStatus: 'reconnecting',
    peerPresence: 'reconnecting',
    stats: { quality: 'unknown', qualityLimitationReason: 'none' },
  });

  assert.equal(presentation.statusLabel, 'Signaling reconnecting');
});
