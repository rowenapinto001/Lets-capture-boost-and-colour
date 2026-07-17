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
    console.error('[LCBC background] injection failed', e);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
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
          await chrome.storage.local.set({ pendingCapture: message.capture });
          await chrome.tabs.create({ url: chrome.runtime.getURL('capture/preview.html') });
          sendResponse({ ok: true });
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

chrome.commands.onCommand.addListener(async (command) => {
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
          ? { multiPart: true, parts: response.result.parts, width: response.result.width, height: response.result.height, captureType: response.result.captureType, hostname: Utilities_getHostname(tab.url), title: tab.title }
          : { dataUrl: response.result.dataUrl, width: response.result.width, height: response.result.height, captureType: response.result.captureType, hostname: Utilities_getHostname(tab.url), title: tab.title };
        await chrome.storage.local.set({ pendingCapture: capture });
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
        const capture = { dataUrl: response.result.dataUrl, width: response.result.width, height: response.result.height, captureType: response.result.captureType, hostname: Utilities_getHostname(tab.url), title: tab.title };
        await chrome.storage.local.set({ pendingCapture: capture });
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
});

function Utilities_getHostname(url) {
  try { return new URL(url).hostname; } catch (e) { return 'page'; }
}
