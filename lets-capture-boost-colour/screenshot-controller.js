/* Screenshot Controller — runs in the content-script context.
   Handles real full-page and visible-area capture: scrolling, sticky-element
   handling, section stitching via canvas, and optional scroll restoration.
   Actual pixel capture is delegated to the background service worker via
   chrome.tabs.captureVisibleTab (content scripts cannot call it directly). */

const MAX_CANVAS_DIMENSION = 16000;
const MAX_CANVAS_AREA = 268435456; // ~16384 * 16384, conservative Chrome limit
const CAPTURE_THROTTLE_MS = 550; // stay under captureVisibleTab's ~2/sec quota

const ScreenshotController = (() => {
  let stickyHiddenEls = [];
  let scrollStyleEl = null;
  let originalScrollBehavior = null;
  let originalBodyScrollBehavior = null;

  function requestCaptureVisibleTab() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error(response && response.error ? response.error : 'Capture failed.'));
          return;
        }
        resolve(response.dataUrl);
      });
    });
  }

  function findStickyElements() {
    const all = document.querySelectorAll('body *');
    const result = [];
    for (const el of all) {
      const style = getComputedStyle(el);
      if ((style.position === 'fixed' || style.position === 'sticky') &&
          el.offsetWidth > 0 && el.offsetHeight > 0) {
        result.push(el);
      }
    }
    return result;
  }

  function hideStickyElements() {
    if (stickyHiddenEls.length) return;
    stickyHiddenEls = findStickyElements().map(el => ({
      el,
      previousVisibility: el.style.visibility
    }));
    stickyHiddenEls.forEach(({ el }) => { el.style.visibility = 'hidden'; });
  }

  function restoreStickyElements() {
    stickyHiddenEls.forEach(({ el, previousVisibility }) => {
      el.style.visibility = previousVisibility;
    });
    stickyHiddenEls = [];
  }

  function disableSmoothScroll() {
    originalScrollBehavior = document.documentElement.style.scrollBehavior;
    originalBodyScrollBehavior = document.body ? document.body.style.scrollBehavior : '';
    document.documentElement.style.scrollBehavior = 'auto';
    if (document.body) document.body.style.scrollBehavior = 'auto';
  }

  function restoreSmoothScroll() {
    document.documentElement.style.scrollBehavior = originalScrollBehavior || '';
    if (document.body) document.body.style.scrollBehavior = originalBodyScrollBehavior || '';
  }

  function hideScrollbars() {
    if (scrollStyleEl) return;
    scrollStyleEl = document.createElement('style');
    scrollStyleEl.id = 'lcbc-capture-scrollbar-hide';
    scrollStyleEl.textContent = `
      html, body { scrollbar-width: none !important; }
      html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; }
    `;
    document.documentElement.appendChild(scrollStyleEl);
  }

  function restoreScrollbars() {
    if (scrollStyleEl) scrollStyleEl.remove();
    scrollStyleEl = null;
  }

  function getPageMetrics() {
    const body = document.body || document.documentElement;
    const html = document.documentElement;
    const fullWidth = Math.max(
      body.scrollWidth,
      html.scrollWidth,
      body.offsetWidth,
      html.offsetWidth,
      window.innerWidth
    );
    const fullHeight = Math.max(
      body.scrollHeight,
      html.scrollHeight,
      body.offsetHeight,
      html.offsetHeight,
      window.innerHeight
    );
    return {
      fullWidth,
      fullHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      originalScrollX: window.scrollX,
      originalScrollY: window.scrollY
    };
  }

  function getPageBackground() {
    const candidates = [document.body, document.documentElement].filter(Boolean);
    for (const el of candidates) {
      const color = getComputedStyle(el).backgroundColor;
      if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
        return color;
      }
    }
    return '#ffffff';
  }

  function fillBackground(ctx, width, height, includeBackground) {
    if (!includeBackground) return;
    ctx.save();
    ctx.fillStyle = getPageBackground();
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  async function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode captured image.'));
      img.src = dataUrl;
    });
  }

  function buildScrollPositions(totalSize, viewportSize) {
    const maxScroll = Math.max(0, totalSize - viewportSize);
    if (maxScroll === 0) return [0];

    const positions = [];
    for (let pos = 0; pos < totalSize; pos += viewportSize) {
      positions.push(Math.min(pos, maxScroll));
    }
    if (positions[positions.length - 1] !== maxScroll) positions.push(maxScroll);
    return Array.from(new Set(positions.map(v => Math.max(0, Math.round(v)))));
  }

  function buildChunkStarts(totalSize, chunkSize) {
    const starts = [];
    for (let pos = 0; pos < totalSize; pos += chunkSize) starts.push(pos);
    return starts.length ? starts : [0];
  }

  function buildRangeScrollPositions(rangeStart, rangeSize, viewportSize, totalSize) {
    const rangeEnd = rangeStart + rangeSize;
    const maxScroll = Math.max(0, totalSize - viewportSize);
    const positions = [];
    let pos = rangeStart;

    while (pos < rangeEnd) {
      positions.push(Math.min(pos, maxScroll));
      pos += viewportSize;
    }

    positions.push(Math.min(Math.max(0, rangeEnd - viewportSize), maxScroll));
    return Array.from(new Set(positions.map(v => Math.max(0, Math.round(v))))).sort((a, b) => a - b);
  }

  function drawCapturedTile(ctx, img, scrollX, scrollY, originX, originY, outputWidth, outputHeight, dpr) {
    const srcX = Math.max(0, Math.round((originX - scrollX) * dpr));
    const srcY = Math.max(0, Math.round((originY - scrollY) * dpr));
    const destX = Math.max(0, Math.round((scrollX - originX) * dpr));
    const destY = Math.max(0, Math.round((scrollY - originY) * dpr));
    const drawWidth = Math.min(img.width - srcX, outputWidth - destX);
    const drawHeight = Math.min(img.height - srcY, outputHeight - destY);

    if (drawWidth > 0 && drawHeight > 0) {
      ctx.drawImage(img, srcX, srcY, drawWidth, drawHeight, destX, destY, drawWidth, drawHeight);
    }
  }

  async function captureTile(scrollX, scrollY) {
    window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' });
    await Utilities.wait(CAPTURE_THROTTLE_MS);
    await Utilities.wait(140); // allow lazy-loaded content and repaints to settle
    const dataUrl = await requestCaptureVisibleTab();
    return loadImage(dataUrl);
  }

  async function withThemeAppearance(appearance, fn) {
    const wasApplied = window.ThemeEngine && ThemeEngine.isApplied();
    let removedTheme = null;
    let previousThemeAttr = null;

    if (appearance === 'original' && wasApplied) {
      removedTheme = document.getElementById(ThemeEngine.THEME_STYLE_ID);
      previousThemeAttr = document.documentElement.getAttribute(ThemeEngine.THEME_ATTR);
      if (removedTheme) removedTheme.remove();
      document.documentElement.removeAttribute(ThemeEngine.THEME_ATTR);
    }

    try {
      return await fn();
    } finally {
      if (removedTheme) {
        document.documentElement.appendChild(removedTheme);
        document.documentElement.setAttribute(ThemeEngine.THEME_ATTR, previousThemeAttr || 'restored');
      }
    }
  }

  async function captureIntoCanvas({
    xPositions,
    yPositions,
    originX,
    originY,
    outputWidth,
    outputHeight,
    dpr,
    includeBackground,
    hideSticky,
    onProgress,
    progressPrefix = 'Capturing section',
    totalOffset = 0,
    totalCount
  }) {
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    fillBackground(ctx, outputWidth, outputHeight, includeBackground);

    let completed = 0;
    const total = totalCount || xPositions.length * yPositions.length;

    for (let yIndex = 0; yIndex < yPositions.length; yIndex++) {
      if (hideSticky && yIndex > 0) hideStickyElements();

      for (let xIndex = 0; xIndex < xPositions.length; xIndex++) {
        completed++;
        const absoluteCurrent = totalOffset + completed;
        const scrollX = xPositions[xIndex];
        const scrollY = yPositions[yIndex];
        onProgress({
          current: absoluteCurrent,
          total,
          message: `${progressPrefix} ${absoluteCurrent} of ${total}...`
        });

        const img = await captureTile(scrollX, scrollY);
        drawCapturedTile(ctx, img, scrollX, scrollY, originX, originY, outputWidth, outputHeight, dpr);
      }
    }

    return canvas;
  }

  return {
    async captureVisibleArea({ appearance = 'current-theme' } = {}) {
      return withThemeAppearance(appearance, async () => {
        await Utilities.wait(80);
        const dataUrl = await requestCaptureVisibleTab();
        const img = await loadImage(dataUrl);
        return {
          dataUrl,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          captureType: 'visible'
        };
      });
    },

    async captureFullPage({
      appearance = 'current-theme',
      hideSticky = true,
      restoreScroll = true,
      includeBackground = true,
      onProgress = () => {}
    } = {}) {
      return withThemeAppearance(appearance, async () => {
        const metrics = getPageMetrics();
        const { fullWidth, fullHeight, viewportWidth, viewportHeight, dpr, originalScrollX, originalScrollY } = metrics;

        const outputWidth = Math.round(fullWidth * dpr);
        const outputHeight = Math.round(fullHeight * dpr);

        if (outputWidth > MAX_CANVAS_DIMENSION || outputHeight > MAX_CANVAS_DIMENSION ||
            outputWidth * outputHeight > MAX_CANVAS_AREA) {
          return this.captureFullPageInParts({
            appearance,
            hideSticky,
            restoreScroll,
            includeBackground,
            onProgress,
            metrics
          });
        }

        disableSmoothScroll();
        hideScrollbars();

        try {
          const xPositions = buildScrollPositions(fullWidth, viewportWidth);
          const yPositions = buildScrollPositions(fullHeight, viewportHeight);
          const total = xPositions.length * yPositions.length;
          const canvas = await captureIntoCanvas({
            xPositions,
            yPositions,
            originX: 0,
            originY: 0,
            outputWidth,
            outputHeight,
            dpr,
            includeBackground,
            hideSticky,
            onProgress,
            totalCount: total
          });

          const finalDataUrl = canvas.toDataURL('image/png');
          return {
            dataUrl: finalDataUrl,
            width: outputWidth,
            height: outputHeight,
            captureType: 'fullpage'
          };
        } finally {
          if (hideSticky) restoreStickyElements();
          restoreScrollbars();
          restoreSmoothScroll();
          if (restoreScroll) window.scrollTo(originalScrollX, originalScrollY);
        }
      });
    },

    async captureFullPageInParts({
      hideSticky,
      restoreScroll,
      includeBackground,
      onProgress,
      metrics
    }) {
      const { fullWidth, fullHeight, viewportWidth, viewportHeight, dpr, originalScrollX, originalScrollY } = metrics;
      const partCssWidth = Math.min(fullWidth, viewportWidth);
      const maxHeightByArea = Math.floor(MAX_CANVAS_AREA / Math.max(1, Math.round(partCssWidth * dpr)) / dpr);
      const partCssHeight = Math.max(
        viewportHeight,
        Math.min(fullHeight, Math.min(Math.floor(MAX_CANVAS_DIMENSION / dpr), maxHeightByArea))
      );

      const xStarts = buildChunkStarts(fullWidth, partCssWidth);
      const yStarts = buildChunkStarts(fullHeight, partCssHeight);
      const plannedParts = xStarts.length * yStarts.length;

      disableSmoothScroll();
      hideScrollbars();

      const parts = [];
      let partNumber = 0;

      try {
        for (let yPart = 0; yPart < yStarts.length; yPart++) {
          for (let xPart = 0; xPart < xStarts.length; xPart++) {
            partNumber++;
            const originX = xStarts[xPart];
            const originY = yStarts[yPart];
            const partWidthCss = Math.min(partCssWidth, fullWidth - originX);
            const partHeightCss = Math.min(partCssHeight, fullHeight - originY);
            const outputWidth = Math.round(partWidthCss * dpr);
            const outputHeight = Math.round(partHeightCss * dpr);

            if (outputWidth > MAX_CANVAS_DIMENSION || outputHeight > MAX_CANVAS_DIMENSION ||
                outputWidth * outputHeight > MAX_CANVAS_AREA) {
              throw new Error('This page is too large to capture safely, even when divided into sections.');
            }

            const xPositions = buildRangeScrollPositions(originX, partWidthCss, viewportWidth, fullWidth);
            const yPositions = buildRangeScrollPositions(originY, partHeightCss, viewportHeight, fullHeight);
            const tileTotal = xPositions.length * yPositions.length;

            const canvas = await captureIntoCanvas({
              xPositions,
              yPositions,
              originX,
              originY,
              outputWidth,
              outputHeight,
              dpr,
              includeBackground,
              hideSticky,
              onProgress: (payload) => {
                onProgress({
                  current: partNumber,
                  total: plannedParts,
                  message: `Capturing part ${partNumber} of ${plannedParts}: ${payload.message.replace('Capturing section ', 'section ')}`
                });
              },
              totalCount: tileTotal
            });

            parts.push({
              dataUrl: canvas.toDataURL('image/png'),
              width: outputWidth,
              height: outputHeight,
              partIndex: partNumber,
              gridX: xPart + 1,
              gridY: yPart + 1
            });
          }
        }

        return {
          parts,
          multiPart: true,
          totalParts: plannedParts,
          width: Math.round(fullWidth * dpr),
          height: Math.round(fullHeight * dpr),
          captureType: 'fullpage-parts',
          message: 'This page is too large to save as one image. It has been exported in multiple labelled sections.'
        };
      } finally {
        if (hideSticky) restoreStickyElements();
        restoreScrollbars();
        restoreSmoothScroll();
        if (restoreScroll) window.scrollTo(originalScrollX, originalScrollY);
      }
    }
  };
})();

if (typeof module !== 'undefined') { module.exports = ScreenshotController; }
