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
  let activeSelectionCancel = null;

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

  function selectVisibleRect() {
    if (activeSelectionCancel) activeSelectionCancel();

    return new Promise((resolve, reject) => {
      const overlay = document.createElement('div');
      const box = document.createElement('div');
      const hint = document.createElement('div');
      const previousCursor = document.documentElement.style.cursor;
      const previousUserSelect = document.documentElement.style.userSelect;
      let settled = false;
      let dragging = false;
      let pointerId = null;
      let startX = 0;
      let startY = 0;
      let currentRect = null;

      overlay.id = 'lcbc-selection-capture-overlay';
      overlay.setAttribute('role', 'presentation');
      overlay.setAttribute('data-lcbc-ignore', '');
      overlay.style.cssText = [
        'position: fixed',
        'inset: 0',
        'z-index: 2147483647',
        'cursor: crosshair',
        'background: rgba(15, 23, 42, 0.18)',
        'pointer-events: auto',
        'touch-action: none'
      ].join(';');

      box.style.cssText = [
        'position: fixed',
        'display: none',
        'border: 2px solid #FFFFFF',
        'background: rgba(255, 255, 255, 0.08)',
        'box-shadow: 0 0 0 99999px rgba(15, 23, 42, 0.52), 0 0 0 1px rgba(0, 0, 0, 0.45) inset',
        'pointer-events: none'
      ].join(';');

      hint.textContent = 'Drag to select area. Esc cancels.';
      hint.style.cssText = [
        'position: fixed',
        'left: 50%',
        'top: 18px',
        'transform: translateX(-50%)',
        'padding: 8px 12px',
        'border-radius: 999px',
        'background: rgba(15, 23, 42, 0.88)',
        'color: #FFFFFF',
        'font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        'box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28)',
        'pointer-events: none'
      ].join(';');

      overlay.appendChild(box);
      overlay.appendChild(hint);

      const clampToViewport = (value, max) => Math.min(Math.max(0, value), max);

      const updateBox = (clientX, clientY) => {
        const x = clampToViewport(clientX, window.innerWidth);
        const y = clampToViewport(clientY, window.innerHeight);
        const left = Math.min(startX, x);
        const top = Math.min(startY, y);
        const width = Math.abs(x - startX);
        const height = Math.abs(y - startY);
        currentRect = { left, top, width, height };
        box.style.display = 'block';
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
      };

      const cleanup = () => {
        document.removeEventListener('keydown', onKeyDown, true);
        overlay.removeEventListener('pointerdown', onPointerDown, true);
        overlay.removeEventListener('pointermove', onPointerMove, true);
        overlay.removeEventListener('pointerup', onPointerUp, true);
        overlay.removeEventListener('pointercancel', onCancel, true);
        document.documentElement.style.cursor = previousCursor;
        document.documentElement.style.userSelect = previousUserSelect;
        overlay.remove();
        activeSelectionCancel = null;
      };

      const finish = (result, error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(result);
      };

      function onPointerDown(event) {
        if (event.button !== 0) return;
        event.preventDefault();
        pointerId = event.pointerId;
        dragging = true;
        startX = clampToViewport(event.clientX, window.innerWidth);
        startY = clampToViewport(event.clientY, window.innerHeight);
        overlay.setPointerCapture(pointerId);
        updateBox(event.clientX, event.clientY);
      }

      function onPointerMove(event) {
        if (!dragging || event.pointerId !== pointerId) return;
        event.preventDefault();
        updateBox(event.clientX, event.clientY);
      }

      function onPointerUp(event) {
        if (!dragging || event.pointerId !== pointerId) return;
        event.preventDefault();
        dragging = false;
        updateBox(event.clientX, event.clientY);
        if (!currentRect || currentRect.width < 8 || currentRect.height < 8) {
          finish(null, new Error('Selection is too small. Drag a larger area and try again.'));
          return;
        }
        finish(currentRect);
      }

      function onCancel() {
        finish(null, new Error('Selection capture was cancelled.'));
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }

      activeSelectionCancel = onCancel;
      document.documentElement.style.cursor = 'crosshair';
      document.documentElement.style.userSelect = 'none';
      overlay.addEventListener('pointerdown', onPointerDown, true);
      overlay.addEventListener('pointermove', onPointerMove, true);
      overlay.addEventListener('pointerup', onPointerUp, true);
      overlay.addEventListener('pointercancel', onCancel, true);
      document.addEventListener('keydown', onKeyDown, true);
      document.documentElement.appendChild(overlay);
    });
  }

  async function captureSelectionRect(rect, { appearance = 'current-theme' } = {}) {
    return withThemeAppearance(appearance, async () => {
      await Utilities.wait(90);
      const dataUrl = await requestCaptureVisibleTab();
      const img = await loadImage(dataUrl);
      const scaleX = img.width / Math.max(1, window.innerWidth);
      const scaleY = img.height / Math.max(1, window.innerHeight);
      const sourceX = Math.max(0, Math.round(rect.left * scaleX));
      const sourceY = Math.max(0, Math.round(rect.top * scaleY));
      const sourceWidth = Math.min(img.width - sourceX, Math.max(1, Math.round(rect.width * scaleX)));
      const sourceHeight = Math.min(img.height - sourceY, Math.max(1, Math.round(rect.height * scaleY)));
      const canvas = document.createElement('canvas');
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

      return {
        dataUrl: canvas.toDataURL('image/png'),
        width: sourceWidth,
        height: sourceHeight,
        captureType: 'selection'
      };
    });
  }

  async function saveCaptureFromPage(result, openPreview, appearance) {
    const capture = {
      ...(result.multiPart
        ? { multiPart: true, parts: result.parts }
        : { dataUrl: result.dataUrl }),
      width: result.width,
      height: result.height,
      captureType: result.captureType,
      hostname: location.hostname || 'page',
      title: document.title,
      sourceUrl: location.href,
      captureAppearance: appearance
    };

    await chrome.runtime.sendMessage({
      type: 'OPEN_PREVIEW',
      capture,
      recentCapture: {
        captureType: result.captureType,
        hostname: capture.hostname,
        width: result.width,
        height: result.height
      },
      openPreview
    });
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

    async startSelectionCapture({
      appearance = 'current-theme',
      openPreview = true,
      onProgress = () => {}
    } = {}) {
      onProgress({ current: 0, total: 2, message: 'Drag over the area to capture...' });
      const rect = await selectVisibleRect();
      onProgress({ current: 1, total: 2, message: 'Capturing selected area...' });
      const result = await captureSelectionRect(rect, { appearance });
      await saveCaptureFromPage(result, openPreview, appearance);
      onProgress({ current: 2, total: 2, message: 'Selection capture created successfully.' });
      return result;
    },

    async saveCaptureResult(result, {
      appearance = 'current-theme',
      openPreview = true
    } = {}) {
      await saveCaptureFromPage(result, openPreview, appearance);
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
