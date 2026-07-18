/* Storage Manager — centralised chrome.storage.local access with safe defaults */

const DEFAULT_STATE = {
  extensionEnabled: true,
  lastPopupTab: 'capture',
  globalSettings: {
    colourMode: 'original',
    themeId: null,
    displayMode: 'light',
    themeIntensity: 100,
    backgroundBrightness: 100,
    textContrast: 100,
    imageBrightness: 100,
    imageSaturation: 100,
    keepMediaUnchanged: true,
    applyToAllSites: false
  },
  siteSettings: {},
  captureSettings: {
    hideStickyElements: true,
    restoreScrollPosition: true,
    includePageBackground: true,
    captureAppearance: 'current-theme',
    openPreview: true
  },
  favouriteThemes: [],
  customThemes: [],
  recentCapture: null
};

function deepMerge(base, override) {
  if (typeof override !== 'object' || override === null || Array.isArray(override)) {
    return override === undefined ? base : override;
  }
  const out = { ...base };
  for (const key of Object.keys(override)) {
    if (typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key])) {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

const StorageManager = {
  async getAll() {
    try {
      const data = await chrome.storage.local.get(null);
      return deepMerge(DEFAULT_STATE, data);
    } catch (e) {
      console.warn('[StorageManager] getAll failed, using defaults', e);
      return { ...DEFAULT_STATE };
    }
  },

  async get(keys) {
    try {
      const all = await this.getAll();
      if (Array.isArray(keys)) {
        const result = {};
        keys.forEach(k => { result[k] = all[k]; });
        return result;
      }
      return all[keys];
    } catch (e) {
      console.warn('[StorageManager] get failed', e);
      return Array.isArray(keys) ? {} : undefined;
    }
  },

  async set(partial) {
    try {
      await chrome.storage.local.set(partial);
      return true;
    } catch (e) {
      console.warn('[StorageManager] set failed', e);
      return false;
    }
  },

  async getSiteSettings(hostname) {
    const all = await this.getAll();
    return all.siteSettings[hostname] || {};
  },

  async setSiteSettings(hostname, partial) {
    const all = await this.getAll();
    const siteSettings = { ...all.siteSettings };
    siteSettings[hostname] = { ...(siteSettings[hostname] || {}), ...partial };
    await this.set({ siteSettings });
    return siteSettings[hostname];
  },

  async removeSiteSetting(hostname, key) {
    const all = await this.getAll();
    const siteSettings = { ...all.siteSettings };
    if (siteSettings[hostname]) {
      const updated = { ...siteSettings[hostname] };
      delete updated[key];
      siteSettings[hostname] = updated;
      await this.set({ siteSettings });
    }
  },

  async resetSite(hostname) {
    const all = await this.getAll();
    const siteSettings = { ...all.siteSettings };
    delete siteSettings[hostname];
    await this.set({ siteSettings });
  },

  DEFAULT_STATE
};

if (typeof module !== 'undefined') { module.exports = StorageManager; }
