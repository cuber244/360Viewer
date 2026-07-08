import { Viewer } from "@photo-sphere-viewer/core";
import { GyroscopePlugin } from "@photo-sphere-viewer/gyroscope-plugin";

const viewerEl = document.querySelector("#viewer");
const emptyState = document.querySelector("#emptyState");
const statusEl = document.querySelector("#status");
const fileNameEl = document.querySelector("#fileName");
const imageSizeEl = document.querySelector("#imageSize");
const resetButton = document.querySelector("#resetView");
const fullscreenButton = document.querySelector("#fullscreen");
const gyroButton = document.querySelector("#gyroToggle");
const demoButton = document.querySelector("#demoPhoto");
const inputs = [
  document.querySelector("#photoInput"),
  document.querySelector("#photoInputCompact"),
];

let viewer;
let currentUrl;

const MAX_PANORAMA_WIDTH = 8192;

function setStatus(message, warning = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("warning", warning);
}

function enableControls() {
  emptyState.classList.add("is-hidden");
  resetButton.disabled = false;
  fullscreenButton.disabled = false;
  gyroButton.disabled = false;
  updateGyroscopeButton();
}

function getGyroscope() {
  return viewer?.getPlugin("gyroscope");
}

function updateGyroscopeButton() {
  const gyroscope = getGyroscope();
  const enabled = Boolean(gyroscope?.isEnabled());
  gyroButton.textContent = enabled ? "Gyro On" : "Gyro";
  gyroButton.classList.toggle("is-active", enabled);
}

function createViewer(panorama) {
  viewer = new Viewer({
    container: viewerEl,
    panorama,
    defaultYaw: 0,
    defaultPitch: 0,
    defaultZoomLvl: 35,
    mousewheel: true,
    moveInertia: true,
    mousemove: true,
    touchmoveTwoFingers: false,
    navbar: ["zoom", "move", "gyroscope", "caption", "fullscreen"],
    caption: "Drag or swipe to rotate",
    lang: {
      gyroscope: "Gyroscope",
    },
    plugins: [
      GyroscopePlugin.withConfig({
        touchmove: true,
        roll: true,
        absolutePosition: false,
        moveMode: "smooth",
      }),
    ],
  });

  const gyroscope = getGyroscope();
  gyroscope?.addEventListener("gyroscope-updated", updateGyroscopeButton);
}

function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the selected image."));
    };
    img.src = url;
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the selected image."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not prepare the panorama image."));
    }, type, quality);
  });
}

async function preparePanoramaFile(file, size) {
  if (size.width <= MAX_PANORAMA_WIDTH) {
    return {
      url: URL.createObjectURL(file),
      width: size.width,
      height: size.height,
      resized: false,
    };
  }

  setStatus("Large photo detected. Preparing a browser-friendly copy...");

  const img = await loadImage(file);
  const scale = MAX_PANORAMA_WIDTH / size.width;
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await canvasToBlob(canvas);
  return {
    url: URL.createObjectURL(blob),
    width,
    height,
    resized: true,
  };
}

function getRatioWarning({ width, height }) {
  if (!width || !height) return "";

  const ratio = width / height;
  return Math.abs(ratio - 2) > 0.08
    ? " The image is not close to a 2:1 ratio, so it may look distorted."
    : "";
}

async function setPanorama(url, meta) {
  if (!viewer) {
    createViewer(url);
  } else {
    await viewer.setPanorama(url, {
      transition: false,
      caption: "Drag or swipe to rotate",
      position: { yaw: 0, pitch: 0 },
    });
  }

  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = url;

  fileNameEl.textContent = meta.name;
  imageSizeEl.textContent = `${meta.width} x ${meta.height}px`;
  enableControls();
}

async function loadFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Please select an image file.", true);
    return;
  }

  setStatus("Loading photo...");

  try {
    const size = await readImageSize(file);
    const prepared = await preparePanoramaFile(file, size);

    await setPanorama(prepared.url, {
      name: file.name,
      width: prepared.width,
      height: prepared.height,
    });

    const warning = getRatioWarning(size);
    const resizeNote = prepared.resized
      ? ` Display copy was resized from ${size.width} x ${size.height}px.`
      : "";
    setStatus(
      warning
        ? `Loaded.${warning}${resizeNote}`
        : `Loaded. Use drag, swipe, mouse wheel, or pinch to explore.${resizeNote}`,
      Boolean(warning),
    );
  } catch (error) {
    setStatus(error.message || "Failed to load the photo.", true);
  } finally {
    inputs.forEach((input) => {
      input.value = "";
    });
  }
}

function makeDemoPanorama() {
  const width = 4096;
  const height = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#3d7edb");
  sky.addColorStop(0.48, "#8bd4ce");
  sky.addColorStop(0.5, "#d7bd7b");
  sky.addColorStop(1, "#4d6b47");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 18; i += 1) {
    const x = (i / 18) * width;
    const mountainHeight = 180 + (i % 5) * 34;
    ctx.fillStyle = i % 2 ? "#365269" : "#4b645b";
    ctx.beginPath();
    ctx.moveTo(x - 220, height * 0.5);
    ctx.lineTo(x + 40, height * 0.5 - mountainHeight);
    ctx.lineTo(x + 320, height * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255, 244, 191, 0.92)";
  ctx.beginPath();
  ctx.arc(width * 0.72, height * 0.22, 82, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.84)";
  for (let i = 0; i < 12; i += 1) {
    const x = ((i * 359) % width) + 80;
    const y = 210 + ((i * 83) % 360);
    ctx.beginPath();
    ctx.ellipse(x, y, 115, 26, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 72, y + 10, 82, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(16, 18, 23, 0.5)";
  ctx.font = "700 92px system-ui, sans-serif";
  ctx.fillText("FRONT", width * 0.48, height * 0.5 - 70);
  ctx.fillText("BACK", width * 0.02, height * 0.5 - 70);
  ctx.fillText("BACK", width * 0.92, height * 0.5 - 70);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        url: URL.createObjectURL(blob),
        name: "demo-panorama.jpg",
        width,
        height,
      });
    }, "image/jpeg", 0.9);
  });
}

inputs.forEach((input) => {
  input.addEventListener("change", (event) => {
    loadFile(event.target.files?.[0]);
  });
});

demoButton.addEventListener("click", async () => {
  setStatus("Generating demo...");
  const demo = await makeDemoPanorama();
  await setPanorama(demo.url, demo);
  setStatus("Demo loaded. Drag or swipe to rotate.");
});

resetButton.addEventListener("click", () => {
  const gyroscope = getGyroscope();
  const wasGyroEnabled = Boolean(gyroscope?.isEnabled());

  viewer?.animate({
    yaw: 0,
    pitch: 0,
    zoom: 35,
    speed: "6rpm",
  });

  setStatus(
    wasGyroEnabled
      ? "Viewpoint reset. Gyroscope remains active, and drag still works."
      : "Viewpoint reset.",
  );
});

gyroButton.addEventListener("click", async () => {
  const gyroscope = getGyroscope();
  if (!gyroscope) return;

  if (!window.isSecureContext) {
    setStatus("Gyroscope requires HTTPS. It will work on GitHub Pages.", true);
    return;
  }

  try {
    if (gyroscope.isEnabled()) {
      gyroscope.stop();
      setStatus("Gyroscope off. Drag and swipe still work.");
    } else {
      setStatus("Requesting gyroscope permission...");
      await gyroscope.start("smooth");
      setStatus("Gyroscope on. You can still drag or swipe to adjust the view.");
    }
  } catch {
    setStatus("Gyroscope is not available or permission was denied.", true);
  } finally {
    updateGyroscopeButton();
  }
});

fullscreenButton.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
});

window.addEventListener("beforeunload", () => {
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  viewer?.destroy();
});
