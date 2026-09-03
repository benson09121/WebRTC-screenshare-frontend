import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  appendUniqueChatMessage,
  applyChatReaction,
  createChatMessagePayload,
  getChatReactionSummary,
  normalizeChatMessagePayload,
  normalizeChatReactionPayload,
} from './chatProtocol.js';

test('creates one bounded chat identity that the receiver preserves', () => {
  const payload = createChatMessagePayload({
    clientId: 'peer/unsafe',
    sequence: 4,
    text: '  hello  ',
    now: 1_725_000_000_000,
  });
  const received = normalizeChatMessagePayload(payload, 'remote');

  assert.equal(payload.id, received.id);
  assert.equal(payload.sentAt, received.sentAt);
  assert.equal(received.text, 'hello');
  assert.ok(payload.id.length <= 128);
});

test('rejects malformed messages and deduplicates retransmitted identities', () => {
  assert.equal(
    normalizeChatMessagePayload({
      type: 'chat',
      id: '../bad',
      text: 'hello',
      sentAt: 4,
    }),
    null,
  );
  assert.equal(
    normalizeChatMessagePayload({
      type: 'chat',
      id: 'valid:1',
      text: '   ',
      sentAt: 4,
    }),
    null,
  );
  assert.equal(
    normalizeChatMessagePayload({
      type: 'chat',
      id: 'valid:1',
      text: 'hello',
      sentAt: Number.MAX_SAFE_INTEGER,
    }),
    null,
  );

  const message = normalizeChatMessagePayload({
    type: 'chat',
    id: 'peer:1:0',
    text: 'hello',
    sentAt: 4,
  });
  const once = appendUniqueChatMessage([], message);
  assert.equal(appendUniqueChatMessage(once, message), once);
});

test('preserves a validated ephemeral reply reference', () => {
  const payload = createChatMessagePayload({
    clientId: 'local',
    sequence: 2,
    text: 'Reply body',
    replyToId: 'peer:1:0',
    now: 10,
  });

  assert.equal(payload.replyToId, 'peer:1:0');
  assert.equal(
    normalizeChatMessagePayload(payload, 'remote').replyToId,
    'peer:1:0',
  );
  assert.equal(
    createChatMessagePayload({
      clientId: 'local',
      sequence: 3,
      text: 'Invalid reply',
      replyToId: '../bad',
    }),
    null,
  );
});

test('applies desired reaction state idempotently per participant', () => {
  const message = normalizeChatMessagePayload({
    type: 'chat',
    id: 'peer:1:0',
    text: 'hello',
    sentAt: 4,
  });
  const reaction = {
    type: 'chat-reaction',
    messageId: message.id,
    emoji: '👍',
    active: true,
  };

  const local = applyChatReaction([message], reaction, 'local');
  assert.equal(applyChatReaction(local, reaction, 'local'), local);
  const both = applyChatReaction(local, reaction, 'remote');
  assert.deepEqual(getChatReactionSummary(both[0]), [
    { emoji: '👍', count: 2, reactedByLocal: true },
  ]);

  const removed = applyChatReaction(
    both,
    { ...reaction, active: false },
    'local',
  );
  assert.deepEqual(getChatReactionSummary(removed[0]), [
    { emoji: '👍', count: 1, reactedByLocal: false },
  ]);
});

test('rejects unknown emojis and invalid reaction targets', () => {
  assert.equal(
    normalizeChatReactionPayload({
      type: 'chat-reaction',
      messageId: 'peer:1:0',
      emoji: '🪄',
      active: true,
    }),
    null,
  );
  assert.equal(
    normalizeChatReactionPayload({
      type: 'chat-reaction',
      messageId: '../bad',
      emoji: '👍',
      active: true,
    }),
    null,
  );
});
