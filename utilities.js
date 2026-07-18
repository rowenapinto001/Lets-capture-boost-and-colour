/* Shared utility helpers used across popup, content, and background contexts */

const Utilities = {
  UNSUPPORTED_PREFIXES: [
    'chrome://', 'chrome-extension://', 'edge://', 'about:',
    'devtools://', 'view-source:', 'chrome-search://'
  ],

  isSupportedUrl(url) {
    if (!url) return false;
    if (this.UNSUPPORTED_PREFIXES.some(p => url.startsWith(p))) return false;
    if (url.startsWith('https://chrome.google.com/webstore')) return false;
    if (url.startsWith('https://chromewebstore.google.com')) return false;
    if (url.endsWith('.pdf')) return false;
    return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
  },

  unsupportedReason(url) {
    if (!url) return 'This page cannot be identified.';
    if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('about:') || url.startsWith('devtools://')) {
      return 'This browser page cannot be modified by extensions.';
    }
    if (url.startsWith('chrome-extension://')) {
      return 'Pages belonging to other extensions cannot be modified.';
    }
    if (url.includes('chrome.google.com/webstore') || url.includes('chromewebstore.google.com')) {
      return 'The Chrome Web Store cannot be modified by extensions.';
    }
    if (url.endsWith('.pdf')) {
      return 'This PDF viewer does not allow script access.';
    }
    return 'This page cannot be modified by extensions.';
  },

  getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return '';
    }
  },

  sanitizeFilename(name) {
    return String(name)
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100) || 'untitled';
  },

  formatDate(date) {
    const d = date || new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  buildFilename({ hostname, title, captureType, date, ext }) {
    const host = this.sanitizeFilename(hostname || 'page');
    const safeTitle = this.sanitizeFilename(title || '');
    const parts = [host];
    if (safeTitle && safeTitle.toLowerCase() !== host.toLowerCase()) parts.push(safeTitle);
    parts.push(captureType || 'capture');
    parts.push(date || this.formatDate());
    return `${parts.join('-')}.${ext || 'png'}`;
  },

  formatBytes(bytes) {
    if (!bytes && bytes !== 0) return 'unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  },

  debounce(fn, wait) {
    let t = null;
    return function debounced(...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  },

  throttle(fn, wait) {
    let last = 0;
    let timeout = null;
    return function throttled(...args) {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        last = now;
        fn.apply(this, args);
      } else {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          last = Date.now();
          fn.apply(this, args);
        }, remaining);
      }
    };
  },

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  },

  hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const bigint = parseInt(clean.length === 3
      ? clean.split('').map(c => c + c).join('')
      : clean, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  },

  rgbToHex(r, g, b) {
    const toHex = v => Utilities.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  },

  mixColors(hexA, hexB, ratio) {
    const a = this.hexToRgb(hexA);
    const b = this.hexToRgb(hexB);
    const r = a.r + (b.r - a.r) * ratio;
    const g = a.g + (b.g - a.g) * ratio;
    const bl = a.b + (b.b - a.b) * ratio;
    return this.rgbToHex(r, g, bl);
  },

  relativeLuminance(hex) {
    const { r, g, b } = this.hexToRgb(hex);
    const norm = [r, g, b].map(v => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * norm[0] + 0.7152 * norm[1] + 0.0722 * norm[2];
  },

  contrastRatio(hexA, hexB) {
    const l1 = this.relativeLuminance(hexA) + 0.05;
    const l2 = this.relativeLuminance(hexB) + 0.05;
    return l1 > l2 ? l1 / l2 : l2 / l1;
  },

  readableTextColor(backgroundHex) {
    const white = this.contrastRatio(backgroundHex, '#ffffff');
    const black = this.contrastRatio(backgroundHex, '#000000');
    return white >= black ? '#ffffff' : '#111111';
  },

  lighten(hex, amount) {
    return this.mixColors(hex, '#ffffff', amount);
  },

  darken(hex, amount) {
    return this.mixColors(hex, '#000000', amount);
  },

  isValidHex(hex) {
    return typeof hex === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex);
  }
};

if (typeof module !== 'undefined') { module.exports = Utilities; }
