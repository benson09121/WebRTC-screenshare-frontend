// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Chat } from './Chat';

const mockedContext = vi.hoisted(() => ({ value: null }));

vi.mock('../context/useWebRTC', () => ({
  useWebRTC: () => mockedContext.value,
}));

const createContext = (overrides = {}) => ({
  chatMessages: [],
  connected: true,
  isChatOpen: true,
  isFullscreen: false,
  notificationSoundEnabled: true,
  sendMessage: vi.fn(() => true),
  setIsChatOpen: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
  unreadCount: 0,
  toggleMessageReaction: vi.fn(),
  externalWatchSession: null,
  ...overrides,
});

beforeEach(() => {
  window.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.IntersectionObserver = window.IntersectionObserver;
  window.matchMedia = vi.fn(() => ({ matches: true }));
  window.requestAnimationFrame = vi.fn((callback) => {
    callback();
    return 1;
  });
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('keeps an open chat visible while fullscreen controls are idle', () => {
  mockedContext.value = createContext({ isFullscreen: true });

  render(<Chat isIdle />);

  const panel = screen.getByRole('dialog', { name: 'room-chat' });
  expect(panel.getAttribute('aria-hidden')).toBe('false');
  expect(panel.className).toContain('translate-x-0');
  expect(panel.className).not.toContain('translate-x-full');
});

test('renders local and remote messages in the same flush-left timeline', () => {
  mockedContext.value = createContext({
    chatMessages: [
      {
        id: 'local:1:1',
        from: 'local',
        text: 'Local message',
        sentAt: 1_700_000_000_000,
        reactions: {},
      },
      {
        id: 'remote:1:1',
        from: 'remote',
        text: 'Remote message',
        sentAt: 1_700_000_001_000,
        reactions: {},
      },
    ],
  });

  render(<Chat isIdle={false} />);

  const localItem = screen.getByText('Local message').closest('li');
  const remoteItem = screen.getByText('Remote message').closest('li');
  expect(localItem.className).toBe(remoteItem.className);
  expect(localItem.className).toContain('items-start');
});

test('opens from the persistent launcher while room chrome is idle', () => {
  const setIsChatOpen = vi.fn();
  mockedContext.value = createContext({
    isChatOpen: false,
    setIsChatOpen,
  });

  render(<Chat />);

  const launcher = screen.getByRole('button', { name: 'Open chat' });
  expect(launcher.getAttribute('aria-hidden')).toBe('false');
  fireEvent.click(launcher);
  expect(setIsChatOpen).toHaveBeenCalledWith(true);
});

test('opens the full emoji picker above the chat panel', async () => {
  mockedContext.value = createContext();

  render(<Chat />);
  fireEvent.click(screen.getByRole('button', { name: 'Add emoji to message' }));

  expect(await screen.findByPlaceholderText('Search all emoji')).toBeTruthy();
});

test('gives the composer field flexible width beside compact media actions', () => {
  mockedContext.value = createContext();

  render(<Chat />);

  const composer = screen.getByLabelText('Message');
  expect(composer.className).toContain('flex-1');
  expect(composer.className).toContain('min-w-0');
  expect(
    screen.getByRole('button', { name: 'Send message' }).className,
  ).toContain('md:size-9');
});

test('sends a reply reference and clears the reply composer', () => {
  const sendMessage = vi.fn(() => true);
  mockedContext.value = createContext({
    sendMessage,
    chatMessages: [
      {
        id: 'remote:1:1',
        from: 'remote',
        text: 'Original message',
        sentAt: 1_700_000_001_000,
        replyToId: null,
        reactions: {},
      },
    ],
  });

  render(<Chat />);
  fireEvent.click(screen.getByRole('button', { name: 'Reply to message' }));
  expect(screen.getByText('Replying to Participant')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Message'), {
    target: { value: 'My reply' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

  expect(sendMessage).toHaveBeenCalledWith('My reply', 'remote:1:1');
  expect(screen.queryByText('Replying to Participant')).toBeNull();
});
