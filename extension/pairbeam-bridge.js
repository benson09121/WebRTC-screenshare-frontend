const PAGE_CHANNEL = 'pairbeam-page';
const EXTENSION_CHANNEL = 'pairbeam-extension';
let watchSessionActive = false;
let contextInvalidated = false;

const postToPage = payload => {
  window.postMessage({ channel: EXTENSION_CHANNEL, ...payload }, window.location.origin);
};

const reportInvalidatedContext = () => {
  if (contextInvalidated) return;
  contextInvalidated = true;
  postToPage({
    type: 'status',
    detected: false,
    playerReady: false,
    reloadRequired: true,
  });
};

const sendRuntimeMessage = (message, onResponse) => {
  try {
    if (!chrome.runtime?.id) {
      reportInvalidatedContext();
      return;
    }
    chrome.runtime.sendMessage(message, response => {
      try {
        if (chrome.runtime.lastError) {
          reportInvalidatedContext();
          return;
        }
        contextInvalidated = false;
        onResponse?.(response);
      } catch {
        reportInvalidatedContext();
      }
    });
  } catch {
    reportInvalidatedContext();
  }
};

const register = () => {
  sendRuntimeMessage({
    source: 'pairbeam-bridge',
    type: 'register',
    watchActive: watchSessionActive,
  }, response => {
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
    watchSessionActive = message.active;
    sendRuntimeMessage({
      source: 'pairbeam-bridge',
      type: 'watch-session',
      active: message.active,
    });
    return;
  }
  if (message.type !== 'command' || !message.command || typeof message.command !== 'object') return;
  sendRuntimeMessage({
    source: 'pairbeam-bridge',
    type: 'command',
    command: message.command,
  }, response => {
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
