/* Content Script — bridges the popup/background with the page-level
   theme engine, audio controller, and screenshot controller. */

(function () {
  if (window.__lcbcContentLoaded) return;
  window.__lcbcContentLoaded = true;

  let progressPort = null;

  function sendProgress(payload) {
    try {
      chrome.runtime.sendMessage({ type: 'CAPTURE_PROGRESS', payload });
    } catch (e) { /* popup may be closed */ }
  }

  async function applySavedTheme() {
    try {
      const hostname = location.hostname;
      const all = await StorageManager.getAll();
      const site = all.siteSettings[hostname] || {};

      if (!all.extensionEnabled) {
        ThemeEngine.remove();
        return { applied: false, reason: 'Extension is disabled.' };
      }

      if (site.colourEnabled === false) {
        ThemeEngine.remove();
        return { applied: false, reason: 'Colour changes are disabled for this website.' };
      }

      const effectiveThemeId = site.themeId !== undefined ? site.themeId
        : (all.globalSettings.applyToAllSites ? all.globalSettings.themeId : null);

      if (!effectiveThemeId || effectiveThemeId === 'original') {
        ThemeEngine.remove();
        return { applied: false, reason: 'Original website colours are selected.' };
      }

      const theme = ThemeEngine.getThemeById(effectiveThemeId, all.customThemes);
      if (!theme) {
        ThemeEngine.remove();
        return { applied: false, reason: 'The saved theme is no longer available.' };
      }

      const options = {
        displayMode: site.displayMode ?? all.globalSettings.displayMode,
        themeIntensity: site.themeIntensity ?? all.globalSettings.themeIntensity,
        backgroundBrightness: site.backgroundBrightness ?? all.globalSettings.backgroundBrightness,
        textContrast: site.textContrast ?? all.globalSettings.textContrast,
        imageBrightness: site.imageBrightness ?? all.globalSettings.imageBrightness,
        imageSaturation: site.imageSaturation ?? all.globalSettings.imageSaturation,
        keepMediaUnchanged: site.keepMediaUnchanged ?? all.globalSettings.keepMediaUnchanged
      };
      ThemeEngine.apply(theme, options);
      return { applied: true, themeName: theme.name };
    } catch (e) {
      console.warn('[LCBC content] saved theme could not be applied', e);
      return { applied: false, reason: e.message || String(e) };
    }
  }

  async function applySavedVolume() {
    try {
      const hostname = location.hostname;
      const all = await StorageManager.getAll();
      if (!all.extensionEnabled) return;
      const site = await StorageManager.getSiteSettings(hostname);
      if (site.rememberVolume && typeof site.volume === 'number') {
        AudioController.setVolume(site.volume);
        if (site.muted) AudioController.mute();
      }
    } catch (e) {
      console.warn('[LCBC content] saved volume could not be applied', e);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        switch (message.type) {
          case 'PING': {
            sendResponse({ ok: true });
            break;
          }
          case 'APPLY_THEME': {
            const { theme, options } = message;
            ThemeEngine.apply(theme, options);
            sendResponse({ ok: true });
            break;
          }
          case 'REMOVE_THEME': {
            ThemeEngine.remove();
            sendResponse({ ok: true });
            break;
          }
          case 'GET_THEME_STATUS': {
            sendResponse({ ok: true, applied: ThemeEngine.isApplied() });
            break;
          }
          case 'APPLY_SAVED_THEME': {
            const result = await applySavedTheme();
            sendResponse({ ok: true, result });
            break;
          }
          case 'SET_VOLUME': {
            const status = AudioController.setVolume(message.volume);
            sendResponse({ ok: true, status });
            break;
          }
          case 'MUTE_TAB': {
            const status = AudioController.mute();
            sendResponse({ ok: true, status });
            break;
          }
          case 'UNMUTE_TAB': {
            const status = AudioController.unmute();
            sendResponse({ ok: true, status });
            break;
          }
          case 'TOGGLE_MUTE': {
            const status = AudioController.toggleMute();
            sendResponse({ ok: true, status });
            break;
          }
          case 'RESET_AUDIO': {
            const status = AudioController.reset();
            sendResponse({ ok: true, status });
            break;
          }
          case 'GET_AUDIO_STATUS': {
            const status = AudioController.scan();
            sendResponse({ ok: true, status });
            break;
          }
          case 'CAPTURE_VISIBLE_AREA_PAGE': {
            const result = await ScreenshotController.captureVisibleArea(message.options || {});
            sendResponse({ ok: true, result });
            break;
          }
          case 'START_SELECTION_CAPTURE_PAGE': {
            ScreenshotController.startSelectionCapture({
              ...(message.options || {}),
              onProgress: sendProgress
            }).catch((e) => {
              sendProgress({
                current: 0,
                total: 0,
                message: e.message || 'Selection capture could not be completed.'
              });
            });
            sendResponse({ ok: true, started: true });
            break;
          }
          case 'START_RETAKE_CAPTURE_PAGE': {
            const options = message.options || {};
            const kind = options.kind === 'full' ? 'full' : 'visible';
            (async () => {
              try {
                const appearance = options.appearance || 'current-theme';
                const result = kind === 'full'
                  ? await ScreenshotController.captureFullPage({
                    appearance,
                    hideSticky: options.hideSticky !== false,
                    restoreScroll: options.restoreScroll !== false,
                    includeBackground: options.includeBackground !== false,
                    onProgress: sendProgress
                  })
                  : await ScreenshotController.captureVisibleArea({ appearance });

                await ScreenshotController.saveCaptureResult(result, {
                  appearance,
                  openPreview: options.openPreview !== false
                });
                sendProgress({
                  current: 1,
                  total: 1,
                  message: kind === 'full'
                    ? 'Full-page retake created successfully.'
                    : 'Visible-area retake created successfully.'
                });
              } catch (e) {
                sendProgress({
                  current: 0,
                  total: 0,
                  message: e.message || 'Retake capture could not be completed.'
                });
              }
            })();
            sendResponse({ ok: true, started: true });
            break;
          }
          case 'CAPTURE_FULL_PAGE_PAGE': {
            const result = await ScreenshotController.captureFullPage({
              ...(message.options || {}),
              onProgress: sendProgress
            });
            sendResponse({ ok: true, result });
            break;
          }
          default:
            sendResponse({ ok: false, error: 'Unknown message type' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true; // keep the message channel open for async response
  });

  applySavedTheme();
  applySavedVolume();
})();
