// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ConnectionHealth } from './ConnectionHealth';

const mockedContext = vi.hoisted(() => ({ value: null }));

vi.mock('../context/useWebRTC', () => ({
  useWebRTC: () => mockedContext.value,
}));

const stats = {
  quality: 'good',
  connectionPath: 'direct',
  protocol: 'udp',
  roundTripTimeMs: 8,
  packetLossPercent: 0,
  sendBitrateKbps: 4100,
  receiveBitrateKbps: 1700,
  availableOutgoingBitrateKbps: 7600,
  outboundVideo: { width: 640, height: 360, framesPerSecond: 7 },
  inboundVideo: { width: 960, height: 540, framesPerSecond: 14 },
  qualityLimitationReason: 'none',
};

afterEach(cleanup);

test.each([
  ['good', '3'],
  ['fair', '2'],
  ['poor', '1'],
])('maps %s connection quality to %s active bars', (quality, bars) => {
  mockedContext.value = {
    connected: true,
    connectionStats: { ...stats, quality },
    peerPresence: 'connected',
    wsStatus: 'open',
  };

  render(<ConnectionHealth open={false} onOpenChange={vi.fn()} />);

  const indicator = screen.getByRole('button', {
    name: /Open connection details/,
  });
  expect(indicator.dataset.connectionQuality).toBe(quality);
  expect(indicator.dataset.activeBars).toBe(bars);
});

test('renders detailed connection metrics from the dashboard popover', () => {
  mockedContext.value = {
    connected: true,
    connectionStats: stats,
    peerPresence: 'connected',
    wsStatus: 'open',
  };

  render(<ConnectionHealth open onOpenChange={vi.fn()} />);

  expect(
    screen.getByRole('region', { name: 'Connection details' }),
  ).toBeTruthy();
  expect(screen.getByText('Direct peer connection · UDP')).toBeTruthy();
  expect(screen.getByText('8 ms')).toBeTruthy();
});
