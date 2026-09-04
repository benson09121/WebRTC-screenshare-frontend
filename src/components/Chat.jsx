import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Bell,
  BellOff,
  ChevronDown,
  Hash,
  ImagePlus,
  MessageSquare,
  Reply,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useWebRTC } from '../context/useWebRTC';
import { getChatReactionSummary } from '../lib/chatProtocol';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import { prepareChatImage } from '../lib/chatMedia';

const timeFormatter = new Intl.DateTimeFormat([], {
  hour: 'numeric',
  minute: '2-digit',
});

const QUICK_REACTIONS = ['👍', '❤️', '😂'];

const MessageReactions = ({ connected, message, onReply, onToggle }) => {
  const reactions = getChatReactionSummary(message);
  return (
    <div
      className="mt-1 flex min-h-7 flex-wrap items-center justify-start gap-1"
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
        <Button
          variant="ghost"
          size="icon"
          className="size-7 rounded-lg"
          onClick={() => onReply(message)}
          disabled={!connected}
          aria-label="Reply to message"
        >
          <Reply className="size-3.5" />
        </Button>
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
          align="start"
          onSelect={(emoji) => onToggle(message.id, emoji)}
        />
      </div>
    </div>
  );
};

export const Chat = () => {
  const {
    chatMessages,
    connected,
    isChatOpen,
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
  const [replyingTo, setReplyingTo] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [mediaError, setMediaError] = useState('');
  const messagesRef = useRef(null);
  const composerRef = useRef(null);
  const launcherRef = useRef(null);
  const imageInputRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const previousMessageCountRef = useRef(chatMessages.length);
  const wasChatOpenRef = useRef(false);
  const notificationTimerRef = useRef(null);
  const highlightTimerRef = useRef(null);
  const messageById = useMemo(
    () => new Map(chatMessages.map((message) => [message.id, message])),
    [chatMessages],
  );

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
      ) {
        if (replyingTo) setReplyingTo(null);
        else setIsChatOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isChatOpen, replyingTo, setIsChatOpen]);

  useEffect(
    () => () => {
      window.clearTimeout(notificationTimerRef.current);
      window.clearTimeout(highlightTimerRef.current);
    },
    [],
  );

  const handleSend = (event) => {
    event?.preventDefault();
    const message = text.trim();
    if (!message) return;
    if (sendMessage(message, replyingTo?.id || null)) {
      setText('');
      setReplyingTo(null);
    }
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

  const handleReply = (message) => {
    setReplyingTo(message);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const sendAttachment = (attachment) => {
    if (sendMessage('', replyingTo?.id || null, attachment)) {
      setReplyingTo(null);
      setMediaError('');
    } else {
      setMediaError('The attachment could not be sent over this connection.');
    }
  };

  const handleImageSelection = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      sendAttachment(await prepareChatImage(file));
    } catch (error) {
      setMediaError(error.message || 'The image could not be sent.');
    }
  };

  const jumpToMessage = (messageId) => {
    const target = document.getElementById(`chat-message-${messageId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(
      () => setHighlightedMessageId(null),
      1600,
    );
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

  const usesExternalPlayer = Boolean(externalWatchSession);
  const panelPlacement =
    'inset-y-0 right-0 h-full w-full sm:w-[360px] md:w-[340px]';
  const launcherPlacement = usesExternalPlayer
    ? 'right-3 top-1/2 -translate-y-1/2 sm:right-5'
    : 'bottom-20 right-3 sm:bottom-5 sm:right-5';
  const notificationPlacement = usesExternalPlayer
    ? 'right-3 top-[calc(50%+3.25rem)] sm:right-5'
    : 'bottom-[8.5rem] right-3 sm:bottom-[4.75rem] sm:right-5';

  const launcherHidden = isChatOpen;
  const chatPanelVisible = isChatOpen;

  return (
    <>
      <Button
        ref={launcherRef}
        variant="secondary"
        onClick={() => setIsChatOpen(true)}
        className={`fixed z-[90] border-white/15 bg-[#111719]/92 shadow-[0_14px_38px_rgba(0,0,0,0.38)] backdrop-blur-xl transition-[opacity,transform] duration-200 motion-reduce:transition-none ${launcherPlacement} ${launcherHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
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

      {showNotification && !isChatOpen ? (
        <div
          className={`fixed z-[100] flex max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-xl border border-white/10 bg-[#111719]/96 p-1.5 pr-2 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl ${notificationPlacement}`}
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

      {chatPanelVisible ? (
        <button
          type="button"
          className="fixed inset-0 z-[110] bg-black/55 opacity-100 transition-opacity duration-200 md:hidden"
          onClick={() => setIsChatOpen(false)}
          aria-label="Close room chat"
          tabIndex="-1"
        />
      ) : null}

      <aside
        data-room-chat="true"
        className={`bg-panel fixed z-[120] flex flex-col overflow-hidden border-l border-white/10 shadow-2xl transition-transform duration-200 ease-out sm:rounded-l-lg ${panelPlacement} ${chatPanelVisible ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-labelledby="room-chat-title"
        aria-describedby="room-chat-description"
        aria-hidden={!chatPanelVisible}
        inert={!chatPanelVisible}
      >
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/[0.08] px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg">
              <Hash className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="room-chat-title"
                className="text-foreground truncate text-sm font-bold"
              >
                room-chat
              </h2>
              <p
                id="room-chat-description"
                className="text-subtle-foreground mt-0.5 flex items-center gap-1 text-[11px]"
              >
                <ShieldCheck className="size-3" aria-hidden="true" />
                Private to this room
              </p>
            </div>
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
            className="custom-scrollbar h-full space-y-1 overflow-y-auto px-2 py-4"
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
                const repliedTo = message.replyToId
                  ? messageById.get(message.replyToId)
                  : null;
                return (
                  <li
                    key={message.id}
                    id={`chat-message-${message.id}`}
                    className={`group hover:bg-panel-raised/70 focus-within:bg-panel-raised/70 flex items-start gap-3 rounded-lg px-2 py-2 transition-colors duration-150 ${highlightedMessageId === message.id ? 'bg-primary/10 ring-primary/25 ring-1' : ''}`}
                  >
                    <div
                      className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${isLocal ? 'bg-primary text-primary-foreground' : 'bg-indigo-400/20 text-indigo-200 ring-1 ring-indigo-300/20 ring-inset'}`}
                    >
                      {isLocal ? 'Y' : 'P'}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-baseline gap-2">
                        <span className="text-foreground text-sm font-bold">
                          {isLocal ? 'You' : 'Participant'}
                        </span>
                        {message.sentAt ? (
                          <time
                            dateTime={new Date(message.sentAt).toISOString()}
                            className="text-muted-foreground text-xs"
                          >
                            {timeFormatter.format(message.sentAt)}
                          </time>
                        ) : null}
                      </div>
                      {message.replyToId ? (
                        repliedTo ? (
                          <button
                            type="button"
                            onClick={() => jumpToMessage(repliedTo.id)}
                            className="mt-1.5 block max-w-full border-l-2 border-zinc-600 pl-2 text-left outline-none hover:border-teal-300 focus-visible:border-teal-300 focus-visible:ring-2 focus-visible:ring-teal-300"
                            aria-label={`Jump to message from ${repliedTo.from === 'local' ? 'You' : 'Participant'}`}
                          >
                            <span className="block text-[11px] font-semibold text-zinc-400">
                              {repliedTo.from === 'local'
                                ? 'You'
                                : 'Participant'}
                            </span>
                            <span className="block max-w-[28rem] truncate text-xs text-zinc-500">
                              {repliedTo.text}
                            </span>
                          </button>
                        ) : (
                          <p className="mt-1.5 border-l-2 border-zinc-700 pl-2 text-xs text-zinc-600">
                            Original message unavailable
                          </p>
                        )
                      ) : null}
                      <div className="text-foreground/90 mt-0.5 text-[15px] leading-5 break-words whitespace-pre-wrap">
                        {message.text}
                      </div>
                      {message.attachment ? (
                        <a
                          href={message.attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block max-w-sm overflow-hidden rounded-lg border border-white/10 bg-black"
                        >
                          <img
                            src={message.attachment.url}
                            alt={message.attachment.alt}
                            className="max-h-72 w-full object-contain"
                            loading="lazy"
                          />
                        </a>
                      ) : null}
                      <MessageReactions
                        connected={connected}
                        message={message}
                        onReply={handleReply}
                        onToggle={toggleMessageReaction}
                      />
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
          className="bg-panel border-t border-white/[0.06] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={handleImageSelection}
            aria-label="Choose an image to send"
          />
          {replyingTo ? (
            <div className="bg-panel-raised mb-2 flex items-center gap-3 rounded-lg border border-white/[0.08] px-3 py-2">
              <Reply className="size-4 shrink-0 text-teal-300" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-zinc-300">
                  Replying to{' '}
                  {replyingTo.from === 'local' ? 'yourself' : 'Participant'}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {replyingTo.text}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : null}
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <div className="bg-panel-raised focus-within:border-primary/30 focus-within:ring-focus/35 flex items-end gap-1 rounded-lg border border-white/[0.07] p-1 focus-within:ring-2">
            <div
              className="flex shrink-0 items-center gap-px self-center border-r border-white/[0.07] pr-1"
              aria-label="Message attachments"
            >
              <EmojiPicker
                disabled={!connected}
                label="Add emoji to message"
                onSelect={handleComposerEmoji}
                triggerClassName="size-10 rounded-md text-zinc-500 hover:text-zinc-100 md:size-8"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 rounded-md text-zinc-500 hover:text-zinc-100 md:size-8"
                disabled={!connected}
                onClick={() => imageInputRef.current?.click()}
                aria-label="Send an image"
              >
                <ImagePlus className="size-4 md:size-3.5" />
              </Button>
              <GifPicker
                disabled={!connected}
                onSelect={sendAttachment}
                triggerClassName="size-10 rounded-md text-zinc-500 hover:text-zinc-100 md:size-8"
              />
            </div>
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
              className="max-h-28 min-h-10 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 shadow-none focus-visible:bg-transparent focus-visible:ring-0"
              aria-describedby="chat-composer-help"
            />
            <Button
              type="submit"
              size="icon"
              className="size-10 shrink-0 rounded-md md:size-9"
              disabled={!connected || !text.trim()}
              aria-label="Send message"
            >
              <Send className="size-4 md:size-3.5" />
            </Button>
          </div>
          {mediaError ? (
            <p role="alert" className="mt-1.5 px-1 text-xs text-red-300">
              {mediaError}
            </p>
          ) : null}
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
