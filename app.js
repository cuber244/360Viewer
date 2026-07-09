import { Viewer } from "@photo-sphere-viewer/core";
import { VideoPlugin } from "@photo-sphere-viewer/video-plugin";
import { EquirectangularVideoAdapter } from "@photo-sphere-viewer/equirectangular-video-adapter";
import * as THREE from "three";

const viewerEl = document.querySelector("#viewer");
const projectionCanvas = document.querySelector("#projectionCanvas");
const emptyState = document.querySelector("#emptyState");
const statusEl = document.querySelector("#status");
const fileNameEl = document.querySelector("#fileName");
const imageSizeEl = document.querySelector("#imageSize");
const resetButton = document.querySelector("#resetView");
const fullscreenButton = document.querySelector("#fullscreen");
const gyroButton = document.querySelector("#gyroToggle");
const demoButton = document.querySelector("#demoPhoto");
const yawOffsetInput = document.querySelector("#yawOffset");
const rollOffsetInput = document.querySelector("#rollOffset");
const pitchOffsetInput = document.querySelector("#pitchOffset");
const yawOffsetValue = document.querySelector("#yawOffsetValue");
const rollOffsetValue = document.querySelector("#rollOffsetValue");
const pitchOffsetValue = document.querySelector("#pitchOffsetValue");
const resetCorrectionButton = document.querySelector("#resetCorrection");
const planetSensitivityPanel = document.querySelector("#planetSensitivityPanel");
const planetSensitivityInput = document.querySelector("#planetSensitivity");
const planetSensitivityValue = document.querySelector("#planetSensitivityValue");
const stitchPanel = document.querySelector("#stitchPanel");
const stitchBlendInput = document.querySelector("#stitchBlend");
const stitchBlendValue = document.querySelector("#stitchBlendValue");
const stitchCropInput = document.querySelector("#stitchCrop");
const stitchCropValue = document.querySelector("#stitchCropValue");
const projectionButtons = [...document.querySelectorAll(".projection-mode")];
const inputs = [
  document.querySelector("#photoInput"),
  document.querySelector("#photoInputCompact"),
];

let viewer;
let currentUrl;
let currentMode = null;
let currentMeta = null;
let projectionMode = "normal";
let gyroState = {
  enabled: false,
  dragging: false,
  latest: null,
  targetYaw: 0,
  targetPitch: 0,
  targetRoll: 0,
  currentYaw: 0,
  currentPitch: 0,
  currentRoll: 0,
  yawOffset: 0,
  pitchOffset: 0,
  animationFrame: 0,
};
let correctionState = {
  yaw: 0,
  roll: 0,
  pitch: 0,
};
let planetSensitivity = Number(planetSensitivityInput?.value || 135) / 100;
let stitchBlendDegrees = Number(stitchBlendInput?.value || 0);
let stitchCropScale = Number(stitchCropInput?.value || 91) / 100;
let currentDualFisheyeFile = null;
let currentDualFisheyeSize = null;
let stitchUpdateTimer = 0;
let projectionState = {
  yaw: 0,
  pitch: 0,
  zoom: 1.15,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  texture: null,
  backTexture: null,
  video: null,
  backVideo: null,
  trackSelectionSupported: true,
  sourceVideoWasPlaying: false,
  material: null,
  renderer: null,
  scene: null,
  camera: null,
  animationFrame: 0,
};
let projectionPointers = new Map();
let projectionPinchDistance = 0;

const MAX_PANORAMA_WIDTH = 8192;
const MAX_INSP_CONVERSION_WIDTH = 4096;
const DEG_TO_RAD = Math.PI / 180;
const GYRO_SMOOTHING = 0.16;
const MIN_FOV = 30;
const MAX_FOV = 140;
const RESET_FOV = 60;
const RESET_ZOOM = ((MAX_FOV - RESET_FOV) / (MAX_FOV - MIN_FOV)) * 100;

function setStatus(message, warning = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("warning", warning);
}

function enableControls() {
  document.querySelector("#emptyState")?.classList.add("is-hidden");
  document.querySelector("#resetView")?.removeAttribute("disabled");
  document.querySelector("#fullscreen")?.removeAttribute("disabled");
  document.querySelector("#gyroToggle")?.removeAttribute("disabled");
  document.querySelector("#resetCorrection")?.removeAttribute("disabled");
  projectionButtons.forEach((button) => button.removeAttribute("disabled"));
  updateGyroButton();
}

function updateProjectionButtons() {
  projectionButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.projection === projectionMode);
  });
  planetSensitivityPanel?.classList.toggle("is-active", projectionMode === "planet");
  stitchPanel?.classList.toggle(
    "is-active",
    Boolean(currentMeta?.convertedFromDualFisheye || ["dualFisheye", "dualFisheyeTracks"].includes(currentMeta?.layout)),
  );
}

function setNormalProjectionVisible(visible) {
  viewerEl.style.display = visible ? "" : "none";
  projectionCanvas.classList.toggle("is-active", !visible);
  if (visible) {
    stopProjectionRenderer();
  }
}

function formatDegrees(value) {
  const number = Number(value);
  return `${Number.isInteger(number) ? number : number.toFixed(1)}deg`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "live";

  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function updateCorrectionLabels() {
  yawOffsetValue.textContent = formatDegrees(correctionState.yaw);
  rollOffsetValue.textContent = formatDegrees(correctionState.roll);
  pitchOffsetValue.textContent = formatDegrees(correctionState.pitch);
}

function applyPhotoCorrection() {
  updateCorrectionLabels();
  viewer?.setOption("sphereCorrection", {
    pan: `${correctionState.yaw}deg`,
    roll: `${correctionState.roll}deg`,
    tilt: `${correctionState.pitch}deg`,
  });
}

function updateGyroButton() {
  const button = document.querySelector("#gyroToggle");
  if (!button) return;
  button.textContent = gyroState.enabled ? "Gyro On" : "Gyro";
  button.classList.toggle("is-active", gyroState.enabled);
}

function getCommonViewerConfig(panorama) {
  return {
    container: viewerEl,
    panorama,
    defaultYaw: 0,
    defaultPitch: 0,
    defaultZoomLvl: RESET_ZOOM,
    minFov: MIN_FOV,
    maxFov: MAX_FOV,
    sphereCorrection: {
      pan: `${correctionState.yaw}deg`,
      roll: `${correctionState.roll}deg`,
      tilt: `${correctionState.pitch}deg`,
    },
    mousewheel: true,
    moveInertia: true,
    moveSpeed: 2.2,
    zoomSpeed: 1.5,
    mousemove: true,
    touchmoveTwoFingers: false,
  };
}

function createViewer(panorama, mode) {
  currentMode = mode;

  if (mode === "video") {
    viewer = new Viewer({
      ...getCommonViewerConfig(panorama),
      adapter: EquirectangularVideoAdapter.withConfig({
        autoplay: false,
        muted: false,
      }),
      plugins: [
        VideoPlugin.withConfig({
          progressbar: true,
          bigbutton: false,
        }),
      ],
      navbar: ["videoPlay", "videoTime", "videoVolume", "zoom", "move", "fullscreen"],
    });
    return;
  }

  viewer = new Viewer({
    ...getCommonViewerConfig(panorama),
    navbar: ["zoom", "move", "fullscreen"],
  });
}

function normalizeRadians(value) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getProjectionZoomRange() {
  return projectionMode === "planet"
    ? { min: 0.08, max: 12.0 }
    : { min: 0.35, max: 3.5 };
}

function getProjectionDragSensitivity() {
  if (projectionMode !== "planet") return 0.006;

  const baseZoom = 1.55;
  const zoomRatio = projectionState.zoom / baseZoom;
  return clamp(
    0.0065 * planetSensitivity * Math.pow(Math.max(0.05, zoomRatio), 1.4),
    0.0002,
    0.024,
  );
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
    roll: 0,
  };
}

function recenterGyroTo(yaw = 0, pitch = 0) {
  if (!gyroState.latest) {
    gyroState.yawOffset = yaw;
    gyroState.pitchOffset = pitch;
    gyroState.targetRoll = 0;
    gyroState.currentRoll = 0;
    viewer?.dynamics?.roll?.goto(0, 30);
    return;
  }

  const target = getGyroTarget(gyroState.latest);
  if (!target) return;

  gyroState.yawOffset = normalizeRadians(yaw - target.headingYaw);
  gyroState.pitchOffset = clamp(pitch - target.rawPitch, -1.25, 1.25);
  gyroState.targetYaw = yaw;
  gyroState.targetPitch = pitch;
  gyroState.targetRoll = 0;
  gyroState.currentYaw = yaw;
  gyroState.currentPitch = pitch;
  gyroState.currentRoll = 0;
}

function onDeviceOrientation(event) {
  if (!gyroState.enabled || !viewer) return;

  gyroState.latest = event;
  const target = getGyroTarget(event);
  if (!target) return;

  gyroState.targetYaw = target.yaw;
  gyroState.targetPitch = target.pitch;
  gyroState.targetRoll = target.roll;
}

function startGyroRenderLoop() {
  if (gyroState.animationFrame) return;

  const render = () => {
    gyroState.animationFrame = 0;

    if (!gyroState.enabled || !viewer) return;

    if (!gyroState.dragging) {
      const yawDelta = normalizeRadians(gyroState.targetYaw - gyroState.currentYaw);
      const pitchDelta = gyroState.targetPitch - gyroState.currentPitch;
      const rollDelta = gyroState.targetRoll - gyroState.currentRoll;

      gyroState.currentYaw = normalizeRadians(
        gyroState.currentYaw + yawDelta * GYRO_SMOOTHING,
      );
      gyroState.currentPitch = clamp(
        gyroState.currentPitch + pitchDelta * GYRO_SMOOTHING,
        -1.25,
        1.25,
      );
      gyroState.currentRoll = clamp(
        gyroState.currentRoll + rollDelta * GYRO_SMOOTHING,
        -Math.PI,
        Math.PI,
      );

      viewer.rotate({
        yaw: gyroState.currentYaw,
        pitch: gyroState.currentPitch,
      });
      viewer.dynamics?.roll?.setValue(gyroState.currentRoll);
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
  gyroState.targetRoll = 0;
  gyroState.currentRoll = 0;
  viewer?.dynamics?.roll?.goto(0, 30);
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

function disposeProjectionTexture() {
  if (projectionState.animationFrame) {
    cancelAnimationFrame(projectionState.animationFrame);
    projectionState.animationFrame = 0;
  }
  projectionState.texture?.dispose();
  projectionState.texture = null;
  projectionState.backTexture?.dispose();
  projectionState.backTexture = null;
  if (projectionState.video) {
    projectionState.video.pause();
    projectionState.video.removeAttribute("src");
    projectionState.video.load();
  }
  projectionState.video = null;
  if (projectionState.backVideo) {
    projectionState.backVideo.pause();
    projectionState.backVideo.removeAttribute("src");
    projectionState.backVideo.load();
  }
  projectionState.backVideo = null;
  projectionState.trackSelectionSupported = true;
  projectionState.sourceVideoWasPlaying = false;
}

function stopProjectionRenderer() {
  disposeProjectionTexture();
  projectionState.material?.dispose();
  projectionState.material = null;
  projectionState.renderer?.dispose();
  projectionState.renderer = null;
  projectionState.scene = null;
  projectionState.camera = null;
}

function createProjectionMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      panorama: { value: texture },
      panoramaBack: { value: texture },
      aspect: { value: 1 },
      yaw: { value: 0 },
      pitch: { value: 0 },
      roll: { value: 0 },
      zoom: { value: 1 },
      mode: { value: 0 },
      seamInset: { value: 0.0005 },
      sourceLayout: { value: 0 },
      stitchBlend: { value: 24 * DEG_TO_RAD },
      stitchCrop: { value: 0.9 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform sampler2D panorama;
      uniform sampler2D panoramaBack;
      uniform float aspect;
      uniform float yaw;
      uniform float pitch;
      uniform float roll;
      uniform float zoom;
      uniform int mode;
      uniform float seamInset;
      uniform int sourceLayout;
      uniform float stitchBlend;
      uniform float stitchCrop;
      varying vec2 vUv;

      const float PI = 3.141592653589793;

      mat3 rotX(float a) {
        float s = sin(a);
        float c = cos(a);
        return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
      }

      mat3 rotY(float a) {
        float s = sin(a);
        float c = cos(a);
        return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
      }

      mat3 rotZ(float a) {
        float s = sin(a);
        float c = cos(a);
        return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
      }

      vec3 planet(vec2 p) {
        float r2 = dot(p, p);
        return normalize(vec3(2.0 * p.x, 1.0 - r2, 2.0 * p.y));
      }

      vec2 equirectUv(vec3 dir) {
        float lon = atan(dir.x, dir.z);
        float lat = asin(clamp(dir.y, -1.0, 1.0));
        vec2 uv = vec2(0.5 + lon / (2.0 * PI), 0.5 - lat / PI);
        uv.x = fract(uv.x);
        uv.x = uv.x * (1.0 - 2.0 * seamInset) + seamInset;
        uv.y = clamp(uv.y, 0.0, 1.0);
        return uv;
      }

      vec2 dualFisheyeUvForLens(vec3 dir, float frontSign) {
        float lensZ = frontSign * dir.z;
        float theta = acos(clamp(lensZ, -1.0, 1.0));
        float phi = atan(dir.y, frontSign * dir.x);
        float radius = (theta / (PI * 0.5)) * 0.25 * stitchCrop;
        float centerX = frontSign > 0.0 ? 0.25 : 0.75;
        return vec2(centerX + radius * cos(phi), 0.5 - radius * sin(phi));
      }

      vec2 singleFisheyeUvForLens(vec3 dir, float frontSign) {
        float lensZ = frontSign * dir.z;
        float theta = acos(clamp(lensZ, -1.0, 1.0));
        float phi = atan(dir.y, frontSign * dir.x);
        float radius = (theta / (PI * 0.5)) * 0.5 * stitchCrop;
        return vec2(0.5 + radius * cos(phi), 0.5 - radius * sin(phi));
      }

      float dualFisheyeWeight(vec3 dir, float frontSign) {
        float theta = acos(clamp(frontSign * dir.z, -1.0, 1.0));
        return smoothstep(PI * 0.5 + stitchBlend, PI * 0.5 - stitchBlend, theta);
      }

      void main() {
        vec2 p = (vUv * 2.0 - 1.0);
        p.x *= aspect;
        p *= zoom;

        vec3 dir;
        if (mode == 0) {
          dir = normalize(vec3(p.x, -p.y, 1.0));
        } else {
          dir = planet(p);
        }
        dir = rotY(yaw) * rotX(pitch) * rotZ(roll) * dir;

        if (sourceLayout == 2) {
          vec2 leftUv = singleFisheyeUvForLens(dir, 1.0);
          vec2 rightUv = singleFisheyeUvForLens(dir, -1.0);
          float leftWeight = dualFisheyeWeight(dir, 1.0);
          float rightWeight = dualFisheyeWeight(dir, -1.0);
          vec4 leftColor = texture2D(panorama, leftUv);
          vec4 rightColor = texture2D(panoramaBack, rightUv);
          gl_FragColor = mix(leftColor, rightColor, rightWeight / max(leftWeight + rightWeight, 0.0001));
        } else if (sourceLayout == 1) {
          vec2 leftUv = dualFisheyeUvForLens(dir, 1.0);
          vec2 rightUv = dualFisheyeUvForLens(dir, -1.0);
          float leftWeight = dualFisheyeWeight(dir, 1.0);
          float rightWeight = dualFisheyeWeight(dir, -1.0);
          vec4 leftColor = texture2D(panorama, leftUv);
          vec4 rightColor = texture2D(panorama, rightUv);
          gl_FragColor = mix(leftColor, rightColor, rightWeight / max(leftWeight + rightWeight, 0.0001));
        } else {
          vec2 uv = equirectUv(dir);
          gl_FragColor = texture2D(panorama, uv);
        }
        #include <colorspace_fragment>
      }
    `,
  });
}

async function createProjectionTexture() {
  if (!currentUrl || !currentMode) return null;

  if (currentMode === "video") {
    const sourcePlugin = viewer?.getPlugin("video");
    projectionState.sourceVideoWasPlaying = currentMeta?.layout === "dualFisheye" || Boolean(sourcePlugin?.isPlaying());
    const sourceTime = sourcePlugin?.getTime?.() ?? 0;
    sourcePlugin?.pause();

    const video = await createProjectionVideo(0);
    if (Number.isFinite(sourceTime)) {
      video.currentTime = sourceTime;
    }
    projectionState.video = video;
    const texture = createConfiguredVideoTexture(video);

    if (currentMeta?.layout === "dualFisheyeTracks") {
      const backVideo = await createProjectionVideo(1);
      if (Number.isFinite(sourceTime)) {
        backVideo.currentTime = sourceTime;
      }
      backVideo.muted = true;
      projectionState.backVideo = backVideo;
      projectionState.backTexture = createConfiguredVideoTexture(backVideo);
    }

    return texture;
  }

  const texture = await new THREE.TextureLoader().loadAsync(currentUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

async function createProjectionVideo(trackIndex = 0) {
  const video = document.createElement("video");
  video.src = currentUrl;
  video.loop = true;
  video.muted = false;
  video.playsInline = true;
  video.preload = "metadata";
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Could not load the video projection."));
  });

  if (currentMeta?.layout === "dualFisheyeTracks") {
    const tracks = video.videoTracks;
    if (tracks && tracks.length > trackIndex) {
      for (let i = 0; i < tracks.length; i += 1) {
        tracks[i].selected = i === trackIndex;
      }
    } else {
      projectionState.trackSelectionSupported = false;
    }
  }

  return video;
}

function createConfiguredVideoTexture(video) {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function resizeProjectionRenderer() {
  if (!projectionState.renderer || !projectionState.material) return;

  const rect = projectionCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * window.devicePixelRatio));
  const height = Math.max(1, Math.round(rect.height * window.devicePixelRatio));
  projectionState.renderer.setSize(width, height, false);
  projectionState.material.uniforms.aspect.value = rect.width / Math.max(1, rect.height);
}

async function startProjectionRenderer(mode) {
  stopProjectionRenderer();
  projectionMode = mode;
  updateProjectionButtons();
  setNormalProjectionVisible(false);

  projectionState.texture = await createProjectionTexture();
  if (!projectionState.texture) return;

  projectionState.renderer = new THREE.WebGLRenderer({
    canvas: projectionCanvas,
    antialias: true,
  });
  projectionState.renderer.setPixelRatio(window.devicePixelRatio || 1);
  projectionState.renderer.outputColorSpace = THREE.SRGBColorSpace;
  projectionState.renderer.toneMapping = THREE.NoToneMapping;
  projectionState.scene = new THREE.Scene();
  projectionState.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  projectionState.material = createProjectionMaterial(projectionState.texture);
  projectionState.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), projectionState.material));
  projectionState.zoom = mode === "planet" ? 1.55 : 0.58;
  resizeProjectionRenderer();

  const render = () => {
    projectionState.animationFrame = requestAnimationFrame(render);
    projectionState.material.uniforms.yaw.value = projectionState.yaw + correctionState.yaw * DEG_TO_RAD;
    projectionState.material.uniforms.pitch.value = mode === "planet" ? -projectionState.pitch : projectionState.pitch;
    projectionState.material.uniforms.roll.value = correctionState.roll * DEG_TO_RAD;
    projectionState.material.uniforms.zoom.value = projectionState.zoom;
    projectionState.material.uniforms.mode.value = mode === "planet" ? 1 : 0;
    projectionState.material.uniforms.sourceLayout.value = currentMeta?.layout === "dualFisheyeTracks"
      ? 2
      : currentMeta?.layout === "dualFisheye" ? 1 : 0;
    projectionState.material.uniforms.panoramaBack.value = projectionState.backTexture || projectionState.texture;
    projectionState.material.uniforms.stitchBlend.value = stitchBlendDegrees * DEG_TO_RAD;
    projectionState.material.uniforms.stitchCrop.value = stitchCropScale;
    projectionState.material.uniforms.seamInset.value = Math.max(
      0.0005,
      3 / Math.max(1, currentMeta?.width || 4096),
    );
    projectionState.renderer.render(projectionState.scene, projectionState.camera);
  };
  render();

  if (projectionState.video && projectionState.sourceVideoWasPlaying) {
    projectionState.video.play().catch(() => {});
    projectionState.backVideo?.play().catch(() => {});
  }
  setStatus(
    !projectionState.trackSelectionSupported && currentMeta?.layout === "dualFisheyeTracks"
      ? "This browser cannot select the second INSV video track. Direct INSV preview is limited here; export a stitched MP4 from Insta360 Studio or use a local converter."
      : `${mode === "planet" ? "Planet" : "Normal"} projection mode.`,
    !projectionState.trackSelectionSupported && currentMeta?.layout === "dualFisheyeTracks",
  );
}

function setProjectionMode(mode) {
  if (!["normal", "planet"].includes(mode)) {
    mode = "normal";
  }

  projectionMode = mode;
  updateProjectionButtons();

  if (mode === "normal" && !["dualFisheye", "dualFisheyeTracks"].includes(currentMeta?.layout)) {
    setNormalProjectionVisible(true);
    setStatus("Normal viewer mode.");
    return;
  }

  if (projectionCanvas.classList.contains("is-active")) return;

  startProjectionRenderer(mode).catch((error) => {
    setStatus(error.message || "Could not start projection mode.", true);
    projectionMode = "normal";
    updateProjectionButtons();
    setNormalProjectionVisible(true);
  });
}

projectionCanvas.addEventListener("pointerdown", (event) => {
  projectionPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  projectionState.dragging = true;
  projectionState.pointerId = event.pointerId;
  projectionState.lastX = event.clientX;
  projectionState.lastY = event.clientY;
  projectionCanvas.setPointerCapture(event.pointerId);
});

projectionCanvas.addEventListener("pointermove", (event) => {
  if (projectionPointers.has(event.pointerId)) {
    projectionPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  if (projectionPointers.size >= 2) {
    const points = [...projectionPointers.values()];
    const dx = points[0].x - points[1].x;
    const dy = points[0].y - points[1].y;
    const distance = Math.hypot(dx, dy);
    if (projectionPinchDistance > 0) {
      const zoomRange = getProjectionZoomRange();
      projectionState.zoom = clamp(
        projectionState.zoom * (projectionPinchDistance / distance),
        zoomRange.min,
        zoomRange.max,
      );
    }
    projectionPinchDistance = distance;
    return;
  }

  if (!projectionState.dragging || event.pointerId !== projectionState.pointerId) return;

  const dx = event.clientX - projectionState.lastX;
  const dy = event.clientY - projectionState.lastY;
  projectionState.lastX = event.clientX;
  projectionState.lastY = event.clientY;
  const dragSensitivity = getProjectionDragSensitivity();
  projectionState.yaw += dx * dragSensitivity;
  projectionState.pitch += dy * dragSensitivity;
});

function endProjectionPointer(event) {
  projectionPointers.delete(event.pointerId);
  if (projectionPointers.size < 2) {
    projectionPinchDistance = 0;
  }
  projectionState.dragging = false;
  projectionState.pointerId = null;
}

projectionCanvas.addEventListener("pointerup", endProjectionPointer);
projectionCanvas.addEventListener("pointercancel", endProjectionPointer);

projectionCanvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const zoomRange = getProjectionZoomRange();
  const step = projectionMode === "planet" ? 0.14 : 0.08;
  projectionState.zoom = clamp(
    projectionState.zoom + Math.sign(event.deltaY) * step,
    zoomRange.min,
    zoomRange.max,
  );
}, { passive: false });

window.addEventListener("resize", resizeProjectionRenderer);

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

function readVideoSize(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the selected video."));
    };
    video.src = url;
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
  if (isInsta360Photo(file)) {
    return prepareDualFisheyeImage(file, size);
  }

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

function sampleBilinear(source, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
    return [0, 0, 0];
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  const color = [0, 0, 0];

  for (let c = 0; c < 3; c += 1) {
    const top = source[i00 + c] * (1 - tx) + source[i10 + c] * tx;
    const bottom = source[i01 + c] * (1 - tx) + source[i11 + c] * tx;
    color[c] = top * (1 - ty) + bottom * ty;
  }

  return color;
}

function sampleDualFisheyeLens(source, width, height, radius, center, dirX, dirY, dirZ, frontSign) {
  const lensZ = frontSign * dirZ;
  const blendRadians = stitchBlendDegrees * DEG_TO_RAD;
  const featherStart = Math.PI / 2 - blendRadians;
  const featherEnd = Math.PI / 2 + blendRadians;
  if (lensZ < Math.cos(featherEnd)) return null;

  const theta = Math.acos(clamp(lensZ, -1, 1));
  if (theta > featherEnd) return null;

  const phi = Math.atan2(dirY, frontSign * dirX);
  const r = (theta / (Math.PI / 2)) * radius;
  const sx = center.x + r * Math.cos(phi);
  const sy = center.y - r * Math.sin(phi);
  const color = sampleBilinear(source, width, height, sx, sy);
  const weight = clamp((featherEnd - theta) / (featherEnd - featherStart), 0, 1);

  return { color, weight };
}

async function prepareDualFisheyeImage(file, size) {
  setStatus("INSP dual-fisheye photo detected. Converting to 360 panorama...");

  const img = await loadImage(file);
  const inputCanvas = document.createElement("canvas");
  inputCanvas.width = size.width;
  inputCanvas.height = size.height;
  const inputContext = inputCanvas.getContext("2d", { willReadFrequently: true });
  inputContext.drawImage(img, 0, 0);
  const source = inputContext.getImageData(0, 0, size.width, size.height).data;

  const outputWidth = Math.min(MAX_INSP_CONVERSION_WIDTH, size.width);
  const outputHeight = Math.round(outputWidth / 2);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputContext = outputCanvas.getContext("2d", { alpha: false });
  const output = outputContext.createImageData(outputWidth, outputHeight);

  const radius = Math.min(size.width / 4, size.height / 2) * stitchCropScale;
  const leftCenter = { x: size.width * 0.25, y: size.height * 0.5 };
  const rightCenter = { x: size.width * 0.75, y: size.height * 0.5 };

  for (let y = 0; y < outputHeight; y += 1) {
    const lat = Math.PI * (0.5 - (y + 0.5) / outputHeight);
    const cosLat = Math.cos(lat);
    const dirY = Math.sin(lat);

    for (let x = 0; x < outputWidth; x += 1) {
      const lon = 2 * Math.PI * ((x + 0.5) / outputWidth - 0.5);
      const dirX = cosLat * Math.sin(lon);
      const dirZ = cosLat * Math.cos(lon);
      const leftSample = sampleDualFisheyeLens(source, size.width, size.height, radius, leftCenter, dirX, dirY, dirZ, 1);
      const rightSample = sampleDualFisheyeLens(source, size.width, size.height, radius, rightCenter, dirX, dirY, dirZ, -1);
      let color = [0, 0, 0];

      if (leftSample && rightSample) {
        const totalWeight = leftSample.weight + rightSample.weight || 1;
        color = [
          (leftSample.color[0] * leftSample.weight + rightSample.color[0] * rightSample.weight) / totalWeight,
          (leftSample.color[1] * leftSample.weight + rightSample.color[1] * rightSample.weight) / totalWeight,
          (leftSample.color[2] * leftSample.weight + rightSample.color[2] * rightSample.weight) / totalWeight,
        ];
      } else if (leftSample) {
        color = leftSample.color;
      } else if (rightSample) {
        color = rightSample.color;
      }

      const target = (y * outputWidth + x) * 4;
      output.data[target] = color[0];
      output.data[target + 1] = color[1];
      output.data[target + 2] = color[2];
      output.data[target + 3] = 255;
    }
  }

  outputContext.putImageData(output, 0, 0);
  const blob = await canvasToBlob(outputCanvas);
  return {
    url: URL.createObjectURL(blob),
    width: outputWidth,
    height: outputHeight,
    resized: outputWidth !== size.width,
    converted: true,
  };
}

function getRatioWarning({ width, height }) {
  if (!width || !height) return "";

  const ratio = width / height;
  return Math.abs(ratio - 2) > 0.08
    ? " The image is not close to a 2:1 ratio, so it may look distorted."
    : "";
}

function getFileExtension(file) {
  return file.name.split(".").pop()?.toLowerCase() || "";
}

function getFileKind(file) {
  const extension = getFileExtension(file);
  if (file.type.startsWith("image/") || extension === "insp") return "image";
  if (file.type.startsWith("video/") || extension === "insv") return "video";
  return "";
}

function isInsta360Photo(file) {
  return getFileExtension(file) === "insp";
}

function destroyViewerForModeSwitch() {
  stopGyro();
  viewer?.destroy();
  viewer = null;
  currentMode = null;
}

function getPanoramaForMode(url, mode) {
  if (mode === "video") {
    return {
      source: url,
    };
  }

  return url;
}

async function setPanorama(url, meta, mode = "image") {
  if (projectionCanvas.classList.contains("is-active")) {
    setNormalProjectionVisible(true);
    projectionMode = "normal";
    updateProjectionButtons();
  }
  const panorama = getPanoramaForMode(url, mode);

  if (!viewer || currentMode !== mode) {
    if (viewer && currentMode !== mode) {
      destroyViewerForModeSwitch();
    }
    createViewer(panorama, mode);
    await viewer.state.loadingPromise;
  } else {
    await viewer.setPanorama(panorama, {
      transition: false,
      position: { yaw: 0, pitch: 0 },
      sphereCorrection: {
        pan: `${correctionState.yaw}deg`,
        roll: `${correctionState.roll}deg`,
        tilt: `${correctionState.pitch}deg`,
      },
    });
  }

  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = url;
  currentMeta = meta;

  fileNameEl.textContent = meta.name;
  imageSizeEl.textContent = meta.duration
    ? `${meta.width} x ${meta.height}px / ${formatDuration(meta.duration)}`
    : `${meta.width} x ${meta.height}px`;
  enableControls();
  updateProjectionButtons();
}

async function loadFile(file) {
  if (!file) return;
  const fileKind = getFileKind(file);
  if (!fileKind) {
    setStatus("Please select an image, video, INSP, or INSV file.", true);
    return;
  }

  setStatus(fileKind === "video" ? "Loading video..." : "Loading photo...");
  currentDualFisheyeFile = null;
  currentDualFisheyeSize = null;

  try {
    if (fileKind === "video") {
      const size = await readVideoSize(file);
      const videoUrl = URL.createObjectURL(file);
      const isInsv = getFileExtension(file) === "insv";

      if (isInsv) {
        if (viewer) {
          destroyViewerForModeSwitch();
        }
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = videoUrl;
        currentMode = "video";
        currentMeta = {
          name: file.name,
          width: size.width,
          height: size.height,
          duration: size.duration,
          layout: "dualFisheyeTracks",
        };
        fileNameEl.textContent = file.name;
        imageSizeEl.textContent = `${size.width} x ${size.height}px / ${formatDuration(size.duration)}`;
        enableControls();
        setProjectionMode("normal");
        setStatus("INSV loaded in shader mode. If only one lens is visible, the matching lens file is required.", true);
        return;
      }

      await setPanorama(videoUrl, {
        name: file.name,
        width: size.width,
        height: size.height,
        duration: size.duration,
        layout: "equirectangular",
      }, "video");

      const warning = getRatioWarning(size);
      setStatus(
        warning
          ? `Video loaded.${warning}`
          : "Video loaded.",
        Boolean(warning),
      );
      return;
    }

    const size = await readImageSize(file);
    if (isInsta360Photo(file)) {
      currentDualFisheyeFile = file;
      currentDualFisheyeSize = size;
    }
    const prepared = await preparePanoramaFile(file, size);

    await setPanorama(prepared.url, {
      name: file.name,
      width: prepared.width,
      height: prepared.height,
      layout: "equirectangular",
      convertedFromDualFisheye: Boolean(prepared.converted),
    }, "image");

    const warning = getRatioWarning(size);
    const resizeNote = prepared.resized
      ? ` Display copy was resized from ${size.width} x ${size.height}px.`
      : "";
    const formatNote = prepared.converted
      ? " INSP dual-fisheye photo was converted in this browser."
      : "";
    setStatus(
      warning
        ? `Loaded.${warning}${resizeNote}${formatNote}`
        : `Loaded.${resizeNote}${formatNote}`,
      Boolean(warning),
    );
  } catch (error) {
    const extension = getFileExtension(file);
    const message = extension === "insp" || extension === "insv"
      ? `${extension.toUpperCase()} could not be decoded in this browser. Export it as equirectangular JPG/MP4 from Insta360 Studio, or add a conversion step before viewing.`
      : error.message || "Failed to load the file.";
    setStatus(message, true);
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
  setStatus("Demo loaded.");
});

resetButton.addEventListener("click", () => {
  const wasGyroEnabled = gyroState.enabled;

  if (projectionCanvas.classList.contains("is-active")) {
    projectionState.yaw = 0;
    projectionState.pitch = 0;
    projectionState.zoom = projectionMode === "planet" ? 1.55 : 0.58;
    setStatus(`${projectionMode === "planet" ? "Planet" : "Normal"} view reset.`);
    return;
  }

  if (wasGyroEnabled) {
    recenterGyroTo(0, 0);
  }
  viewer?.dynamics?.roll?.goto(0, 30);

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
      gyroState.targetRoll = 0;
      gyroState.currentYaw = position.yaw;
      gyroState.currentPitch = position.pitch;
      gyroState.currentRoll = 0;
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
  if (projectionCanvas.classList.contains("is-active")) {
    const stage = document.querySelector(".viewer-stage");
    if (!document.fullscreenElement) {
      await stage?.requestFullscreen?.();
    } else {
      await document.exitFullscreen();
    }
    return;
  }

  viewer?.toggleFullscreen();
});

projectionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!currentUrl) return;
    setProjectionMode(button.dataset.projection);
  });
});

planetSensitivityInput?.addEventListener("input", () => {
  planetSensitivity = Number(planetSensitivityInput.value) / 100;
  planetSensitivityValue.textContent = `${planetSensitivityInput.value}%`;
});

async function refreshDualFisheyePhoto() {
  if (!currentDualFisheyeFile || !currentDualFisheyeSize) return;

  try {
    const previousMode = projectionMode;
    const prepared = await prepareDualFisheyeImage(currentDualFisheyeFile, currentDualFisheyeSize);
    await setPanorama(prepared.url, {
      name: currentDualFisheyeFile.name,
      width: prepared.width,
      height: prepared.height,
      layout: "equirectangular",
      convertedFromDualFisheye: true,
    }, "image");
    if (previousMode === "planet") {
      setProjectionMode("planet");
    }
    setStatus(`INSP stitch updated. Blend ${stitchBlendDegrees}deg, crop ${(stitchCropScale * 100).toFixed(1)}%.`);
  } catch (error) {
    setStatus(error.message || "Could not update INSP stitch.", true);
  }
}

function scheduleStitchUpdate() {
  if (currentMeta?.convertedFromDualFisheye) {
    window.clearTimeout(stitchUpdateTimer);
    stitchUpdateTimer = window.setTimeout(() => {
      refreshDualFisheyePhoto();
    }, 350);
  }
}

stitchBlendInput?.addEventListener("input", () => {
  stitchBlendDegrees = Number(stitchBlendInput.value);
  stitchBlendValue.textContent = `${stitchBlendInput.value}deg`;
  scheduleStitchUpdate();
});

stitchCropInput?.addEventListener("input", () => {
  stitchCropScale = Number(stitchCropInput.value) / 100;
  stitchCropValue.textContent = `${Number(stitchCropInput.value).toFixed(1)}%`;
  scheduleStitchUpdate();
});

yawOffsetInput.addEventListener("input", () => {
  correctionState.yaw = Number(yawOffsetInput.value);
  applyPhotoCorrection();
});

rollOffsetInput.addEventListener("input", () => {
  correctionState.roll = Number(rollOffsetInput.value);
  applyPhotoCorrection();
});

pitchOffsetInput.addEventListener("input", () => {
  correctionState.pitch = Number(pitchOffsetInput.value);
  applyPhotoCorrection();
});

resetCorrectionButton.addEventListener("click", () => {
  correctionState = { yaw: 0, roll: 0, pitch: 0 };
  yawOffsetInput.value = "0";
  rollOffsetInput.value = "0";
  pitchOffsetInput.value = "0";
  applyPhotoCorrection();
  setStatus("Photo correction reset.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

updateCorrectionLabels();

window.addEventListener("beforeunload", () => {
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  stopGyro();
  stopProjectionRenderer();
  viewer?.destroy();
});
