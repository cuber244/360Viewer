import { Viewer } from "@photo-sphere-viewer/core";

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
let gyroState = {
  enabled: false,
  dragging: false,
  latest: null,
  targetYaw: 0,
  targetPitch: 0,
  currentYaw: 0,
  currentPitch: 0,
  yawOffset: 0,
  pitchOffset: 0,
  animationFrame: 0,
};

const MAX_PANORAMA_WIDTH = 8192;
const DEG_TO_RAD = Math.PI / 180;
const GYRO_SMOOTHING = 0.16;
const MIN_FOV = 30;
const MAX_FOV = 150;
const RESET_FOV = 60;
const RESET_ZOOM = ((MAX_FOV - RESET_FOV) / (MAX_FOV - MIN_FOV)) * 100;

function setStatus(message, warning = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("warning", warning);
}

function enableControls() {
  emptyState.classList.add("is-hidden");
  resetButton.disabled = false;
  fullscreenButton.disabled = false;
  gyroButton.disabled = false;
  updateGyroButton();
}

function updateGyroButton() {
  gyroButton.textContent = gyroState.enabled ? "Gyro On" : "Gyro";
  gyroButton.classList.toggle("is-active", gyroState.enabled);
}

function createViewer(panorama) {
  viewer = new Viewer({
    container: viewerEl,
    panorama,
    defaultYaw: 0,
    defaultPitch: 0,
    defaultZoomLvl: RESET_ZOOM,
    minFov: MIN_FOV,
    maxFov: MAX_FOV,
    mousewheel: true,
    moveInertia: true,
    moveSpeed: 2.2,
    mousemove: true,
    touchmoveTwoFingers: false,
    navbar: ["zoom", "move", "caption", "fullscreen"],
    caption: "Drag or swipe to rotate",
  });
}

function normalizeRadians(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getOrientationHeading(event) {
  if (typeof event.webkitCompassHeading === "number") {
    return event.webkitCompassHeading;
  }
  if (typeof event.alpha === "number") {
    return 360 - event.alpha;
  }
  return null;
}

function getOrientationPitch(event) {
  if (typeof event.beta !== "number") return 0;

  const screenAngle = screen.orientation?.angle ?? window.orientation ?? 0;
  if (Math.abs(screenAngle) === 90 && typeof event.gamma === "number") {
    return clamp(event.gamma * DEG_TO_RAD, -1.25, 1.25);
  }

  return clamp((event.beta - 90) * DEG_TO_RAD, -1.25, 1.25);
}

function getGyroTarget(event) {
  const heading = getOrientationHeading(event);
  if (heading === null) return null;

  const headingYaw = normalizeRadians(heading * DEG_TO_RAD);
  return {
    headingYaw,
    rawPitch: getOrientationPitch(event),
    yaw: normalizeRadians(headingYaw + gyroState.yawOffset),
    pitch: clamp(getOrientationPitch(event) + gyroState.pitchOffset, -1.25, 1.25),
  };
}

function recenterGyroTo(yaw = 0, pitch = 0) {
  if (!gyroState.latest) {
    gyroState.yawOffset = yaw;
    gyroState.pitchOffset = pitch;
    return;
  }

  const target = getGyroTarget(gyroState.latest);
  if (!target) return;

  gyroState.yawOffset = normalizeRadians(yaw - target.headingYaw);
  gyroState.pitchOffset = clamp(pitch - target.rawPitch, -1.25, 1.25);
  gyroState.targetYaw = yaw;
  gyroState.targetPitch = pitch;
  gyroState.currentYaw = yaw;
  gyroState.currentPitch = pitch;
}

function onDeviceOrientation(event) {
  if (!gyroState.enabled || !viewer) return;

  gyroState.latest = event;
  const target = getGyroTarget(event);
  if (!target) return;

  gyroState.targetYaw = target.yaw;
  gyroState.targetPitch = target.pitch;
}

function startGyroRenderLoop() {
  if (gyroState.animationFrame) return;

  const render = () => {
    gyroState.animationFrame = 0;

    if (!gyroState.enabled || !viewer) return;

    if (!gyroState.dragging) {
      const yawDelta = normalizeRadians(gyroState.targetYaw - gyroState.currentYaw);
      const pitchDelta = gyroState.targetPitch - gyroState.currentPitch;

      gyroState.currentYaw = normalizeRadians(
        gyroState.currentYaw + yawDelta * GYRO_SMOOTHING,
      );
      gyroState.currentPitch = clamp(
        gyroState.currentPitch + pitchDelta * GYRO_SMOOTHING,
        -1.25,
        1.25,
      );

      viewer.rotate({
        yaw: gyroState.currentYaw,
        pitch: gyroState.currentPitch,
      });
    }

    gyroState.animationFrame = requestAnimationFrame(render);
  };

  gyroState.animationFrame = requestAnimationFrame(render);
}

function stopGyro() {
  window.removeEventListener("deviceorientation", onDeviceOrientation);
  if (gyroState.animationFrame) {
    cancelAnimationFrame(gyroState.animationFrame);
    gyroState.animationFrame = 0;
  }
  gyroState.enabled = false;
  updateGyroButton();
}

function setupDragOffsetTracking() {
  viewerEl.addEventListener("pointerdown", () => {
    if (gyroState.enabled) {
      gyroState.dragging = true;
    }
  });

  window.addEventListener("pointerup", () => {
    if (!gyroState.enabled || !gyroState.dragging || !viewer) return;

    gyroState.dragging = false;
    const position = viewer.getPosition();
    recenterGyroTo(position.yaw, position.pitch);
  });

  window.addEventListener("pointercancel", () => {
    gyroState.dragging = false;
  });
}

setupDragOffsetTracking();

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
  const wasGyroEnabled = gyroState.enabled;

  if (wasGyroEnabled) {
    recenterGyroTo(0, 0);
  }

  viewer?.animate({
    yaw: 0,
    pitch: 0,
    zoom: RESET_ZOOM,
    speed: "6rpm",
  });

  setStatus(
    wasGyroEnabled
      ? "Viewpoint reset. Gyro remains active, and drag still works."
      : "Viewpoint reset.",
  );
});

gyroButton.addEventListener("click", async () => {
  if (!viewer) return;

  if (!window.isSecureContext) {
    setStatus("Gyro requires HTTPS. Open this viewer from GitHub Pages on iPhone.", true);
    return;
  }

  if (!("DeviceOrientationEvent" in window)) {
    setStatus("Gyro is not available in this browser.", true);
    return;
  }

  try {
    if (gyroState.enabled) {
      stopGyro();
      setStatus("Gyro off. Drag and swipe still work.");
    } else {
      setStatus("Requesting motion permission...");

      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== "granted") {
          setStatus("Motion permission was denied.", true);
          return;
        }
      }

      const position = viewer.getPosition();
      gyroState.latest = null;
      gyroState.yawOffset = position.yaw;
      gyroState.pitchOffset = position.pitch;
      gyroState.targetYaw = position.yaw;
      gyroState.targetPitch = position.pitch;
      gyroState.currentYaw = position.yaw;
      gyroState.currentPitch = position.pitch;
      gyroState.enabled = true;
      window.addEventListener("deviceorientation", onDeviceOrientation, true);
      startGyroRenderLoop();
      updateGyroButton();
      setStatus("Gyro on. Turn your phone to look around. Drag and swipe still work.");
    }
  } catch {
    setStatus("Could not start gyro. Check Safari motion permission settings.", true);
  } finally {
    updateGyroButton();
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
  stopGyro();
  viewer?.destroy();
});
