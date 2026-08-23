import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  ChevronDown,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';
import { useWebRTC } from '../context/useWebRTC';
import { getChatReactionSummary } from '../lib/chatProtocol';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { EmojiPicker } from './EmojiPicker';

const timeFormatter = new Intl.DateTimeFormat([], {
  hour: 'numeric',
  minute: '2-digit',
});

const QUICK_REACTIONS = ['👍', '❤️', '😂'];

const MessageReactions = ({ connected, message, onToggle }) => {
  const reactions = getChatReactionSummary(message);
  const isLocal = message.from === 'local';

  return (
    <div
      className={`mt-1 flex min-h-7 flex-wrap items-center gap-1 ${isLocal ? 'justify-end' : 'justify-start'}`}
      aria-label="Message reactions"
    >
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => onToggle(message.id, reaction.emoji)}
          disabled={!connected}
          className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-50 ${reaction.reactedByLocal ? 'border-teal-300/45 bg-teal-300/15 text-teal-100' : 'border-white/10 bg-white/[0.05] text-zinc-300 hover:bg-white/[0.09]'}`}
          aria-label={`${reaction.reactedByLocal ? 'Remove' : 'Add'} ${reaction.emoji} reaction. ${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}`}
          aria-pressed={reaction.reactedByLocal}
        >
          <span aria-hidden="true">{reaction.emoji}</span>
          <span>{reaction.count}</span>
        </button>
      ))}
      <div className="flex items-center rounded-lg border border-white/[0.07] bg-[#111719]/95 p-0.5 opacity-100 shadow-sm transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        {QUICK_REACTIONS.map((emoji) => (
          <Button
            key={emoji}
            variant="ghost"
            size="icon"
            className="size-7 rounded-lg text-sm"
            onClick={() => onToggle(message.id, emoji)}
            disabled={!connected}
            aria-label={`React with ${emoji}`}
          >
            <span aria-hidden="true">{emoji}</span>
          </Button>
        ))}
        <EmojiPicker
          compact
          disabled={!connected}
          label="More reactions"
          align={isLocal ? 'end' : 'start'}
          onSelect={(emoji) => onToggle(message.id, emoji)}
        />
      </div>
    </div>
  );
};

export const Chat = ({ isIdle }) => {
  const {
    chatMessages,
    connected,
    isChatOpen,
    isFullscreen,
    isPresentationMode,
    notificationSoundEnabled,
    sendMessage,
    setIsChatOpen,
    setNotificationSoundEnabled,
    unreadCount,
    toggleMessageReaction,
    externalWatchSession,
  } = useWebRTC();

  const [text, setText] = useState('');
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const messagesRef = useRef(null);
  const composerRef = useRef(null);
  const launcherRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const previousMessageCountRef = useRef(chatMessages.length);
  const wasChatOpenRef = useRef(false);
  const notificationTimerRef = useRef(null);

  const scrollToLatest = useCallback((behavior = 'smooth') => {
    const messageList = messagesRef.current;
    if (!messageList) return;
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: reduceMotion ? 'auto' : behavior,
    });
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  useEffect(() => {
    const hadNewMessage = chatMessages.length > previousMessageCountRef.current;
    const latestMessage = chatMessages.at(-1);
    previousMessageCountRef.current = chatMessages.length;

    if (!hadNewMessage || !latestMessage) return;

    if (latestMessage.from === 'remote') {
      setAnnouncement(
        `New message from the participant. ${chatMessages.length} messages in chat.`,
      );
    }

    if (!isChatOpen && latestMessage.from === 'remote') {
      setShowNotification(true);
      window.clearTimeout(notificationTimerRef.current);
      notificationTimerRef.current = window.setTimeout(() => {
        setShowNotification(false);
      }, 4500);
      return;
    }

    if (isNearBottomRef.current || latestMessage.from === 'local') {
      window.requestAnimationFrame(() => scrollToLatest('smooth'));
    } else {
      setShowJumpToLatest(true);
    }
  }, [chatMessages, isChatOpen, scrollToLatest]);

  useEffect(() => {
    if (isChatOpen) {
      setShowNotification(false);
      window.clearTimeout(notificationTimerRef.current);
      window.requestAnimationFrame(() => {
        scrollToLatest('auto');
        if (window.matchMedia('(min-width: 768px)').matches)
          composerRef.current?.focus();
      });
    } else if (wasChatOpenRef.current) {
      window.requestAnimationFrame(() => launcherRef.current?.focus());
    }
    wasChatOpenRef.current = isChatOpen;
  }, [isChatOpen, scrollToLatest]);

  useEffect(() => {
    if (!isChatOpen) return;
    const handleKeyDown = (event) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !event.target?.closest?.('[data-chat-emoji-picker="true"]')
      )
        setIsChatOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChatOpen, setIsChatOpen]);

  useEffect(() => () => window.clearTimeout(notificationTimerRef.current), []);

  const handleSend = (event) => {
    event?.preventDefault();
    const message = text.trim();
    if (!message) return;
    if (sendMessage(message)) setText('');
  };

  const handleComposerKeyDown = (event) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      handleSend(event);
    }
  };

  const handleComposerEmoji = (emoji) => {
    const composer = composerRef.current;
    const selectionStart = composer?.selectionStart ?? text.length;
    const selectionEnd = composer?.selectionEnd ?? text.length;
    const nextText =
      `${text.slice(0, selectionStart)}${emoji}${text.slice(selectionEnd)}`.slice(
        0,
        2000,
      );
    const nextCaret = Math.min(selectionStart + emoji.length, nextText.length);
    setText(nextText);
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleMessageScroll = (event) => {
    const messageList = event.currentTarget;
    const nearBottom =
      messageList.scrollHeight -
        messageList.scrollTop -
        messageList.clientHeight <
      72;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) setShowJumpToLatest(false);
  };

  const usesFocusedStage = isFullscreen || isPresentationMode;
  const usesExternalPlayer = Boolean(externalWatchSession);
  const panelPlacement = usesFocusedStage
    ? 'inset-x-3 bottom-3 h-[min(58dvh,34rem)] md:inset-y-3 md:left-auto md:right-3 md:h-auto md:w-[min(22rem,32vw)]'
    : 'inset-x-3 bottom-20 h-[min(66dvh,32rem)] sm:left-auto sm:right-5 sm:w-[22rem]';
  const launcherPlacement = usesExternalPlayer
    ? 'right-3 top-1/2 -translate-y-1/2 sm:right-5'
    : 'bottom-20 right-3 sm:bottom-5 sm:right-5';
  const notificationPlacement = usesExternalPlayer
    ? 'right-3 top-[calc(50%+3.25rem)] sm:right-5'
    : 'bottom-[8.5rem] right-3 sm:bottom-[4.75rem] sm:right-5';

  const fullscreenChatHidden = isFullscreen && isIdle;
  const launcherHidden =
    isChatOpen ||
    fullscreenChatHidden ||
    (isIdle && unreadCount === 0 && !isFullscreen);
  const chatPanelVisible = isChatOpen && !fullscreenChatHidden;

  return (
    <>
      <Button
        ref={launcherRef}
        variant="secondary"
        onClick={() => setIsChatOpen(true)}
        className={`fixed z-40 border-white/15 bg-[#111719]/92 shadow-[0_14px_38px_rgba(0,0,0,0.38)] backdrop-blur-xl transition-[opacity,transform] duration-200 motion-reduce:transition-none ${launcherPlacement} ${launcherHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        aria-label={
          unreadCount > 0
            ? `Open chat, ${unreadCount} unread messages`
            : 'Open chat'
        }
        aria-hidden={launcherHidden}
        tabIndex={launcherHidden ? -1 : undefined}
      >
        <MessageSquare className="size-4 text-teal-300" />
        <span className="hidden sm:inline">Chat</span>
        {unreadCount > 0 ? (
          <span className="grid min-w-5 place-items-center rounded-full bg-teal-300 px-1.5 py-0.5 text-[10px] leading-4 font-bold text-[#07100f]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </Button>

      {showNotification && !isChatOpen && !fullscreenChatHidden ? (
        <div
          className={`fixed z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-xl border border-white/10 bg-[#111719]/96 p-1.5 pr-2 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl ${notificationPlacement}`}
          role="status"
          aria-live="polite"
        >
          <button
            type="button"
            onClick={() => setIsChatOpen(true)}
            className="flex min-h-10 items-center gap-3 rounded-lg px-2.5 text-left outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-teal-300"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-teal-300/10 text-teal-300">
              <MessageSquare className="size-4" />
            </span>
            <span>
              <span className="block text-xs font-medium text-zinc-100">
                New message
              </span>
              <span className="block text-[11px] text-zinc-500">
                Open room chat
              </span>
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => setShowNotification(false)}
            aria-label="Dismiss message notification"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <aside
        className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111719]/97 shadow-[0_24px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl transition-[opacity,transform] will-change-transform motion-reduce:transition-none ${panelPlacement} ${chatPanelVisible ? 'translate-y-0 scale-100 opacity-100 duration-[260ms] ease-[cubic-bezier(0.16,1.08,0.3,1)]' : 'pointer-events-none translate-y-3 scale-[0.97] opacity-0 duration-[180ms] ease-out'}`}
        role="dialog"
        aria-labelledby="room-chat-title"
        aria-describedby="room-chat-description"
        aria-hidden={!chatPanelVisible}
        inert={!chatPanelVisible}
      >
        <header className="flex min-h-[4.5rem] items-center justify-between gap-3 border-b border-white/[0.08] px-4">
          <div className="min-w-0">
            <h2
              id="room-chat-title"
              className="truncate text-sm font-semibold text-zinc-100"
            >
              Room chat
            </h2>
            <p
              id="room-chat-description"
              className="mt-0.5 text-[11px] text-zinc-500"
            >
              Peer-to-peer · not saved
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-10"
              onClick={() => setNotificationSoundEnabled((value) => !value)}
              aria-label={
                notificationSoundEnabled
                  ? 'Mute chat notification sounds'
                  : 'Enable chat notification sounds'
              }
              title={
                notificationSoundEnabled
                  ? 'Mute notification sounds'
                  : 'Enable notification sounds'
              }
            >
              {notificationSoundEnabled ? (
                <Bell className="size-4" />
              ) : (
                <BellOff className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-10"
              onClick={() => setIsChatOpen(false)}
              aria-label="Close chat"
            >
              <X className="size-4" />
            </Button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <ol
            ref={messagesRef}
            onScroll={handleMessageScroll}
            className="custom-scrollbar h-full space-y-3 overflow-y-auto px-4 py-4"
            aria-label="Chat messages"
          >
            {chatMessages.length === 0 ? (
              <li className="flex h-full min-h-44 flex-col items-center justify-center px-4 text-center">
                <span className="mb-3 grid size-11 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-zinc-600">
                  <MessageSquare className="size-5" />
                </span>
                <p className="text-sm font-medium text-zinc-400">
                  No messages yet
                </p>
                <p className="mt-1 max-w-[28ch] text-xs leading-5 text-zinc-600">
                  Messages travel directly between participants and disappear
                  when the room closes.
                </p>
              </li>
            ) : (
              chatMessages.map((message) => {
                const isLocal = message.from === 'local';
                return (
                  <li
                    key={message.id}
                    className={`group flex ${isLocal ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[86%] ${isLocal ? 'text-right' : 'text-left'}`}
                    >
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-left text-sm leading-5 break-words whitespace-pre-wrap ${isLocal ? 'rounded-br-md bg-teal-300 text-[#07100f]' : 'rounded-bl-md border border-white/[0.08] bg-white/[0.065] text-zinc-200'}`}
                      >
                        {message.text}
                      </div>
                      <MessageReactions
                        connected={connected}
                        message={message}
                        onToggle={toggleMessageReaction}
                      />
                      {message.sentAt ? (
                        <time
                          dateTime={new Date(message.sentAt).toISOString()}
                          className="mt-1 block px-1 text-[10px] text-zinc-600"
                        >
                          {isLocal ? 'You · ' : 'Participant · '}
                          {timeFormatter.format(message.sentAt)}
                        </time>
                      ) : null}
                    </div>
                  </li>
                );
              })
            )}
          </ol>

          {showJumpToLatest ? (
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-lg"
              onClick={() => scrollToLatest('smooth')}
            >
              <ChevronDown className="size-3.5" />
              New messages
            </Button>
          ) : null}
        </div>

        <form
          onSubmit={handleSend}
          className="border-t border-white/[0.08] bg-[#0d1214] p-3"
        >
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <div className="flex items-end gap-2">
            <EmojiPicker
              disabled={!connected}
              label="Add emoji to message"
              onSelect={handleComposerEmoji}
            />
            <Textarea
              ref={composerRef}
              id="chat-message"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={
                connected
                  ? 'Message participant…'
                  : 'Chat becomes available when connected'
              }
              maxLength={2000}
              rows={1}
              disabled={!connected}
              className="max-h-28 min-h-11 resize-none"
              aria-describedby="chat-composer-help"
            />
            <Button
              type="submit"
              size="icon"
              className="size-11"
              disabled={!connected || !text.trim()}
              aria-label="Send message"
            >
              <Send className="size-4" />
            </Button>
          </div>
          <div
            id="chat-composer-help"
            className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-zinc-600"
          >
            <span>Enter to send · Shift+Enter for a new line</span>
            {text.length >= 1800 ? <span>{text.length}/2000</span> : null}
          </div>
        </form>
      </aside>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </>
  );
};
