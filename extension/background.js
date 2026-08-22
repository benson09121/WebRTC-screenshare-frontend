const tabs = new Map();

const getTabState = tabId => {
  if (!tabs.has(tabId)) {
    tabs.set(tabId, { pairbeamFrameId: null, playerFrameIds: new Set(), watchActive: false });
  }
  return tabs.get(tabId);
};

const sendToFrame = (tabId, frameId, message) => {
  if (!Number.isInteger(frameId)) return;
  chrome.tabs.sendMessage(tabId, message, { frameId }, () => {
    void chrome.runtime.lastError;
  });
};

const sendStatus = tabId => {
  const state = tabs.get(tabId);
  if (!state || !Number.isInteger(state.pairbeamFrameId)) return;
  sendToFrame(tabId, state.pairbeamFrameId, {
    target: 'pairbeam-bridge',
    type: 'status',
    playerReady: state.playerFrameIds.size > 0,
  });
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || !message || typeof message !== 'object') return false;
  const state = getTabState(tabId);

  if (message.source === 'pairbeam-bridge' && message.type === 'register') {
    state.pairbeamFrameId = sender.frameId;
    sendStatus(tabId);
    chrome.tabs.sendMessage(tabId, { target: 'vidking-player', type: 'register-request' }, () => {
      void chrome.runtime.lastError;
    });
    sendResponse({ ok: true, playerReady: state.playerFrameIds.size > 0 });
    return false;
  }

  if (message.source === 'vidking-player' && message.type === 'register') {
    state.playerFrameIds.add(sender.frameId);
    sendStatus(tabId);
    sendResponse({ ok: true });
    return false;
  }

  if (message.source === 'pairbeam-bridge' && message.type === 'command') {
    for (const frameId of state.playerFrameIds) {
      sendToFrame(tabId, frameId, {
        target: 'vidking-player',
        type: 'command',
        command: message.command,
      });
    }
    sendResponse({ ok: state.playerFrameIds.size > 0 });
    return false;
  }

  if (message.source === 'pairbeam-bridge' && message.type === 'watch-session') {
    state.watchActive = Boolean(message.active);
    sendResponse({ ok: true });
    return false;
  }

  if (message.source === 'vidking-player' && message.type === 'player-event') {
    if (Number.isInteger(state.pairbeamFrameId)) {
      sendToFrame(tabId, state.pairbeamFrameId, {
        target: 'pairbeam-bridge',
        type: 'player-event',
        event: message.event,
      });
    }
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener(tabId => tabs.delete(tabId));

chrome.webNavigation.onCreatedNavigationTarget.addListener(details => {
  const state = tabs.get(details.sourceTabId);
  if (!state?.watchActive || details.sourceFrameId === 0) return;

  // A provider iframe never needs to open a separate top-level tab for movie
  // playback. Top-level links created by PairBeam itself remain untouched.
  chrome.tabs.remove(details.tabId, () => {
    void chrome.runtime.lastError;
  });
  if (Number.isInteger(state.pairbeamFrameId)) {
    sendToFrame(details.sourceTabId, state.pairbeamFrameId, {
      target: 'pairbeam-bridge',
      type: 'popup-blocked',
    });
  }
});
