// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';

const mockedContext = vi.hoisted(() => ({ value: null }));

vi.mock('../context/useWebRTC', () => ({
  useWebRTC: () => mockedContext.value,
}));

const createContext = (overrides = {}) => ({
  localStream: null,
  remoteStream: null,
  remoteScreenStream: null,
  localScreenStream: null,
  isScreenSharing: false,
  isCameraOff: true,
  connected: true,
  remoteMirrored: true,
  sendControlMessage: vi.fn(),
  isChatOpen: false,
  isFullscreen: false,
  setIsFullscreen: vi.fn(),
  isPresentationMode: false,
  setIsPresentationMode: vi.fn(),
  remoteCameraOff: true,
  remoteScreenSharing: false,
  localShareSource: null,
  remoteShareSource: null,
  requestMovieControl: vi.fn(),
  participantVolume: 100,
  screenVolume: 100,
  setScreenVolume: vi.fn(),
  movieVolume: 100,
  setMovieVolume: vi.fn(),
  peerPresence: 'connected',
  externalWatchSession: { proposalId: 'watch-session' },
  selectedStageView: 'external-watch',
  setSelectedStageView: vi.fn(),
  ...overrides,
});

afterEach(cleanup);

test('separates both participants from an external shared-content stage', () => {
  mockedContext.value = createContext();

  render(<VideoPlayer isIdle={false} />);

  expect(
    screen.getByRole('region', { name: 'Call participants' }),
  ).toBeTruthy();
  const stage = screen
    .getByRole('region', { name: 'Call participants' })
    .closest('main');
  expect(stage.className).toContain('shared-stage-with-participants');
  const viewport = stage.querySelector('.shared-content-viewport');
  expect(viewport).toBeTruthy();
  expect(viewport.dataset.stageLayout).toBe('inset');
  expect(
    screen.getByRole('button', { name: 'Focus Participant' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Focus You' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Focus You' }));
  expect(mockedContext.value.setSelectedStageView).toHaveBeenCalledWith(
    'local-camera',
  );
});

test('uses presentation mode as the explicit shared-content-only layout', () => {
  mockedContext.value = createContext({ isPresentationMode: true });

  render(<VideoPlayer isIdle={false} />);

  expect(
    screen.queryByRole('region', { name: 'Call participants' }),
  ).toBeNull();
});

test('keeps shared-screen actions inside one options menu', () => {
  mockedContext.value = createContext({
    externalWatchSession: null,
    remoteScreenSharing: true,
    remoteScreenStream: {
      getVideoTracks: () => [{ readyState: 'live' }],
    },
    remoteShareSource: { kind: 'screen' },
    selectedStageView: 'remote-screen',
  });

  render(<VideoPlayer isIdle={false} />);

  expect(
    screen.getByRole('button', { name: 'Their screen options' }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Hide Their screen' }),
  ).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Their screen options' }));
  fireEvent.change(
    screen.getByRole('slider', { name: 'Shared-screen volume' }),
    {
      target: { value: '65' },
    },
  );
  expect(mockedContext.value.setScreenVolume).toHaveBeenCalledWith('65');
});

test('keeps the view dock visible while fullscreen controls are idle', () => {
  mockedContext.value = createContext({ isFullscreen: true });

  render(<VideoPlayer isIdle />);

  const dock = screen.getByRole('region', { name: 'Call participants' });
  expect(dock.getAttribute('aria-hidden')).toBeNull();
  expect(
    screen.getByRole('button', {
      name: 'Hide participant dock and focus the selected view',
    }),
  ).toBeTruthy();
});
