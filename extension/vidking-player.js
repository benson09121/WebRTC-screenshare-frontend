let player = null;
let playerListeners = null;
let pendingCommand = null;
let desiredPlayback = null;
let lastProgressAt = 0;
let resumeAfterUserSeek = false;
let lastActivityAt = 0;

const reportUserActivity = () => {
  const now = performance.now();
  if (now - lastActivityAt < 250) return;
  lastActivityAt = now;
  chrome.runtime.sendMessage({
    source: 'vidking-player',
    type: 'user-activity',
  }, () => void chrome.runtime.lastError);
};

window.addEventListener('pointermove', reportUserActivity, { passive: true });
window.addEventListener('pointerdown', reportUserActivity, { passive: true });
window.addEventListener('keydown', reportUserActivity);

const isExpectedPlaybackInterruption = error => (
  error?.name === 'AbortError'
  || /play\(\) request was interrupted|interrupted by a call to pause|interrupted by a new load request/i.test(String(error?.message || error || ''))
);

const beginExpectedEvents = (commandId, events) => {
  const normalizedId = typeof commandId === 'string' ? commandId.slice(0, 96) : null;
  pendingCommand = normalizedId && events.size
    ? { commandId: normalizedId, events, expiresAt: performance.now() + 2500 }
    : null;
};

const consumeCommandId = eventName => {
  if (!pendingCommand) return null;
  if (performance.now() > pendingCommand.expiresAt) {
    pendingCommand = null;
    return null;
  }
  if (!pendingCommand.events.has(eventName)) return null;
  const commandId = pendingCommand.commandId;
  pendingCommand.events.delete(eventName);
  if (!pendingCommand.events.size) pendingCommand = null;
  return commandId;
};

const snapshot = (eventName, extra = {}) => ({
  event: eventName,
  paused: player?.paused ?? true,
  position: Number.isFinite(player?.currentTime) ? player.currentTime : 0,
  duration: Number.isFinite(player?.duration) ? player.duration : null,
  readyState: player?.readyState ?? 0,
  commandId: extra.commandId === undefined ? consumeCommandId(eventName) : extra.commandId,
  ...extra,
});

const report = (eventName, extra) => {
  chrome.runtime.sendMessage({
    source: 'vidking-player',
    type: 'player-event',
    event: snapshot(eventName, extra),
  }, () => void chrome.runtime.lastError);
};

const rememberPlayback = (eventName, extra) => {
  if (!player) return;
  desiredPlayback = {
    paused: player.paused,
    position: Number.isFinite(player.currentTime) ? player.currentTime : 0,
  };
  report(eventName, extra);
};

const isExpectingSeek = () => Boolean(
  pendingCommand
  && performance.now() <= pendingCommand.expiresAt
  && pendingCommand.events.has('seeked')
);

const handleSeeking = () => {
  if (!player || isExpectingSeek()) return;
  if (!player.paused) {
    resumeAfterUserSeek = true;
    player.pause();
  }
};

const handleSeeked = () => {
  const shouldResume = resumeAfterUserSeek;
  resumeAfterUserSeek = false;
  rememberPlayback('seeked', { resumeAfterSeek: shouldResume });
};

const reportProgress = () => {
  const now = performance.now();
  if (now - lastProgressAt < 1000) return;
  lastProgressAt = now;
  desiredPlayback = {
    paused: player?.paused ?? true,
    position: Number.isFinite(player?.currentTime) ? player.currentTime : 0,
  };
  report('timeupdate');
};

const restoreAfterSourceChange = async () => {
  if (!player || !desiredPlayback) {
    report('ready');
    return;
  }
  const expected = new Set();
  if (Math.abs(player.currentTime - desiredPlayback.position) > 1.25) expected.add('seeked');
  if (desiredPlayback.paused !== player.paused) expected.add(desiredPlayback.paused ? 'pause' : 'play');
  beginExpectedEvents(`quality-restore-${Date.now()}`, expected);
  try {
    if (expected.has('seeked')) {
      player.currentTime = Math.max(0, Math.min(desiredPlayback.position, player.duration || desiredPlayback.position));
    }
    if (desiredPlayback.paused) player.pause();
    else await player.play();
    report('ready');
  } catch (error) {
    if (isExpectedPlaybackInterruption(error)) {
      report('ready');
      return;
    }
    report('error', { error: error?.message || 'Playback could not resume after the player source changed.' });
  }
};

const attach = candidate => {
  if (!candidate || candidate === player) return;
  playerListeners?.abort();
  playerListeners = new AbortController();
  player = candidate;
  const options = { signal: playerListeners.signal };
  player.addEventListener('play', () => rememberPlayback('play'), options);
  player.addEventListener('pause', () => rememberPlayback('pause'), options);
  player.addEventListener('seeking', handleSeeking, options);
  player.addEventListener('seeked', handleSeeked, options);
  player.addEventListener('loadedmetadata', restoreAfterSourceChange, options);
  player.addEventListener('canplay', () => report('canplay'), options);
  player.addEventListener('waiting', () => report('waiting'), options);
  player.addEventListener('emptied', () => report('sourcechange'), options);
  player.addEventListener('timeupdate', reportProgress, options);
  if (player.readyState >= 1) restoreAfterSourceChange();
  else report('attached');
};

const scorePlayer = candidate => {
  if (!candidate.isConnected) return -1;
  const rect = candidate.getBoundingClientRect();
  const area = Math.max(0, rect.width * rect.height);
  const duration = Number.isFinite(candidate.duration) ? Math.min(candidate.duration, 86_400) : 0;
  return duration * 1_000_000 + area * 100 + candidate.readyState * 10 + (candidate.paused ? 0 : 1);
};

const discoverPlayer = () => {
  let best = null;
  let bestScore = -1;
  for (const candidate of document.querySelectorAll('video')) {
    const score = scorePlayer(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  attach(best);
};

const runCommand = async command => {
  if (!player?.isConnected) discoverPlayer();
  if (!player) {
    report('error', { error: 'No controllable video element was found.' });
    return;
  }

  const expected = new Set();
  const requestedPosition = Number.isFinite(command.position)
    ? Math.max(0, Math.min(command.position, player.duration || command.position))
    : null;
  const shouldSeek = requestedPosition !== null && Math.abs(player.currentTime - requestedPosition) > 0.35;
  if ((command.action === 'pause' || command.action === 'sync') && command.paused !== false && !player.paused) {
    expected.add('pause');
  }
  if ((command.action === 'play' || (command.action === 'sync' && !command.paused)) && player.paused) {
    expected.add('play');
  }
  if ((command.action === 'seek' || command.action === 'sync') && shouldSeek) expected.add('seeked');
  beginExpectedEvents(command.commandId, expected);

  const currentDesired = desiredPlayback || { paused: player.paused, position: player.currentTime || 0 };
  if (command.action === 'pause') desiredPlayback = { ...currentDesired, paused: true };
  if (command.action === 'play') desiredPlayback = { ...currentDesired, paused: false };
  if (command.action === 'seek' && requestedPosition !== null) {
    desiredPlayback = { ...currentDesired, position: requestedPosition };
  }

  try {
    if (command.action === 'pause') player.pause();
    if (command.action === 'seek' && shouldSeek) player.currentTime = requestedPosition;
    if (command.action === 'sync') {
      desiredPlayback = { paused: Boolean(command.paused), position: requestedPosition ?? player.currentTime };
      if (shouldSeek) player.currentTime = requestedPosition;
      if (command.paused) player.pause();
      else await player.play();
    }
    if (command.action === 'play') await player.play();
    report('command-applied', { commandId: command.commandId || null });
  } catch (error) {
    if (isExpectedPlaybackInterruption(error)) return;
    report('error', {
      commandId: command.commandId || null,
      error: error?.message || 'The player rejected the playback command.',
    });
  }
};

chrome.runtime.onMessage.addListener(message => {
  if (message?.target !== 'vidking-player') return;
  if (message.type === 'command') runCommand(message.command || {});
  if (message.type === 'register-request') {
    chrome.runtime.sendMessage({ source: 'vidking-player', type: 'register' }, () => void chrome.runtime.lastError);
  }
});

chrome.runtime.sendMessage({ source: 'vidking-player', type: 'register' }, () => void chrome.runtime.lastError);
discoverPlayer();
new MutationObserver(discoverPlayer).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class', 'src', 'style'],
  childList: true,
  subtree: true,
});
