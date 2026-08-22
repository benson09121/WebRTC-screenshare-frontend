const PAGE_CHANNEL = 'pairbeam-page';
const EXTENSION_CHANNEL = 'pairbeam-extension';

const postToPage = payload => {
  window.postMessage({ channel: EXTENSION_CHANNEL, ...payload }, window.location.origin);
};

const register = () => {
  chrome.runtime.sendMessage({ source: 'pairbeam-bridge', type: 'register' }, response => {
    if (chrome.runtime.lastError) return;
    postToPage({ type: 'status', detected: true, playerReady: Boolean(response?.playerReady) });
  });
};

window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.channel !== PAGE_CHANNEL) return;

  if (message.type === 'ping') {
    register();
    return;
  }
  if (message.type === 'watch-session' && typeof message.active === 'boolean') {
    chrome.runtime.sendMessage({
      source: 'pairbeam-bridge',
      type: 'watch-session',
      active: message.active,
    }, () => void chrome.runtime.lastError);
    return;
  }
  if (message.type !== 'command' || !message.command || typeof message.command !== 'object') return;
  chrome.runtime.sendMessage({
    source: 'pairbeam-bridge',
    type: 'command',
    command: message.command,
  }, response => {
    if (chrome.runtime.lastError) return;
    postToPage({
      type: 'command-result',
      commandId: message.command.commandId || null,
      delivered: Boolean(response?.ok),
    });
  });
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.target !== 'pairbeam-bridge') return;
  if (message.type === 'status') {
    postToPage({ type: 'status', detected: true, playerReady: Boolean(message.playerReady) });
  }
  if (message.type === 'player-event') postToPage({ type: 'player-event', event: message.event });
  if (message.type === 'user-activity') postToPage({ type: 'user-activity' });
  if (message.type === 'popup-blocked') postToPage({ type: 'popup-blocked' });
});

register();
