/* Screenshot preview page — renders the most recent capture stored in
   chrome.storage.local ("pendingCapture") and offers download/print/copy
   controls. Screenshot data never leaves the device. */

let capture = null;
let zoom = 1;

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

async function render() {
  const data = await chrome.storage.local.get(['pendingCapture']);
  capture = data.pendingCapture;

  if (!capture) {
    $('emptyState').classList.remove('hidden');
    return;
  }
  $('emptyState').classList.add('hidden');

  if (capture.multiPart) {
    renderParts();
  } else {
    renderSingle();
  }
}

function renderSingle() {
  $('imageWrap').classList.remove('hidden');
  $('partsWrap').classList.add('hidden');
  const img = $('previewImage');
  img.src = capture.dataUrl;
  img.onload = () => {
    $('detailDimensions').textContent = `${img.naturalWidth} × ${img.naturalHeight}px`;
    $('detailSize').textContent = Utilities.formatBytes(estimateBytesFromDataUrl(capture.dataUrl));
  };
  $('detailType').textContent = capture.captureType === 'fullpage' ? 'Full page' : 'Visible area';
  $('filenameInput').value = defaultFilename(capture.captureType === 'fullpage' ? 'fullpage' : 'visible', 'png');
  applyZoom();
}

function renderParts() {
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
  $('downloadPngBtn').addEventListener('click', () => {
    if (!capture) return;
    const base = $('filenameInput').value.trim() || 'screenshot';
    const filename = filenameWithExtension(base, 'png');

    if (capture.multiPart) {
      capture.parts.forEach((part, i) => {
        downloadDataUrl(part.dataUrl, filename.replace(/\.png$/, `-part-${i + 1}.png`));
      });
    } else {
      downloadDataUrl(capture.dataUrl, filename);
    }
    setStatus('PNG download started.');
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
    } else {
      const jpegUrl = await convertToJpeg(capture.dataUrl, quality);
      downloadDataUrl(jpegUrl, `${Utilities.sanitizeFilename(base)}.jpg`);
    }
    setStatus('JPEG download started.');
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
  $('retakeBtn').addEventListener('click', async () => {
    await chrome.storage.local.remove('pendingCapture');
    window.close();
  });

  $('deleteBtn').addEventListener('click', async () => {
    await chrome.storage.local.remove('pendingCapture');
    await chrome.storage.local.set({ recentCapture: null });
    location.reload();
  });

  $('closeBtn').addEventListener('click', () => window.close());
}

document.addEventListener('DOMContentLoaded', async () => {
  initZoomControls();
  initDownloads();
  initActions();
  await render();
});
