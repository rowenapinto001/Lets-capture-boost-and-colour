/* Background service worker — Manifest V3.
   Handles script injection, tab screenshot capture, and keyboard commands.
   Contains no remote calls, no analytics, no external services. */

const INJECT_FILES = [
  'utilities.js',
  'storage-manager.js',
  'theme-engine.js',
  'audio-controller.js',
  'screenshot-controller.js',
  'content.js'
];

const lastCaptureTime = new Map(); // windowId -> timestamp, to respect capture rate limits
let lastSupportedPageTabId = null;

function rememberSupportedPageTab(tab) {
  if (tab?.id && isSupportedTabUrl(tab.url)) {
    lastSupportedPageTabId = tab.id;
  }
}

async function getSidePanelPageTab() {
  const [focusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (focusedTab && isSupportedTabUrl(focusedTab.url)) {
    rememberSupportedPageTab(focusedTab);
    return focusedTab;
  }

  if (lastSupportedPageTabId) {
    try {
      const rememberedTab = await chrome.tabs.get(lastSupportedPageTabId);
      if (isSupportedTabUrl(rememberedTab.url)) return rememberedTab;
    } catch (error) {
      lastSupportedPageTabId = null;
    }
  }

  const activeTabs = await chrome.tabs.query({ active: true });
  const fallbackTab = activeTabs.find(tab => isSupportedTabUrl(tab.url));
  if (fallbackTab) rememberSupportedPageTab(fallbackTab);
  return fallbackTab || null;
}

async function configureSidePanel() {
  if (!chrome.sidePanel) return;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn('[LCBC background] side panel setup failed', error);
  }
}

function notifySidePanelPageChange() {
  chrome.runtime.sendMessage({ type: 'SIDEPANEL_PAGE_CHANGED' }).catch(() => {
    // The panel is closed, so there is nothing to refresh.
  });
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanel();
});

configureSidePanel();

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    rememberSupportedPageTab(await chrome.tabs.get(tabId));
  } catch (error) {
    // The tab may have closed before the event was handled.
  }
  notifySidePanelPageChange();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url) {
    try {
      rememberSupportedPageTab(await chrome.tabs.get(tabId));
    } catch (error) {
      // Ignore tabs that disappear during navigation.
    }
  }
  if (changeInfo.status === 'complete' || changeInfo.url) {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab?.id === tabId) notifySidePanelPageChange();
  }
});

if (typeof importScripts === 'function') {
  importScripts('capture-store.js');
}

async function ensureInjected(tabId) {
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__lcbcContentLoaded === true
    });
    if (result) return true;
  } catch (e) {
    return false; // page not scriptable (chrome://, web store, etc.)
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: INJECT_FILES
    });
    return true;
  } catch (e) {
    console.warn('[LCBC background] page injection was unavailable', e);
    return false;
  }
}

async function captureVisibleTabThrottled(windowId) {
  const now = Date.now();
  const last = lastCaptureTime.get(windowId) || 0;
  const minGap = 500;
  const wait = Math.max(0, minGap - (now - last));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastCaptureTime.set(windowId, Date.now());
  return chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
}

async function savePendingCapture(capture) {
  try {
    const storedCapture = await CaptureStore.saveCapture(capture);
    await chrome.storage.local.set({ pendingCapture: storedCapture });
    return storedCapture;
  } catch (storeError) {
    console.warn('[LCBC background] IndexedDB capture storage failed, trying inline storage', storeError);
    await chrome.storage.local.set({ pendingCapture: capture });
    return capture;
  }
}

function enrichCaptureWithTab(capture, tab, fallbackAppearance) {
  if (!capture || !tab) return capture;
  return {
    ...capture,
    sourceTabId: capture.sourceTabId ?? tab.id,
    sourceWindowId: capture.sourceWindowId ?? tab.windowId,
    sourceUrl: capture.sourceUrl ?? tab.url,
    captureAppearance: capture.captureAppearance ?? fallbackAppearance
  };
}

function isSupportedTabUrl(url) {
  return !!url && !/^(chrome|edge|about|devtools|chrome-extension):/.test(url) &&
    !url.includes('chrome.google.com/webstore') &&
    !url.includes('chromewebstore.google.com');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_SIDEPANEL_PAGE_TAB': {
          const tab = await getSidePanelPageTab();
          sendResponse({
            ok: !!tab,
            tab: tab ? {
              id: tab.id,
              url: tab.url,
              title: tab.title,
              windowId: tab.windowId
            } : null
          });
          break;
        }
        case 'SEND_TO_PAGE': {
          let tab = null;
          if (Number.isFinite(Number(message.tabId))) {
            try {
              tab = await chrome.tabs.get(Number(message.tabId));
            } catch (error) {
              tab = null;
            }
          }
          if (!tab || !isSupportedTabUrl(tab.url)) {
            tab = await getSidePanelPageTab();
          }
          if (!tab || !isSupportedTabUrl(tab.url)) {
            sendResponse({ ok: false, error: 'No supported website tab is active.' });
            break;
          }

          rememberSupportedPageTab(tab);
          const injected = await ensureInjected(tab.id);
          if (!injected) {
            sendResponse({ ok: false, error: 'This page could not be connected to the extension.' });
            break;
          }

          const pageResponse = await chrome.tabs.sendMessage(tab.id, message.payload);
          sendResponse(pageResponse || { ok: false, error: 'The website did not respond.' });
          break;
        }
        case 'ENSURE_INJECTED': {
          const tabId = message.tabId ?? sender.tab?.id;
          const ok = await ensureInjected(tabId);
          sendResponse({ ok });
          break;
        }
        case 'CAPTURE_VISIBLE_TAB': {
          const windowId = sender.tab?.windowId;
          const dataUrl = await captureVisibleTabThrottled(windowId);
          sendResponse({ ok: true, dataUrl });
          break;
        }
        case 'CAPTURE_VISIBLE_TAB_FOR_POPUP': {
          const windowId = message.windowId;
          const dataUrl = await captureVisibleTabThrottled(windowId);
          sendResponse({ ok: true, dataUrl });
          break;
        }
        case 'OPEN_PREVIEW': {
          const capture = enrichCaptureWithTab(message.capture, sender.tab, message.capture?.captureAppearance);
          const storedCapture = await savePendingCapture(capture);
          if (message.recentCapture) {
            await chrome.storage.local.set({ recentCapture: message.recentCapture });
          } else if (storedCapture) {
            await chrome.storage.local.set({
              recentCapture: {
                captureType: storedCapture.captureType,
                hostname: storedCapture.hostname,
                width: storedCapture.width,
                height: storedCapture.height
              }
            });
          }
          if (message.openPreview !== false) {
            await chrome.tabs.create({ url: chrome.runtime.getURL('capture/preview.html') });
          }
          sendResponse({ ok: true });
          break;
        }
        case 'START_RETAKE_SELECTION':
        case 'START_RETAKE_CAPTURE': {
          const tabId = Number(message.tabId);
          if (!Number.isFinite(tabId)) {
            sendResponse({ ok: false, error: 'The original page tab could not be found.' });
            break;
          }

          let tab = null;
          try {
            tab = await chrome.tabs.get(tabId);
          } catch (e) {
            sendResponse({ ok: false, error: 'The original page is no longer available for capture.' });
            break;
          }

          if (!tab || !tab.id || !isSupportedTabUrl(tab.url)) {
            sendResponse({ ok: false, error: 'The original page is no longer available for capture.' });
            break;
          }

          if (typeof tab.windowId === 'number') {
            await chrome.windows.update(tab.windowId, { focused: true });
          }
          await chrome.tabs.update(tab.id, { active: true });

          const injected = await ensureInjected(tab.id);
          if (!injected) {
            sendResponse({ ok: false, error: 'This page cannot be modified by extensions.' });
            break;
          }

          const kind = ['full', 'visible', 'selection'].includes(message.options?.kind)
            ? message.options.kind
            : 'selection';
          const response = await chrome.tabs.sendMessage(tab.id, {
            type: kind === 'selection' ? 'START_SELECTION_CAPTURE_PAGE' : 'START_RETAKE_CAPTURE_PAGE',
            options: {
              kind,
              appearance: message.options?.appearance || 'current-theme',
              hideSticky: message.options?.hideSticky !== false,
              restoreScroll: message.options?.restoreScroll !== false,
              includeBackground: message.options?.includeBackground !== false,
              openPreview: true
            }
          });
          sendResponse(response || { ok: true, started: true });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true;
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function handleCommand(command) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;

  const { extensionEnabled = true } = await chrome.storage.local.get(['extensionEnabled']);
  if (!extensionEnabled) return;

  const supported = tab.url && !/^(chrome|edge|about|devtools|chrome-extension):/.test(tab.url) &&
    !tab.url.includes('chrome.google.com/webstore') && !tab.url.includes('chromewebstore.google.com');
  if (!supported) return;

  const injected = await ensureInjected(tab.id);
  if (!injected) return;

  switch (command) {
    case 'capture-full-page': {
      const settings = await chrome.storage.local.get(['captureSettings']);
      const cfg = settings.captureSettings || {
        hideStickyElements: true,
        restoreScrollPosition: true,
        includePageBackground: true,
        captureAppearance: 'current-theme',
        openPreview: true
      };
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'CAPTURE_FULL_PAGE_PAGE',
        options: {
          appearance: cfg.captureAppearance,
          hideSticky: cfg.hideStickyElements,
          restoreScroll: cfg.restoreScrollPosition,
          includeBackground: cfg.includePageBackground !== false
        }
      });
      if (response && response.ok && cfg.openPreview) {
        const capture = response.result.multiPart
          ? { multiPart: true, parts: response.result.parts, width: response.result.width, height: response.result.height, captureType: response.result.captureType, hostname: Utilities_getHostname(tab.url), title: tab.title, sourceTabId: tab.id, sourceWindowId: tab.windowId, sourceUrl: tab.url, captureAppearance: cfg.captureAppearance }
          : { dataUrl: response.result.dataUrl, width: response.result.width, height: response.result.height, captureType: response.result.captureType, hostname: Utilities_getHostname(tab.url), title: tab.title, sourceTabId: tab.id, sourceWindowId: tab.windowId, sourceUrl: tab.url, captureAppearance: cfg.captureAppearance };
        await savePendingCapture(capture);
        await chrome.tabs.create({ url: chrome.runtime.getURL('capture/preview.html') });
      }
      break;
    }
    case 'capture-visible-area': {
      const settings = await chrome.storage.local.get(['captureSettings']);
      const cfg = settings.captureSettings || { captureAppearance: 'current-theme', openPreview: true };
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'CAPTURE_VISIBLE_AREA_PAGE',
        options: { appearance: cfg.captureAppearance }
      });
      if (response && response.ok && cfg.openPreview) {
        const capture = { dataUrl: response.result.dataUrl, width: response.result.width, height: response.result.height, captureType: response.result.captureType, hostname: Utilities_getHostname(tab.url), title: tab.title, sourceTabId: tab.id, sourceWindowId: tab.windowId, sourceUrl: tab.url, captureAppearance: cfg.captureAppearance };
        await savePendingCapture(capture);
        await chrome.tabs.create({ url: chrome.runtime.getURL('capture/preview.html') });
      }
      break;
    }
    case 'toggle-theme': {
      const status = await chrome.tabs.sendMessage(tab.id, { type: 'GET_THEME_STATUS' });
      if (status && status.applied) {
        await chrome.tabs.sendMessage(tab.id, { type: 'REMOVE_THEME' });
      } else {
        await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_SAVED_THEME' });
      }
      break;
    }
    case 'mute-tab': {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_MUTE' });
      break;
    }
  }
}

chrome.commands.onCommand.addListener((command) => {
  handleCommand(command).catch(error => {
    console.warn(`[LCBC background] command ${command} could not be completed`, error);
  });
});

function Utilities_getHostname(url) {
  try { return new URL(url).hostname; } catch (e) { return 'page'; }
}
