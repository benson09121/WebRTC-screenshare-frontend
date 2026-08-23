export const CHAT_MESSAGE_MAX_LENGTH = 2000;
export const CHAT_MESSAGE_ID_MAX_LENGTH = 128;
export const CHAT_SENT_AT_MAX = 8_640_000_000_000_000;

export const CHAT_EMOJIS = Object.freeze([
  { emoji: '👍', label: 'Thumbs up', keywords: 'like agree yes good' },
  { emoji: '❤️', label: 'Heart', keywords: 'love heart care' },
  { emoji: '😂', label: 'Laughing', keywords: 'laugh funny joy' },
  { emoji: '😮', label: 'Surprised', keywords: 'wow surprised shocked' },
  { emoji: '😢', label: 'Crying', keywords: 'sad cry emotional' },
  { emoji: '🔥', label: 'Fire', keywords: 'fire hot amazing' },
  { emoji: '🎉', label: 'Party', keywords: 'party celebrate congratulations' },
  { emoji: '👏', label: 'Clapping', keywords: 'clap applause well done' },
  { emoji: '😍', label: 'Heart eyes', keywords: 'love beautiful favorite' },
  { emoji: '🤔', label: 'Thinking', keywords: 'think question curious' },
  { emoji: '😅', label: 'Relieved laugh', keywords: 'sweat laugh nervous' },
  { emoji: '😎', label: 'Cool', keywords: 'cool sunglasses confident' },
  { emoji: '👀', label: 'Eyes', keywords: 'look watch eyes' },
  { emoji: '💯', label: 'One hundred', keywords: 'hundred perfect agree' },
  { emoji: '✅', label: 'Check mark', keywords: 'done yes correct' },
  { emoji: '👎', label: 'Thumbs down', keywords: 'dislike disagree no' },
  { emoji: '🙏', label: 'Thank you', keywords: 'thanks please pray' },
  { emoji: '🥺', label: 'Pleading', keywords: 'please cute emotional' },
  { emoji: '🥳', label: 'Party face', keywords: 'party celebrate birthday' },
  { emoji: '🚀', label: 'Rocket', keywords: 'launch fast great' },
]);

const CHAT_EMOJI_SET = new Set(CHAT_EMOJIS.map((item) => item.emoji));
const CHAT_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

export const isSupportedChatEmoji = (emoji) =>
  typeof emoji === 'string' && CHAT_EMOJI_SET.has(emoji);

export const createChatMessagePayload = ({
  clientId,
  sequence,
  text,
  now = Date.now(),
}) => {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  if (!normalizedText || normalizedText.length > CHAT_MESSAGE_MAX_LENGTH)
    return null;

  const safeClientId =
    String(clientId || 'peer')
      .replace(/[^A-Za-z0-9._-]/g, '')
      .slice(0, 64) || 'peer';
  const sentAt = Math.min(
    CHAT_SENT_AT_MAX,
    Math.max(0, Math.trunc(Number(now) || Date.now())),
  );
  const safeSequence = Math.max(0, Math.trunc(Number(sequence) || 0));

  return {
    type: 'chat',
    id: `${safeClientId}:${sentAt.toString(36)}:${safeSequence.toString(36)}`.slice(
      0,
      CHAT_MESSAGE_ID_MAX_LENGTH,
    ),
    text: normalizedText,
    sentAt,
  };
};

export const normalizeChatMessagePayload = (payload, from = 'remote') => {
  if (!payload || payload.type !== 'chat') return null;
  if (
    typeof payload.id !== 'string' ||
    payload.id.length < 1 ||
    payload.id.length > CHAT_MESSAGE_ID_MAX_LENGTH ||
    !CHAT_ID_PATTERN.test(payload.id)
  )
    return null;

  if (
    typeof payload.text !== 'string' ||
    !payload.text.trim() ||
    payload.text.length > CHAT_MESSAGE_MAX_LENGTH
  )
    return null;

  if (
    !Number.isSafeInteger(payload.sentAt) ||
    payload.sentAt < 0 ||
    payload.sentAt > CHAT_SENT_AT_MAX
  )
    return null;

  return {
    id: payload.id,
    text: payload.text,
    from: from === 'local' ? 'local' : 'remote',
    sentAt: payload.sentAt,
    reactions: {},
  };
};

export const appendUniqueChatMessage = (messages, message) => {
  if (!message || messages.some((item) => item.id === message.id))
    return messages;
  return [...messages, message];
};

export const normalizeChatReactionPayload = (payload) => {
  if (!payload || payload.type !== 'chat-reaction') return null;
  if (
    typeof payload.messageId !== 'string' ||
    payload.messageId.length < 1 ||
    payload.messageId.length > CHAT_MESSAGE_ID_MAX_LENGTH ||
    !CHAT_ID_PATTERN.test(payload.messageId) ||
    !isSupportedChatEmoji(payload.emoji) ||
    typeof payload.active !== 'boolean'
  )
    return null;

  return {
    type: 'chat-reaction',
    messageId: payload.messageId,
    emoji: payload.emoji,
    active: payload.active,
  };
};

export const applyChatReaction = (messages, reaction, actor) => {
  const normalized = normalizeChatReactionPayload(reaction);
  const normalizedActor = actor === 'local' ? 'local' : 'remote';
  if (!normalized) return messages;

  const messageIndex = messages.findIndex(
    (message) => message.id === normalized.messageId,
  );
  if (messageIndex < 0) return messages;

  const message = messages[messageIndex];
  const existing = message.reactions?.[normalized.emoji] || {};
  if (Boolean(existing[normalizedActor]) === normalized.active) return messages;

  const nextActors = { ...existing, [normalizedActor]: normalized.active };
  if (!nextActors.local) delete nextActors.local;
  if (!nextActors.remote) delete nextActors.remote;

  const nextReactions = { ...(message.reactions || {}) };
  if (Object.keys(nextActors).length)
    nextReactions[normalized.emoji] = nextActors;
  else delete nextReactions[normalized.emoji];

  const nextMessages = [...messages];
  nextMessages[messageIndex] = { ...message, reactions: nextReactions };
  return nextMessages;
};

export const getChatReactionSummary = (message) =>
  Object.entries(message?.reactions || {}).flatMap(([emoji, actors]) => {
    const count =
      Number(Boolean(actors?.local)) + Number(Boolean(actors?.remote));
    return count
      ? [{ emoji, count, reactedByLocal: Boolean(actors.local) }]
      : [];
  });
