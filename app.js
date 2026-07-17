const canvas = document.querySelector("#photoCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });

const emptyState = document.querySelector("#emptyState");
const sourceMeta = document.querySelector("#sourceMeta");
const sizeMeta = document.querySelector("#sizeMeta");
const cameraDock = document.querySelector("#cameraDock");
const cameraStream = document.querySelector("#cameraStream");

const controls = {
  exposure: document.querySelector("#exposure"),
  contrast: document.querySelector("#contrast"),
  clarity: document.querySelector("#clarity"),
  saturation: document.querySelector("#saturation"),
  warmth: document.querySelector("#warmth"),
  tint: document.querySelector("#tint"),
};

const outputs = {
  exposure: document.querySelector("#exposureValue"),
  contrast: document.querySelector("#contrastValue"),
  clarity: document.querySelector("#clarityValue"),
  saturation: document.querySelector("#saturationValue"),
  warmth: document.querySelector("#warmthValue"),
  tint: document.querySelector("#tintValue"),
};

const presets = {
  fresh: {
    exposure: 0,
    contrast: 8,
    clarity: 10,
    saturation: 18,
    warmth: 8,
    tint: 0,
  },
  cinema: {
    exposure: -5,
    contrast: 24,
    clarity: 22,
    saturation: 8,
    warmth: -10,
    tint: 6,
  },
  chrome: {
    exposure: 10,
    contrast: 32,
    clarity: 25,
    saturation: -6,
    warmth: -4,
    tint: -4,
  },
  soft: {
    exposure: 8,
    contrast: -8,
    clarity: 4,
    saturation: 12,
    warmth: 15,
    tint: 4,
  },
};

let activeStream = null;
let activePreset = "fresh";
let renderQueued = false;

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

function updateMeta(sourceLabel) {
  sourceMeta.textContent = sourceLabel;
  sizeMeta.textContent = `${sourceCanvas.width} x ${sourceCanvas.height}`;
}

function updateOutputs() {
  Object.entries(controls).forEach(([key, input]) => {
    outputs[key].textContent = input.value;
  });
}

function getSettings() {
  return Object.fromEntries(
    Object.entries(controls).map(([key, input]) => [key, Number(input.value)]),
  );
}

function setControls(values) {
  Object.entries(values).forEach(([key, value]) => {
    controls[key].value = String(value);
  });
  updateOutputs();
  queueRender();
}

function markPreset(name) {
  activePreset = name;
  document.querySelectorAll(".preset").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === name);
  });
}

function markCustomPreset() {
  if (!activePreset) return;
  activePreset = "";
  document.querySelectorAll(".preset").forEach((button) => {
    button.classList.remove("active");
  });
}

function resizeSource(width, height) {
  const maxEdge = 1800;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));

  sourceCanvas.width = nextWidth;
  sourceCanvas.height = nextHeight;
  canvas.width = nextWidth;
  canvas.height = nextHeight;
}

function setSourceFromDrawable(drawable, width, height, label) {
  resizeSource(width, height);
  sourceCtx.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  sourceCtx.drawImage(drawable, 0, 0, sourceCanvas.width, sourceCanvas.height);
  canvas.style.aspectRatio = `${sourceCanvas.width} / ${sourceCanvas.height}`;
  emptyState.hidden = true;
  updateMeta(label);
  queueRender();
}

function drawSampleImage() {
  resizeSource(1280, 860);

  const sky = sourceCtx.createLinearGradient(0, 0, 0, 520);
  sky.addColorStop(0, "#99c7dd");
  sky.addColorStop(0.54, "#d9c28a");
  sky.addColorStop(1, "#524f58");
  sourceCtx.fillStyle = sky;
  sourceCtx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);

  sourceCtx.fillStyle = "rgba(255, 243, 202, 0.88)";
  sourceCtx.beginPath();
  sourceCtx.arc(1025, 165, 74, 0, Math.PI * 2);
  sourceCtx.fill();

  sourceCtx.fillStyle = "#2d3140";
  sourceCtx.beginPath();
  sourceCtx.moveTo(0, 520);
  sourceCtx.lineTo(230, 260);
  sourceCtx.lineTo(420, 510);
  sourceCtx.lineTo(610, 310);
  sourceCtx.lineTo(860, 535);
  sourceCtx.lineTo(1280, 380);
  sourceCtx.lineTo(1280, 860);
  sourceCtx.lineTo(0, 860);
  sourceCtx.closePath();
  sourceCtx.fill();

  const field = sourceCtx.createLinearGradient(0, 470, 0, 860);
  field.addColorStop(0, "#345a54");
  field.addColorStop(0.48, "#a67f4a");
  field.addColorStop(1, "#24231f");
  sourceCtx.fillStyle = field;
  sourceCtx.beginPath();
  sourceCtx.moveTo(0, 550);
  sourceCtx.bezierCurveTo(310, 480, 460, 620, 760, 535);
  sourceCtx.bezierCurveTo(940, 485, 1100, 515, 1280, 445);
  sourceCtx.lineTo(1280, 860);
  sourceCtx.lineTo(0, 860);
  sourceCtx.closePath();
  sourceCtx.fill();

  sourceCtx.fillStyle = "rgba(10, 12, 14, 0.3)";
  for (let i = 0; i < 46; i += 1) {
    const x = (i * 37) % 1280;
    const y = 605 + ((i * 29) % 180);
    sourceCtx.fillRect(x, y, 4, 95 + (i % 9) * 8);
  }

  sourceCtx.fillStyle = "rgba(255, 245, 212, 0.2)";
  for (let i = 0; i < 18; i += 1) {
    sourceCtx.beginPath();
    sourceCtx.ellipse(110 + i * 67, 640 + Math.sin(i) * 42, 34, 6, 0.1, 0, Math.PI * 2);
    sourceCtx.fill();
  }

  canvas.style.aspectRatio = `${sourceCanvas.width} / ${sourceCanvas.height}`;
  emptyState.hidden = true;
  updateMeta("Sample");
  queueRender();
}

function transformPixels(sourceImage, settings) {
  const data = sourceImage.data;
  const output = new Uint8ClampedArray(data.length);
  const exposure = 2 ** (settings.exposure / 100);
  const contrastValue = Math.max(-254, Math.min(254, settings.contrast * 1.6));
  const contrast = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const saturation = 1 + settings.saturation / 100;
  const warmth = settings.warmth * 0.45;
  const tint = settings.tint * 0.34;

  for (let i = 0; i < data.length; i += 4) {
    let red = data[i] * exposure;
    let green = data[i + 1] * exposure;
    let blue = data[i + 2] * exposure;

    red = contrast * (red - 128) + 128;
    green = contrast * (green - 128) + 128;
    blue = contrast * (blue - 128) + 128;

    red += warmth;
    blue -= warmth;
    green += tint;
    red -= tint * 0.28;
    blue -= tint * 0.28;

    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    red = luminance + (red - luminance) * saturation;
    green = luminance + (green - luminance) * saturation;
    blue = luminance + (blue - luminance) * saturation;

    output[i] = clamp(red);
    output[i + 1] = clamp(green);
    output[i + 2] = clamp(blue);
    output[i + 3] = data[i + 3];
  }

  return output;
}

function applyClarity(pixels, width, height, amount) {
  if (amount <= 0) return pixels;

  const strength = amount / 90;
  const sharpened = new Uint8ClampedArray(pixels);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const center = pixels[index + channel] * 5;
        const north = pixels[index - width * 4 + channel];
        const south = pixels[index + width * 4 + channel];
        const west = pixels[index - 4 + channel];
        const east = pixels[index + 4 + channel];
        const sharpen = center - north - south - west - east;
        sharpened[index + channel] = clamp(
          pixels[index + channel] * (1 - strength) + sharpen * strength,
        );
      }
    }
  }

  return sharpened;
}

function renderImage() {
  renderQueued = false;

  if (!sourceCanvas.width || !sourceCanvas.height) {
    emptyState.hidden = false;
    return;
  }

  const sourceImage = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const settings = getSettings();
  const coloured = transformPixels(sourceImage, settings);
  const finalPixels = applyClarity(
    coloured,
    sourceCanvas.width,
    sourceCanvas.height,
    settings.clarity,
  );
  const outputImage = new ImageData(finalPixels, sourceCanvas.width, sourceCanvas.height);

  ctx.putImageData(outputImage, 0, 0);
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(renderImage);
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image could not be loaded."));
    };
    image.src = url;
  });
}

async function loadUploadedImage(event) {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const image = await decodeImage(file);
    const width = image.width || image.videoWidth;
    const height = image.height || image.videoHeight;
    setSourceFromDrawable(image, width, height, file.name);
    if ("close" in image) image.close();
  } catch (error) {
    emptyState.hidden = false;
    emptyState.querySelector("strong").textContent = "That image did not load.";
    emptyState.querySelector("span").textContent = error.message;
  } finally {
    event.target.value = "";
  }
}

async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    emptyState.hidden = false;
    emptyState.querySelector("strong").textContent = "Camera is unavailable.";
    emptyState.querySelector("span").textContent = "Use image upload instead.";
    return;
  }

  closeCamera();
  activeStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment",
      width: { ideal: 1280 },
      height: { ideal: 860 },
    },
    audio: false,
  });
  cameraStream.srcObject = activeStream;
  cameraDock.hidden = false;
}

function closeCamera() {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
  }
  activeStream = null;
  cameraStream.srcObject = null;
  cameraDock.hidden = true;
}

function captureFrame() {
  if (!cameraStream.videoWidth || !cameraStream.videoHeight) return;

  setSourceFromDrawable(
    cameraStream,
    cameraStream.videoWidth,
    cameraStream.videoHeight,
    "Camera",
  );
}

function downloadImage() {
  if (!canvas.width || !canvas.height) return;

  const link = document.createElement("a");
  link.download = "capture-boost-colour.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

Object.entries(controls).forEach(([key, input]) => {
  input.addEventListener("input", () => {
    updateOutputs();
    const preset = presets[activePreset];
    if (!preset || Number(input.value) !== preset[key]) {
      markCustomPreset();
    }
    queueRender();
  });
});

document.querySelectorAll(".preset").forEach((button) => {
  button.addEventListener("click", () => {
    const presetName = button.dataset.preset;
    markPreset(presetName);
    setControls(presets[presetName]);
  });
});

document.querySelector("#resetControls").addEventListener("click", () => {
  markPreset("fresh");
  setControls(presets.fresh);
});

document.querySelector("#imageUpload").addEventListener("change", loadUploadedImage);
document.querySelector("#openCamera").addEventListener("click", () => {
  openCamera().catch((error) => {
    emptyState.hidden = false;
    emptyState.querySelector("strong").textContent = "Camera access was blocked.";
    emptyState.querySelector("span").textContent = error.message;
  });
});
document.querySelector("#closeCamera").addEventListener("click", closeCamera);
document.querySelector("#captureFrame").addEventListener("click", captureFrame);
document.querySelector("#downloadImage").addEventListener("click", downloadImage);

window.addEventListener("beforeunload", closeCamera);

updateOutputs();
drawSampleImage();
