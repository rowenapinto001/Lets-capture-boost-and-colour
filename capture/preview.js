/* Screenshot preview page — renders the most recent capture stored in
   chrome.storage.local ("pendingCapture") and offers download/print/copy
   controls. Screenshot data never leaves the device. */

let capture = null;
let pendingCaptureRef = null;
let zoom = 1;

const VIEWER_FRIENDLY_RATIO_THRESHOLD = 3.2;
const VIEWER_FRIENDLY_TARGET_RATIO = 1.35;
const VIEWER_FRIENDLY_MAX_COLUMNS = 6;
const VIEWER_FRIENDLY_MAX_CANVAS_DIMENSION = 16000;

const $ = (id) => document.getElementById(id);

function setStatus(text) {
  $('statusLine').textContent = text;
}

function estimateBytesFromDataUrl(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.round(base64.length * 0.75);
}

function defaultFilename(captureTypeLabel, ext) {
  return Utilities.buildFilename({
    hostname: capture.hostname,
    title: capture.title,
    captureType: captureTypeLabel,
    ext
  });
}

function filenameWithExtension(input, ext) {
  const withoutExt = String(input || 'screenshot').replace(/\.(png|jpe?g)$/i, '');
  return `${Utilities.sanitizeFilename(withoutExt)}.${ext}`;
}

function captureTypeLabel(captureType) {
  if (captureType === 'fullpage' || captureType === 'fullpage-parts') return 'Full page';
  if (captureType === 'selection') return 'Selection';
  return 'Visible area';
}

function captureTypeFilenameLabel(captureType) {
  if (captureType === 'fullpage' || captureType === 'fullpage-parts') return 'fullpage';
  if (captureType === 'selection') return 'selection';
  return 'visible';
}

async function render() {
  const data = await chrome.storage.local.get(['pendingCapture']);
  pendingCaptureRef = data.pendingCapture;
  try {
    capture = await CaptureStore.resolvePendingCapture(pendingCaptureRef);
  } catch (e) {
    console.warn('[LCBC preview] failed to load pending capture', e);
    capture = null;
  }

  if (!capture) {
    showEmptyState(pendingCaptureRef?.stored
      ? 'Screenshot data could not be loaded. Please retake the capture.'
      : 'No screenshot to preview yet.');
    return;
  }
  $('emptyState').classList.add('hidden');

  if (capture.multiPart) {
    renderParts();
  } else {
    renderSingle();
  }
}

function showEmptyState(message) {
  $('emptyState').textContent = message;
  $('emptyState').classList.remove('hidden');
  $('imageWrap').classList.add('hidden');
  $('partsWrap').classList.add('hidden');
}

function fitSingleImageToViewer(img) {
  const viewerWidth = Math.max(1, $('viewer').clientWidth - 32);
  zoom = Utilities.clamp(Math.min(1, viewerWidth / Math.max(1, img.naturalWidth)), 0.05, 1);
  applyZoom();
}

function renderSingle() {
  if (!capture.dataUrl) {
    showEmptyState('Screenshot data is missing. Please retake the capture.');
    return;
  }

  $('imageWrap').classList.remove('hidden');
  $('partsWrap').classList.add('hidden');
  const img = $('previewImage');
  img.src = capture.dataUrl;
  img.onload = () => {
    $('detailDimensions').textContent = `${img.naturalWidth} × ${img.naturalHeight}px`;
    $('detailSize').textContent = Utilities.formatBytes(estimateBytesFromDataUrl(capture.dataUrl));
    fitSingleImageToViewer(img);
  };
  img.onerror = () => showEmptyState('Screenshot preview could not be decoded. Please retake the capture.');
  $('detailType').textContent = captureTypeLabel(capture.captureType);
  $('filenameInput').value = defaultFilename(captureTypeFilenameLabel(capture.captureType), 'png');
}

function renderParts() {
  if (!Array.isArray(capture.parts) || !capture.parts.length) {
    showEmptyState('Screenshot sections are missing. Please retake the capture.');
    return;
  }

  $('imageWrap').classList.add('hidden');
  $('partsWrap').classList.remove('hidden');
  const wrap = $('partsWrap');
  wrap.innerHTML = '';
  let totalBytes = 0;
  capture.parts.forEach((part, i) => {
    totalBytes += estimateBytesFromDataUrl(part.dataUrl);
    const label = document.createElement('div');
    label.className = 'part-label';
    label.textContent = `Part ${i + 1} of ${capture.parts.length} — ${part.width} × ${part.height}px`;
    const img = document.createElement('img');
    img.src = part.dataUrl;
    wrap.appendChild(label);
    wrap.appendChild(img);
  });
  $('detailDimensions').textContent = capture.width && capture.height
    ? `${capture.width} × ${capture.height}px split into ${capture.parts.length} sections`
    : `${capture.parts.length} sections`;
  $('detailSize').textContent = Utilities.formatBytes(totalBytes);
  $('detailType').textContent = 'Full page (multiple parts)';
  $('filenameInput').value = defaultFilename('fullpage-part', 'png');
  setStatus('This page was too large to save as a single image, so it was split into labelled sections.');
}

function applyZoom() {
  if (capture && !capture.multiPart) {
    $('previewImage').style.width = `${zoom * 100}%`;
  }
  $('zoomLevel').textContent = `${Math.round(zoom * 100)}%`;
}

function initZoomControls() {
  $('zoomInBtn').addEventListener('click', () => { zoom = Utilities.clamp(zoom + 0.1, 0.1, 4); applyZoom(); });
  $('zoomOutBtn').addEventListener('click', () => { zoom = Utilities.clamp(zoom - 0.1, 0.1, 4); applyZoom(); });
  $('fitScreenBtn').addEventListener('click', () => {
    if (!capture || capture.multiPart) return;
    const img = $('previewImage');
    const viewerWidth = $('viewer').clientWidth - 32;
    zoom = Utilities.clamp(viewerWidth / img.naturalWidth, 0.05, 4);
    applyZoom();
  });
  $('actualSizeBtn').addEventListener('click', () => { zoom = 1; applyZoom(); });
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)[1];
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function loadDataUrlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode screenshot image.'));
    img.src = dataUrl;
  });
}

async function createViewerFriendlyFullPageExport(dataUrl) {
  if (capture?.captureType !== 'fullpage') {
    return { dataUrl, transformed: false, columns: 1 };
  }

  const img = await loadDataUrlImage(dataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const ratio = height / Math.max(1, width);

  if (ratio <= VIEWER_FRIENDLY_RATIO_THRESHOLD) {
    return { dataUrl, transformed: false, columns: 1 };
  }

  const maxColumnsByWidth = Math.floor(VIEWER_FRIENDLY_MAX_CANVAS_DIMENSION / Math.max(1, width));
  const minColumnsByHeight = Math.ceil(height / VIEWER_FRIENDLY_MAX_CANVAS_DIMENSION);
  const idealColumns = Math.ceil(Math.sqrt(ratio / VIEWER_FRIENDLY_TARGET_RATIO));
  const maxColumns = Math.max(1, Math.min(VIEWER_FRIENDLY_MAX_COLUMNS, maxColumnsByWidth));

  if (maxColumns < minColumnsByHeight) {
    return { dataUrl, transformed: false, columns: 1 };
  }

  const columns = Utilities.clamp(idealColumns, Math.max(2, minColumnsByHeight), maxColumns);
  if (columns <= 1) {
    return { dataUrl, transformed: false, columns: 1 };
  }

  const sliceHeight = Math.ceil(height / columns);
  const canvasWidth = width * columns;
  const canvasHeight = sliceHeight;

  if (canvasWidth > VIEWER_FRIENDLY_MAX_CANVAS_DIMENSION ||
      canvasHeight > VIEWER_FRIENDLY_MAX_CANVAS_DIMENSION) {
    return { dataUrl, transformed: false, columns: 1 };
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  for (let column = 0; column < columns; column++) {
    const sourceY = column * sliceHeight;
    const sourceHeight = Math.min(sliceHeight, height - sourceY);
    if (sourceHeight <= 0) continue;
    ctx.drawImage(img, 0, sourceY, width, sourceHeight, column * width, 0, width, sourceHeight);
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    transformed: true,
    columns
  };
}

function convertToJpeg(dataUrl, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

function downloadDataUrl(dataUrl, filename) {
  chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
}

function initDownloads() {
  $('downloadPngBtn').addEventListener('click', async () => {
    if (!capture) return;
    const base = $('filenameInput').value.trim() || 'screenshot';
    const filename = filenameWithExtension(base, 'png');

    if (capture.multiPart) {
      capture.parts.forEach((part, i) => {
        downloadDataUrl(part.dataUrl, filename.replace(/\.png$/, `-part-${i + 1}.png`));
      });
      setStatus('PNG sections download started.');
    } else {
      try {
        setStatus('Preparing PNG for image viewer...');
        const exportResult = await createViewerFriendlyFullPageExport(capture.dataUrl);
        downloadDataUrl(exportResult.dataUrl, filename);
        setStatus(exportResult.transformed
          ? `PNG download started. The tall page was arranged into ${exportResult.columns} columns so it opens wider in image viewers.`
          : 'PNG download started.');
      } catch (e) {
        console.warn('[LCBC preview] PNG export failed', e);
        downloadDataUrl(capture.dataUrl, filename);
        setStatus('PNG download started with the original full-page layout.');
      }
    }
  });

  $('downloadJpegBtn').addEventListener('click', async () => {
    if (!capture) return;
    const quality = Number($('jpegQuality').value) / 100;
    const base = Utilities.sanitizeFilename($('filenameInput').value.trim().replace(/\.(png|jpe?g)$/i, '') || 'screenshot');

    if (capture.multiPart) {
      for (let i = 0; i < capture.parts.length; i++) {
        const jpegUrl = await convertToJpeg(capture.parts[i].dataUrl, quality);
        downloadDataUrl(jpegUrl, `${Utilities.sanitizeFilename(base)}-part-${i + 1}.jpg`);
      }
      setStatus('JPEG sections download started.');
    } else {
      try {
        setStatus('Preparing JPEG for image viewer...');
        const exportResult = await createViewerFriendlyFullPageExport(capture.dataUrl);
        const jpegUrl = await convertToJpeg(exportResult.dataUrl, quality);
        downloadDataUrl(jpegUrl, `${Utilities.sanitizeFilename(base)}.jpg`);
        setStatus(exportResult.transformed
          ? `JPEG download started. The tall page was arranged into ${exportResult.columns} columns so it opens wider in image viewers.`
          : 'JPEG download started.');
      } catch (e) {
        console.warn('[LCBC preview] JPEG export failed', e);
        const jpegUrl = await convertToJpeg(capture.dataUrl, quality);
        downloadDataUrl(jpegUrl, `${Utilities.sanitizeFilename(base)}.jpg`);
        setStatus('JPEG download started with the original full-page layout.');
      }
    }
  });

  $('jpegQuality').addEventListener('input', (e) => {
    $('jpegQualityValue').textContent = `${e.target.value}%`;
  });

  $('copyImageBtn').addEventListener('click', async () => {
    if (!capture || capture.multiPart) {
      setStatus('Copy is only available for single-image captures.');
      return;
    }
    try {
      if (!window.ClipboardItem || !navigator.clipboard?.write) {
        throw new Error('Clipboard image writing is unavailable.');
      }
      const blob = dataUrlToBlob(capture.dataUrl);
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setStatus('Screenshot copied to clipboard.');
    } catch (e) {
      setStatus('Copying images is not supported in this browser context.');
    }
  });

  $('printBtn').addEventListener('click', () => {
    window.print();
  });
}

function initActions() {
  $('retakeBtn').addEventListener('click', toggleRetakeChoices);
  document.querySelectorAll('[data-retake-kind]').forEach((button) => {
    button.addEventListener('click', () => startRetakeCapture(button.dataset.retakeKind));
  });

  $('deleteBtn').addEventListener('click', async () => {
    await CaptureStore.deletePendingCapture(pendingCaptureRef);
    await chrome.storage.local.remove('pendingCapture');
    await chrome.storage.local.set({ recentCapture: null });
    location.reload();
  });

  $('closeBtn').addEventListener('click', () => window.close());
}

function retakeSourceTabId() {
  return capture?.sourceTabId ?? pendingCaptureRef?.sourceTabId;
}

function toggleRetakeChoices() {
  const tabId = Number(retakeSourceTabId());
  if (!Number.isFinite(tabId)) {
    setStatus('The original page tab is no longer available. Open the extension on the page to capture again.');
    return;
  }

  const choices = $('retakeChoices');
  choices.hidden = !choices.hidden;
  setStatus(choices.hidden ? '' : 'Choose how to retake the screenshot.');
}

function retakeStatusForKind(kind) {
  if (kind === 'full') return 'Returning to the original page and capturing the full page.';
  if (kind === 'visible') return 'Returning to the original page and capturing the visible area.';
  return 'Returning to the original page. Drag over the area to capture.';
}

async function startRetakeCapture(kind) {
  const tabId = Number(retakeSourceTabId());
  if (!Number.isFinite(tabId)) {
    setStatus('The original page tab is no longer available. Open the extension on the page to capture again.');
    return;
  }

  const { captureSettings = {} } = await chrome.storage.local.get(['captureSettings']);
  const appearance =
    capture?.captureAppearance ||
    pendingCaptureRef?.captureAppearance ||
    captureSettings.captureAppearance ||
    'current-theme';

  $('retakeChoices').hidden = true;
  setStatus(retakeStatusForKind(kind));

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_RETAKE_CAPTURE',
      tabId,
      options: {
        kind,
        appearance,
        hideSticky: captureSettings.hideStickyElements !== false,
        restoreScroll: captureSettings.restoreScrollPosition !== false,
        includeBackground: captureSettings.includePageBackground !== false
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Retake could not be started.');
    }

    setStatus(kind === 'selection'
      ? 'Retake started. Select the area on the original page.'
      : 'Retake started. A new preview will open when it finishes.');
  } catch (e) {
    setStatus(e.message || 'Retake could not be started.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initZoomControls();
  initDownloads();
  initActions();
  await render();
});
