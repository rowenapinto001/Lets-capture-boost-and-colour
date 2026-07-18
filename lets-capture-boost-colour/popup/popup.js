/* Popup controller — wires the UI to storage, background, and content scripts. */

let activeTab = null;
let hostname = '';
let isSupported = false;
let state = null;
let currentThemeCategory = 'all';
let currentThemeSearch = '';
let showAllThemes = false;
let selectedThemeId = null;
let editingCustomThemeId = null;

const $ = (id) => document.getElementById(id);

function setStatus(elId, text, hide) {
  const el = $(elId);
  if (!el) return;
  el.textContent = text;
  el.closest('.card')?.toggleAttribute('hidden', !!hide);
}

async function sendToContent(message) {
  if (!$('extensionToggle')?.checked) {
    return { ok: false, error: 'Extension is disabled. Turn it on to use this tool.' };
  }
  if (!activeTab || !isSupported) {
    return { ok: false, error: Utilities.unsupportedReason(activeTab?.url) };
  }
  const inject = await chrome.runtime.sendMessage({ type: 'ENSURE_INJECTED', tabId: activeTab.id });
  if (!inject || !inject.ok) {
    return { ok: false, error: 'This page cannot be modified by extensions.' };
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(activeTab.id, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: 'No response from page.' });
    });
  });
}

/* ---------------- Init ---------------- */

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  hostname = tab && tab.url ? Utilities.getHostname(tab.url) : '';
  isSupported = tab && Utilities.isSupportedUrl(tab.url);

  $('siteHostname').textContent = hostname || 'unsupported page';

  if (!isSupported) {
    $('unsupportedBanner').hidden = false;
    $('unsupportedMessage').textContent = Utilities.unsupportedReason(tab?.url);
  }

  state = await StorageManager.getAll();

  $('extensionToggle').checked = state.extensionEnabled;
  $('rememberSiteHost').textContent = hostname || 'this site';
  $('colourSiteHost').textContent = hostname || 'this site';

  initTabs();
  initHeader();
  initCapture();
  initBoost();
  initColour();

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CAPTURE_PROGRESS') {
      updateProgress(message.payload);
    }
    if (message.type === 'SIDEPANEL_PAGE_CHANGED') {
      window.location.reload();
    }
  });
}

/* ---------------- Header ---------------- */

function initHeader() {
  $('extensionToggle').addEventListener('change', async (e) => {
    await StorageManager.set({ extensionEnabled: e.target.checked });
    if (!e.target.checked && isSupported) {
      await sendToContent({ type: 'REMOVE_THEME' });
    }
  });

  $('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage ? chrome.runtime.openOptionsPage() : null;
  });
}

/* ---------------- Tabs ---------------- */

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab, true));
  });
  selectTab(state.lastPopupTab || 'capture', false);
}

function selectTab(name, persist) {
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('hidden', p.id !== `panel-${name}`));
  if (persist) StorageManager.set({ lastPopupTab: name });
}

/* ================= CAPTURE ================= */

function initCapture() {
  const cfg = state.captureSettings;
  $('optHideSticky').checked = cfg.hideStickyElements;
  $('optRestoreScroll').checked = cfg.restoreScrollPosition;
  $('optIncludeBackground').checked = cfg.includePageBackground !== false;
  $('optOpenPreview').checked = cfg.openPreview;

  document.querySelectorAll('#appearanceSegment .segment-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === cfg.captureAppearance);
    btn.addEventListener('click', () => {
      document.querySelectorAll('#appearanceSegment .segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      persistCaptureSettings();
    });
  });

  ['optHideSticky', 'optRestoreScroll', 'optIncludeBackground', 'optOpenPreview'].forEach(id => {
    $(id).addEventListener('change', persistCaptureSettings);
  });

  $('captureVisibleBtn').addEventListener('click', () => runCapture('visible'));
  $('captureFullPageBtn').addEventListener('click', () => runCapture('full'));
  $('captureSelectionBtn').addEventListener('click', () => runCapture('selection'));

  if (state.recentCapture) {
    $('recentCaptureCard').hidden = false;
    const rc = state.recentCapture;
    $('recentCaptureInfo').textContent = `${captureTypeLabel(rc.captureType)} of ${rc.hostname} — ${rc.width}×${rc.height}`;
  }
  $('openRecentCaptureBtn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('capture/preview.html') });
  });
}

function persistCaptureSettings() {
  const appearance = document.querySelector('#appearanceSegment .segment-btn.active').dataset.value;
  StorageManager.set({
    captureSettings: {
      hideStickyElements: $('optHideSticky').checked,
      restoreScrollPosition: $('optRestoreScroll').checked,
      includePageBackground: $('optIncludeBackground').checked,
      captureAppearance: appearance,
      openPreview: $('optOpenPreview').checked
    }
  });
}

function updateProgress(payload) {
  $('progressCard').hidden = false;
  const pct = payload.total ? Math.min(100, Math.round((payload.current / payload.total) * 100)) : 0;
  $('progressFill').style.width = `${pct}%`;
  $('progressText').textContent = payload.message;
}

function captureTypeLabel(captureType) {
  if (captureType === 'fullpage' || captureType === 'fullpage-parts') return 'Full page';
  if (captureType === 'selection') return 'Selection';
  return 'Visible area';
}

async function savePendingCapture(captureRecord) {
  try {
    const storedCapture = await CaptureStore.saveCapture(captureRecord);
    await chrome.storage.local.set({ pendingCapture: storedCapture });
    return storedCapture;
  } catch (storeError) {
    console.warn('[LCBC popup] IndexedDB capture storage failed, trying inline storage', storeError);
    try {
      await chrome.storage.local.set({ pendingCapture: captureRecord });
      return captureRecord;
    } catch (inlineError) {
      console.error('[LCBC popup] pending capture save failed', inlineError);
      throw new Error('The screenshot was captured, but it was too large to prepare for preview. Try visible-area capture or a shorter page.');
    }
  }
}

async function runCapture(kind) {
  if (!isSupported) {
    setStatus('captureStatusText', Utilities.unsupportedReason(activeTab?.url), false);
    return;
  }

  const appearance = document.querySelector('#appearanceSegment .segment-btn.active').dataset.value;
  const hideSticky = $('optHideSticky').checked;
  const restoreScroll = $('optRestoreScroll').checked;
  const includeBackground = $('optIncludeBackground').checked;
  const openPreview = $('optOpenPreview').checked;

  if (kind === 'selection') {
    $('progressCard').hidden = false;
    $('captureStatusCard').hidden = true;
    $('progressFill').style.width = '0%';
    $('progressText').textContent = 'Starting selection capture...';

    const response = await sendToContent({
      type: 'START_SELECTION_CAPTURE_PAGE',
      options: { appearance, includeBackground, openPreview }
    });

    if (!response.ok) {
      $('progressCard').hidden = true;
      setStatus('captureStatusText', response.error || 'Selection capture could not be started.', false);
      return;
    }

    $('progressFill').style.width = '100%';
    $('progressText').textContent = 'Drag over the area to capture on the page.';
    setTimeout(() => window.close(), 250);
    return;
  }

  $('progressCard').hidden = false;
  $('captureStatusCard').hidden = true;
  $('progressFill').style.width = '0%';
  $('progressText').textContent = kind === 'full' ? 'Preparing full-page capture…' : 'Capturing visible area…';

  const type = kind === 'full' ? 'CAPTURE_FULL_PAGE_PAGE' : 'CAPTURE_VISIBLE_AREA_PAGE';
  const response = await sendToContent({
    type,
    options: { appearance, hideSticky, restoreScroll, includeBackground }
  });

  $('progressCard').hidden = true;

  if (!response.ok) {
    setStatus('captureStatusText', response.error || 'Capture could not be completed.', false);
    return;
  }

  const result = response.result;

  if (result.multiPart) {
    setStatus('captureStatusText', result.message, false);
  } else {
    setStatus('captureStatusText', kind === 'full' ? 'Full-page screenshot created successfully.' : 'Visible area screenshot created successfully.', false);
  }

  const sourceMetadata = {
    hostname,
    title: activeTab.title,
    sourceTabId: activeTab.id,
    sourceWindowId: activeTab.windowId,
    sourceUrl: activeTab.url,
    captureAppearance: appearance
  };
  const captureRecord = result.multiPart
    ? { multiPart: true, parts: result.parts, width: result.width, height: result.height, captureType: result.captureType, ...sourceMetadata }
    : { dataUrl: result.dataUrl, width: result.width, height: result.height, captureType: result.captureType, ...sourceMetadata };

  await StorageManager.set({ recentCapture: {
    captureType: result.captureType,
    hostname,
    width: result.width || (result.parts && result.parts[0]?.width),
    height: result.height || (result.parts && result.parts[0]?.height)
  } });

  try {
    await savePendingCapture(captureRecord);
  } catch (e) {
    setStatus('captureStatusText', e.message || 'Capture could not be prepared for preview.', false);
    return;
  }

  if (openPreview) {
    chrome.tabs.create({ url: chrome.runtime.getURL('capture/preview.html') });
  }
}

/* ================= BOOST ================= */

async function initBoost() {
  const siteSettings = state.siteSettings[hostname] || {};
  const initialVolume = siteSettings.rememberVolume && typeof siteSettings.volume === 'number' ? siteSettings.volume : 100;

  $('volumeSlider').value = initialVolume;
  updateVolumeDisplay(initialVolume);
  $('optRememberVolume').checked = !!siteSettings.rememberVolume;

  $('volumeSlider').addEventListener('input', Utilities.debounce(async (e) => {
    const v = Number(e.target.value);
    updateVolumeDisplay(v);
    const res = await sendToContent({ type: 'SET_VOLUME', volume: v });
    handleAudioResult(res);
    await maybeRememberVolume(v);
  }, 80));

  document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', async () => {
      const v = Number(btn.dataset.volume);
      $('volumeSlider').value = v;
      updateVolumeDisplay(v);
      const res = await sendToContent({ type: 'SET_VOLUME', volume: v });
      handleAudioResult(res);
      await maybeRememberVolume(v);
    });
  });

  $('muteBtn').addEventListener('click', async () => {
    const isMuted = $('muteBtn').textContent.includes('Unmute');
    const res = await sendToContent({ type: isMuted ? 'UNMUTE_TAB' : 'MUTE_TAB' });
    handleAudioResult(res);
    if ($('optRememberVolume').checked && res?.ok) {
      await StorageManager.setSiteSettings(hostname, {
        rememberVolume: true,
        volume: Number($('volumeSlider').value),
        muted: !isMuted
      });
    }
  });

  $('resetVolumeBtn').addEventListener('click', async () => {
    const res = await sendToContent({ type: 'RESET_AUDIO' });
    handleAudioResult(res);
    $('volumeSlider').value = 100;
    updateVolumeDisplay(100);
    if ($('optRememberVolume').checked) {
      $('optRememberVolume').checked = false;
      await StorageManager.removeSiteSetting(hostname, 'volume');
      await StorageManager.removeSiteSetting(hostname, 'rememberVolume');
      await StorageManager.removeSiteSetting(hostname, 'muted');
    }
  });

  $('optRememberVolume').addEventListener('change', async (e) => {
    if (e.target.checked) {
      await StorageManager.setSiteSettings(hostname, {
        rememberVolume: true,
        volume: Number($('volumeSlider').value),
        muted: $('muteBtn').textContent.includes('Unmute')
      });
    } else {
      await StorageManager.removeSiteSetting(hostname, 'rememberVolume');
      await StorageManager.removeSiteSetting(hostname, 'muted');
    }
  });

  if (isSupported) {
    const res = await sendToContent({ type: 'GET_AUDIO_STATUS' });
    handleAudioResult(res);
  } else {
    setStatus('audioStatusText', Utilities.unsupportedReason(activeTab?.url), false);
  }
}

function updateVolumeDisplay(v) {
  $('volumeDisplay').textContent = `${v}%`;
  $('volumeSlider').setAttribute('aria-valuenow', v);
  $('volumeWarning').hidden = v <= 200;
}

async function maybeRememberVolume(v) {
  if ($('optRememberVolume').checked) {
    await StorageManager.setSiteSettings(hostname, { rememberVolume: true, volume: v, muted: v === 0 });
  }
}

function handleAudioResult(res) {
  if (!res || !res.ok) {
    setStatus('audioStatusText', res?.error || 'No playable audio was found on this tab.', false);
    return;
  }
  const status = res.status;
  if (typeof status.volume === 'number') {
    $('volumeSlider').value = status.volume;
    updateVolumeDisplay(status.volume);
  }
  if (status.mediaCount === 0) {
    setStatus('audioStatusText', 'No playable audio was found on this tab.', false);
  } else if (status.restrictedCount === status.mediaCount) {
    setStatus('audioStatusText', 'This website uses protected audio that cannot be amplified. Normal mute controls are available.', false);
  } else if (status.restrictedCount > 0) {
    setStatus('audioStatusText', `Audio found: ${status.mediaCount} media elements (${status.restrictedCount} restricted from boosting).`, false);
  } else {
    setStatus('audioStatusText', `Audio found: ${status.mediaCount} media element${status.mediaCount === 1 ? '' : 's'}.`, false);
  }
  $('muteBtn').textContent = status.muted ? 'Unmute Tab' : 'Mute Tab';
}

/* ================= COLOUR ================= */

function themeMatches(theme, category, search) {
  if (category === 'favourites' && !state.favouriteThemes.includes(theme.id)) return false;
  if (category !== 'all' && category !== 'favourites' && theme.category !== category) return false;
  if (search && !theme.name.toLowerCase().includes(search.toLowerCase())) return false;
  return true;
}

function renderThemeGrid() {
  const grid = $('themeGrid');
  grid.innerHTML = '';
  const customThemes = (state.customThemes || []).map(t => ThemeEngine.buildTheme(t));
  const allThemes = [...ThemeEngine.THEME_PRESETS, ...customThemes];
  const all = allThemes.filter(t => themeMatches(t, currentThemeCategory, currentThemeSearch));
  const list = showAllThemes ? all : all.slice(0, 24);

  list.forEach(theme => grid.appendChild(buildThemeCard(theme)));

  $('viewAllThemesBtn').hidden = showAllThemes || all.length <= 24;
  updateQuickVibeSelection();
}

function updateQuickVibeSelection() {
  document.querySelectorAll('.vibe-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeId === selectedThemeId);
  });
}

function buildThemeCard(theme) {
  const card = document.createElement('div');
  card.className = 'theme-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${theme.name} theme`);
  if (selectedThemeId === theme.id) card.classList.add('selected');

  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  const swatchColors = Array.isArray(theme.previewSwatches) && theme.previewSwatches.length
    ? theme.previewSwatches
    : [theme.accent, theme.secondaryAccent, theme.background];
  swatchColors.forEach(c => {
    const s = document.createElement('span');
    s.className = 'swatch';
    s.style.background = c;
    swatches.appendChild(s);
  });

  const preview = document.createElement('div');
  preview.className = 'theme-preview';
  preview.style.background = `linear-gradient(135deg, ${theme.background} 0%, ${theme.surface} 48%, ${theme.accent} 100%)`;

  const nameRow = document.createElement('div');
  nameRow.className = 'theme-name';
  const nameSpan = document.createElement('span');
  nameSpan.textContent = theme.name;
  const star = document.createElement('button');
  star.className = 'fav-star';
  const isFav = state.favouriteThemes.includes(theme.id);
  star.classList.toggle('active', isFav);
  star.textContent = isFav ? '★' : '☆';
  star.setAttribute('aria-label', `Favourite ${theme.name}`);
  star.addEventListener('click', async (e) => {
    e.stopPropagation();
    const favs = new Set(state.favouriteThemes);
    if (favs.has(theme.id)) favs.delete(theme.id); else favs.add(theme.id);
    state.favouriteThemes = Array.from(favs);
    await StorageManager.set({ favouriteThemes: state.favouriteThemes });
    renderThemeGrid();
    renderCustomThemeGrid();
  });

  nameRow.appendChild(nameSpan);
  nameRow.appendChild(star);

  if (selectedThemeId === theme.id) {
    const check = document.createElement('span');
    check.className = 'check-mark';
    check.textContent = '✓';
    card.appendChild(check);
  }

  card.appendChild(swatches);
  card.appendChild(preview);
  card.appendChild(nameRow);

  card.addEventListener('click', () => applyThemeChoice(theme.id));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyThemeChoice(theme.id); }
  });

  return card;
}

function getSelectedDisplayMode() {
  return document.querySelector('#displayModeSegment .segment-btn.active')?.dataset.value || 'light';
}

function setDisplayMode(mode, live) {
  const next = ['light', 'dark', 'amoled', 'auto'].includes(mode) ? mode : 'light';
  document.querySelectorAll('#displayModeSegment .segment-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === next);
  });
  if (live) applyColourOptionsLive();
}

function displayModeForTheme(theme) {
  if (!theme) return null;
  const identity = `${theme.id || ''} ${theme.name || ''}`.toLowerCase();
  if (identity.includes('amoled')) return 'amoled';
  if (theme.isDark || theme.category === 'dark') return 'dark';
  return null;
}

function getColourOptions() {
  return {
    displayMode: getSelectedDisplayMode(),
    themeIntensity: Number($('sliderIntensity').value),
    backgroundBrightness: Number($('sliderBgBrightness').value),
    textContrast: Number($('sliderTextContrast').value),
    imageBrightness: 100,
    imageSaturation: 100,
    keepMediaUnchanged: true
  };
}

async function applyThemeChoice(themeId) {
  selectedThemeId = themeId;
  renderThemeGrid();

  if ($('optDisableSite').checked) {
    setStatus('colourStatusText', `Colour changes are disabled on ${hostname}.`, false);
    await persistColourChoice(themeId);
    return;
  }

  if (!isSupported) {
    setStatus('colourStatusText', Utilities.unsupportedReason(activeTab?.url), false);
    return;
  }

  const theme = ThemeEngine.getThemeById(themeId, state.customThemes);
  if (!theme) return;

  const impliedDisplayMode = displayModeForTheme(theme);
  if (impliedDisplayMode) setDisplayMode(impliedDisplayMode, false);

  const options = getColourOptions();
  const res = await sendToContent({ type: 'APPLY_THEME', theme, options });

  if (res.ok) {
    setStatus('colourStatusText', `Your ${theme.name} theme is active on this website.`, false);
  } else {
    setStatus('colourStatusText', res.error || 'Theme could not be applied.', false);
  }

  await persistColourChoice(themeId);
}

async function removeThemeChoice() {
  selectedThemeId = null;
  renderThemeGrid();
  if (isSupported) {
    const res = await sendToContent({ type: 'REMOVE_THEME' });
    setStatus('colourStatusText', res.ok ? 'Original website colours restored.' : (res.error || 'Could not restore original colours.'), false);
  }
  await persistColourChoice(null);
}

async function persistColourChoice(themeId) {
  const options = getColourOptions();
  if ($('optRememberTheme').checked) {
    await StorageManager.setSiteSettings(hostname, {
      themeId,
      colourEnabled: !$('optDisableSite').checked,
      ...options
    });
  }
  if ($('optApplyAllSites').checked) {
    const gs = { ...state.globalSettings, themeId, applyToAllSites: true, ...options };
    state.globalSettings = gs;
    await StorageManager.set({ globalSettings: gs });
  }
}

function updateColourSliderLabels() {
  $('valIntensity').textContent = `${$('sliderIntensity').value}%`;
  $('valBgBrightness').textContent = `${$('sliderBgBrightness').value}%`;
  $('valTextContrast').textContent = `${$('sliderTextContrast').value}%`;
  $('valImgBrightness').textContent = `${$('sliderImgBrightness').value}%`;
  $('valImgSaturation').textContent = `${$('sliderImgSaturation').value}%`;
}

const applyColourOptionsLive = Utilities.debounce(async () => {
  updateColourSliderLabels();

  if (!selectedThemeId) return;
  await persistColourChoice(selectedThemeId);
  if (!isSupported || $('optDisableSite').checked) return;
  const theme = ThemeEngine.getThemeById(selectedThemeId, state.customThemes);
  if (!theme) return;
  await sendToContent({ type: 'APPLY_THEME', theme, options: getColourOptions() });
}, 150);

function initColour() {
  const gs = state.globalSettings;
  const siteSettings = state.siteSettings[hostname] || {};
  setDisplayMode(siteSettings.displayMode ?? gs.displayMode ?? 'light', false);
  $('sliderIntensity').value = siteSettings.themeIntensity ?? gs.themeIntensity;
  $('sliderBgBrightness').value = siteSettings.backgroundBrightness ?? gs.backgroundBrightness;
  $('sliderTextContrast').value = siteSettings.textContrast ?? gs.textContrast;
  $('sliderImgBrightness').value = 100;
  $('sliderImgSaturation').value = 100;
  $('optKeepMedia').checked = true;
  updateColourSliderLabels();

  selectedThemeId = siteSettings.themeId !== undefined ? siteSettings.themeId
    : (gs.applyToAllSites ? gs.themeId : null);
  $('optRememberTheme').checked = siteSettings.themeId !== undefined;
  $('optApplyAllSites').checked = !!gs.applyToAllSites;
  $('optDisableSite').checked = siteSettings.colourEnabled === false;

  let correctedDisplayMode = false;
  if (selectedThemeId && getSelectedDisplayMode() === 'light') {
    const selectedTheme = ThemeEngine.getThemeById(selectedThemeId, state.customThemes);
    const impliedDisplayMode = displayModeForTheme(selectedTheme);
    if (impliedDisplayMode) {
      setDisplayMode(impliedDisplayMode, false);
      correctedDisplayMode = true;
    }
  }

  if (selectedThemeId) {
    const modeBtn = document.querySelector(`#colourModeSegment .segment-btn[data-value="themes"]`);
    setColourMode('themes');
  }

  document.querySelectorAll('#colourModeSegment .segment-btn').forEach(btn => {
    btn.addEventListener('click', () => setColourMode(btn.dataset.value));
  });

  document.querySelectorAll('#displayModeSegment .segment-btn').forEach(btn => {
    btn.addEventListener('click', () => setDisplayMode(btn.dataset.value, true));
  });

  ['sliderIntensity', 'sliderBgBrightness', 'sliderTextContrast'].forEach(id => {
    $(id).addEventListener('input', applyColourOptionsLive);
  });

  $('themeSearch').addEventListener('input', Utilities.debounce((e) => {
    currentThemeSearch = e.target.value;
    showAllThemes = true;
    renderThemeGrid();
  }, 150));

  document.querySelectorAll('#categoryChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#categoryChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentThemeCategory = chip.dataset.category;
      showAllThemes = false;
      renderThemeGrid();
    });
  });

  $('viewAllThemesBtn').addEventListener('click', () => {
    showAllThemes = true;
    renderThemeGrid();
  });

  document.querySelectorAll('.vibe-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      setColourMode('themes');
      currentThemeCategory = 'all';
      currentThemeSearch = '';
      showAllThemes = false;
      $('themeSearch').value = '';
      document.querySelectorAll('#categoryChips .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.category === 'all');
      });
      await applyThemeChoice(btn.dataset.themeId);
    });
  });

  $('optRememberTheme').addEventListener('change', async (e) => {
    if (e.target.checked) {
      await StorageManager.setSiteSettings(hostname, {
        themeId: selectedThemeId,
        colourEnabled: !$('optDisableSite').checked,
        ...getColourOptions()
      });
    } else {
      await StorageManager.removeSiteSetting(hostname, 'themeId');
    }
  });

  $('optApplyAllSites').addEventListener('change', async (e) => {
    const gsUpdate = {
      ...state.globalSettings,
      applyToAllSites: e.target.checked,
      themeId: selectedThemeId,
      ...getColourOptions()
    };
    state.globalSettings = gsUpdate;
    await StorageManager.set({ globalSettings: gsUpdate });
  });

  $('optDisableSite').addEventListener('change', async (e) => {
    if (e.target.checked) {
      await StorageManager.setSiteSettings(hostname, { colourEnabled: false });
      if (isSupported) await sendToContent({ type: 'REMOVE_THEME' });
      setStatus('colourStatusText', `Colour changes are disabled on ${hostname}.`, false);
    } else {
      await StorageManager.setSiteSettings(hostname, { colourEnabled: true });
      if (selectedThemeId) await applyThemeChoice(selectedThemeId);
    }
  });

  $('resetSiteThemeBtn').addEventListener('click', async () => {
    await StorageManager.resetSite(hostname);
    state = await StorageManager.getAll();
    const gsNow = state.globalSettings;
    selectedThemeId = null;
    $('optRememberTheme').checked = false;
    $('optDisableSite').checked = false;
    setDisplayMode(gsNow.displayMode || 'light', false);
    $('sliderIntensity').value = gsNow.themeIntensity;
    $('sliderBgBrightness').value = gsNow.backgroundBrightness;
    $('sliderTextContrast').value = gsNow.textContrast;
    $('sliderImgBrightness').value = 100;
    $('sliderImgSaturation').value = 100;
    $('optKeepMedia').checked = true;
    updateColourSliderLabels();
    renderThemeGrid();
    if (isSupported) {
      const res = await sendToContent({ type: 'REMOVE_THEME' });
      setStatus('colourStatusText', 'Original website colours restored.', false);
    }
  });

  renderThemeGrid();
  initCustomThemeCreator();

  if (!selectedThemeId) {
    setStatus('colourStatusText', 'Original website colours are showing.', false);
  } else if (correctedDisplayMode && isSupported && !$('optDisableSite').checked) {
    applyThemeChoice(selectedThemeId);
  }
}

function setColourMode(mode) {
  document.querySelectorAll('#colourModeSegment .segment-btn').forEach(b => b.classList.toggle('active', b.dataset.value === mode));
  $('customThemeCard').classList.toggle('hidden', mode !== 'custom');
  $('themesBrowser').classList.toggle('hidden', mode === 'custom');

  if (mode === 'original') {
    removeThemeChoice();
  } else if (mode === 'themes') {
    document.querySelectorAll('#categoryChips .chip').forEach(c => c.classList.toggle('active', c.dataset.category === 'all'));
    currentThemeCategory = 'all';
    renderThemeGrid();
  }
}

/* -------- Custom theme creator -------- */

function readCustomInputs() {
  return {
    name: $('customThemeName').value.trim() || 'Custom Theme',
    main: $('customMain').value,
    secondary: $('customSecondary').value,
    background: $('customBackground').value,
    surface: $('customSurface').value,
    text: $('customText').value,
    muted: $('customMuted').value,
    accent: $('customAccent').value,
    border: $('customBorder').value,
    buttonText: $('customButtonText').value,
    link: $('customLink').value
  };
}

function buildCustomTheme(inputs, id) {
  return ThemeEngine.buildTheme({
    id: id || `custom-${Date.now()}`,
    name: inputs.name,
    category: 'custom',
    background: inputs.background,
    surface: inputs.surface,
    primaryText: inputs.text,
    mutedText: inputs.muted,
    accent: inputs.accent,
    secondaryAccent: inputs.secondary,
    link: inputs.link,
    buttonBackground: inputs.accent,
    buttonText: inputs.buttonText,
    border: inputs.border
  });
}

function renderCustomPreview() {
  const inputs = readCustomInputs();
  const theme = buildCustomTheme(inputs);
  const preview = $('customPreview');
  preview.style.background = theme.background;
  preview.style.color = theme.primaryText;
  preview.style.border = `1px solid ${theme.border}`;
  preview.textContent = inputs.name;
}

function renderCustomThemeGrid() {
  const grid = $('customThemeGrid');
  grid.innerHTML = '';
  (state.customThemes || []).forEach(saved => {
    const theme = ThemeEngine.buildTheme(saved);
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-theme-item';
    wrapper.appendChild(buildThemeCard(theme));

    const actions = document.createElement('div');
    actions.className = 'theme-card-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'mini-btn';
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => beginEditCustomTheme(theme));

    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'mini-btn';
    duplicateBtn.type = 'button';
    duplicateBtn.textContent = 'Duplicate';
    duplicateBtn.addEventListener('click', () => duplicateSavedCustomTheme(theme));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'mini-btn danger';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteSavedCustomTheme(theme.id));

    actions.appendChild(editBtn);
    actions.appendChild(duplicateBtn);
    actions.appendChild(deleteBtn);
    wrapper.appendChild(actions);
    grid.appendChild(wrapper);
  });
}

function fillCustomInputs(theme) {
  $('customThemeName').value = theme.name || 'Custom Theme';
  $('customMain').value = theme.accent || '#7C3AED';
  $('customSecondary').value = theme.secondaryAccent || '#EC4899';
  $('customBackground').value = theme.background || '#F8FAFC';
  $('customSurface').value = theme.surface || '#FFFFFF';
  $('customText').value = theme.primaryText || '#172033';
  $('customMuted').value = theme.mutedText || '#64748B';
  $('customAccent').value = theme.accent || '#7C3AED';
  $('customBorder').value = theme.border || '#E2E8F0';
  $('customButtonText').value = theme.buttonText || '#FFFFFF';
  $('customLink').value = theme.link || '#2563EB';
  renderCustomPreview();
}

function beginEditCustomTheme(theme) {
  editingCustomThemeId = theme.id;
  fillCustomInputs(theme);
  $('saveCustomThemeBtn').textContent = 'Update theme';
  setStatus('colourStatusText', `Editing ${theme.name}.`, false);
}

async function duplicateSavedCustomTheme(theme) {
  const copy = ThemeEngine.buildTheme({
    ...theme,
    id: `custom-${Date.now()}`,
    name: `${theme.name} copy`,
    category: 'custom'
  });
  state.customThemes = [...(state.customThemes || []), copy];
  await StorageManager.set({ customThemes: state.customThemes });
  renderCustomThemeGrid();
  setStatus('colourStatusText', `${copy.name} duplicated.`, false);
}

async function deleteSavedCustomTheme(themeId) {
  const theme = (state.customThemes || []).find(t => t.id === themeId);
  state.customThemes = (state.customThemes || []).filter(t => t.id !== themeId);
  state.favouriteThemes = (state.favouriteThemes || []).filter(id => id !== themeId);
  await StorageManager.set({
    customThemes: state.customThemes,
    favouriteThemes: state.favouriteThemes
  });

  if (selectedThemeId === themeId) {
    selectedThemeId = null;
    if (isSupported) await sendToContent({ type: 'REMOVE_THEME' });
    await persistColourChoice(null);
  }

  if (editingCustomThemeId === themeId) {
    editingCustomThemeId = null;
    $('saveCustomThemeBtn').textContent = 'Save theme';
  }

  renderCustomThemeGrid();
  renderThemeGrid();
  setStatus('colourStatusText', `${theme?.name || 'Custom theme'} deleted.`, false);
}

function initCustomThemeCreator() {
  const colourInputs = ['customMain', 'customSecondary', 'customBackground', 'customSurface', 'customText', 'customMuted', 'customAccent', 'customBorder', 'customButtonText', 'customLink'];
  colourInputs.forEach(id => $(id).addEventListener('input', renderCustomPreview));
  $('customThemeName').addEventListener('input', renderCustomPreview);
  renderCustomPreview();
  renderCustomThemeGrid();

  $('generatePaletteBtn').addEventListener('click', () => {
    const main = $('customMain').value;
    const secondary = $('customSecondary').value;
    const generated = ThemeEngine.generatePaletteFromColors(main, secondary);
    $('customBackground').value = generated.background;
    $('customSurface').value = generated.surface;
    $('customText').value = generated.primaryText;
    $('customMuted').value = generated.mutedText;
    $('customAccent').value = generated.accent;
    $('customBorder').value = generated.border;
    $('customButtonText').value = generated.buttonText;
    $('customLink').value = generated.link;
    renderCustomPreview();
  });

  $('saveCustomThemeBtn').addEventListener('click', async () => {
    const inputs = readCustomInputs();
    const theme = buildCustomTheme(inputs, editingCustomThemeId || undefined);
    if (editingCustomThemeId) {
      state.customThemes = (state.customThemes || []).map(saved =>
        saved.id === editingCustomThemeId ? theme : saved
      );
      editingCustomThemeId = null;
      $('saveCustomThemeBtn').textContent = 'Save theme';
    } else {
      state.customThemes = [...(state.customThemes || []), theme];
    }
    await StorageManager.set({ customThemes: state.customThemes });
    renderCustomThemeGrid();
    renderThemeGrid();
    setStatus('colourStatusText', `${theme.name} saved to your custom themes.`, false);
  });

  $('duplicateCustomThemeBtn').addEventListener('click', async () => {
    const inputs = readCustomInputs();
    const theme = buildCustomTheme({ ...inputs, name: `${inputs.name} copy` });
    editingCustomThemeId = null;
    $('saveCustomThemeBtn').textContent = 'Save theme';
    state.customThemes = [...(state.customThemes || []), theme];
    await StorageManager.set({ customThemes: state.customThemes });
    renderCustomThemeGrid();
    renderThemeGrid();
  });

  $('exportCustomThemeBtn').addEventListener('click', () => {
    const inputs = readCustomInputs();
    const theme = buildCustomTheme(inputs);
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: `${Utilities.sanitizeFilename(theme.name)}-theme.json`, saveAs: true });
  });

  $('importCustomThemeBtn').addEventListener('click', () => $('importFileInput').click());
  $('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Utilities.isValidHex(parsed.background) || !Utilities.isValidHex(parsed.accent)) {
        throw new Error('Invalid theme file.');
      }
      const theme = ThemeEngine.buildTheme({ ...parsed, id: `custom-${Date.now()}` });
      state.customThemes = [...(state.customThemes || []), theme];
      await StorageManager.set({ customThemes: state.customThemes });
      renderCustomThemeGrid();
      renderThemeGrid();
      setStatus('colourStatusText', `${theme.name} imported successfully.`, false);
    } catch (err) {
      setStatus('colourStatusText', 'That file could not be imported as a theme.', false);
    }
    e.target.value = '';
  });
}

document.addEventListener('DOMContentLoaded', init);
