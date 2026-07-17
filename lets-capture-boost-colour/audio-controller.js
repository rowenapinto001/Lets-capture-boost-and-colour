/* Audio Controller — runs in the content-script context.
   Uses the Web Audio API to boost/mute/reset volume for media elements
   on the current tab. Never touches other tabs or system volume. */

const AudioController = (() => {
  let audioContext = null;
  const connections = new WeakMap(); // media element -> { source, gain, restricted }
  const trackedElements = new Set();
  let currentVolume = 100;
  let isMuted = false;
  let volumeBeforeMute = 100;
  let observer = null;
  let scanScheduled = false;

  function getContext() {
    if (!audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioContext = new Ctx();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  function findMediaElements() {
    return Array.from(document.querySelectorAll('audio, video'));
  }

  function disconnectEntry(entry, keepNormalOutput) {
    if (!entry || entry.restricted || !entry.source) return;
    try { entry.source.disconnect(); } catch (e) { /* already disconnected */ }
    if (entry.gain) {
      try { entry.gain.disconnect(); } catch (e) { /* already disconnected */ }
      entry.gain = null;
    }
    if (keepNormalOutput) {
      try { entry.source.connect(getContext().destination); } catch (e) { /* output may already be connected */ }
    }
  }

  function pruneTrackedElements() {
    trackedElements.forEach((el) => {
      if (document.contains(el)) return;
      const entry = connections.get(el);
      disconnectEntry(entry, false);
      connections.delete(el);
      trackedElements.delete(el);
    });
  }

  function connectElement(el) {
    trackedElements.add(el);

    const existing = connections.get(el);
    if (existing) {
      if (existing.restricted) return existing;
      if (!existing.gain) {
        try { existing.source.disconnect(); } catch (e) { /* was not connected */ }
        existing.gain = getContext().createGain();
        existing.source.connect(existing.gain);
        existing.gain.connect(getContext().destination);
      }
      applyGainToEntry(existing);
      return existing;
    }

    try {
      const ctx = getContext();
      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      const entry = { source, gain, restricted: false };
      connections.set(el, entry);
      applyGainToEntry(entry);
      return entry;
    } catch (e) {
      const entry = { source: null, gain: null, restricted: true, error: e.message };
      connections.set(el, entry);
      return entry;
    }
  }

  function applyGainToEntry(entry) {
    if (!entry || !entry.gain) return;
    const effective = isMuted ? 0 : currentVolume / 100;
    entry.gain.gain.value = effective;
  }

  function applyToAll({ connectForBoost = true } = {}) {
    pruneTrackedElements();
    const elements = findMediaElements();
    let connectedCount = 0;
    let restrictedCount = 0;
    const needsGain = connectForBoost && !isMuted && currentVolume !== 100;

    elements.forEach(el => {
      let entry = connections.get(el);

      if (needsGain) {
        entry = connectElement(el);
      } else {
        trackedElements.add(el);
      }

      if (entry?.restricted) {
        restrictedCount++;
        el.muted = isMuted || currentVolume === 0;
        return;
      }

      if (entry?.gain) {
        connectedCount++;
        applyGainToEntry(entry);
        el.muted = false;
      } else {
        el.muted = isMuted || currentVolume === 0;
      }
    });

    return { total: elements.length, connected: connectedCount, restricted: restrictedCount };
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    setTimeout(() => {
      scanScheduled = false;
      applyToAll({ connectForBoost: currentVolume !== 100 || isMuted });
    }, 400);
  }

  function ensureObserver() {
    if (observer) return;
    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  return {
    setVolume(percent) {
      const nextVolume = Utilities.clamp(percent, 0, 300);
      if (nextVolume > 0) volumeBeforeMute = nextVolume;
      currentVolume = nextVolume;
      isMuted = currentVolume === 0;
      ensureObserver();
      return { ...applyToAll({ connectForBoost: currentVolume !== 100 && !isMuted }), ...this.getStatus() };
    },

    getVolume() {
      return currentVolume;
    },

    mute() {
      if (isMuted) return this.getStatus();
      volumeBeforeMute = currentVolume > 0 ? currentVolume : volumeBeforeMute;
      isMuted = true;
      ensureObserver();
      applyToAll({ connectForBoost: false });
      return this.getStatus();
    },

    unmute() {
      if (!isMuted) return this.getStatus();
      isMuted = false;
      currentVolume = volumeBeforeMute || 100;
      ensureObserver();
      applyToAll({ connectForBoost: currentVolume !== 100 });
      return this.getStatus();
    },

    toggleMute() {
      return isMuted ? this.unmute() : this.mute();
    },

    reset() {
      currentVolume = 100;
      isMuted = false;
      volumeBeforeMute = 100;

      trackedElements.forEach(el => {
        const entry = connections.get(el);
        if (entry && !entry.restricted) {
          disconnectEntry(entry, true);
        }
        el.muted = false;
      });

      if (observer) observer.disconnect();
      observer = null;
      return this.getStatus();
    },

    getStatus() {
      pruneTrackedElements();
      const elements = findMediaElements();
      let restricted = 0;
      let connected = 0;
      elements.forEach(el => {
        const entry = connections.get(el);
        if (entry?.restricted) restricted++;
        if (entry?.gain) connected++;
      });
      return {
        volume: currentVolume,
        muted: isMuted,
        mediaCount: elements.length,
        connectedCount: connected,
        restrictedCount: restricted
      };
    },

    scan() {
      ensureObserver();
      return this.getStatus();
    }
  };
})();

if (typeof module !== 'undefined') { module.exports = AudioController; }
