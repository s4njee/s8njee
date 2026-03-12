import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { createGuiControls, createDefaultGuiParams } from './src/monolith/gui.js';
import { resolveAssetUrl } from './src/monolith/asset-url.js';
import { createLightingRig } from './src/monolith/lighting.js';
import { createMaterialManager } from './src/monolith/materials.js';
import { createOverlays } from './src/monolith/overlays.js';
import { createPostProcessing } from './src/monolith/postprocessing.js';
import { SET_DEFS } from './src/monolith/set-defs.js';
import { createUI } from './src/monolith/ui.js';

const scene = new THREE.Scene();
document.body.style.background = '#111111';
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.5, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.76;
renderer.domElement.style.position = 'relative';
renderer.domElement.style.zIndex = '1';
renderer.domElement.style.transition = 'opacity 0.6s';
renderer.domElement.style.opacity = '0';
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.5, 0);
controls.enableDamping = true;
controls.update();

const clock = new THREE.Clock();
const guiParams = createDefaultGuiParams();
const FX_NONE = 0;
const FX_CINEMATIC = 1;
const FX_DATABEND = 2;
const FX_CROSSHATCH = 3;

const postProcessing = createPostProcessing({
  renderer,
  scene,
  camera,
  getElapsedTime: () => clock.elapsedTime,
  getGuiParams: () => guiParams,
});

const materialManager = createMaterialManager(renderer);

let whiteMode = false;
let xrayMode = false;
let restoreChromaticAberrationAfterXray = false;
let currentSetIndex = 2;
let currentModelIndex = -1;
let lightingMode = 0;
let currentFx = FX_NONE;
let pendingLightingMode = null;
let firstLoad = true;
let mixer = null;
let monolith = new THREE.Group();

scene.add(monolith);
monolith.layers.enable(postProcessing.modelLayer);

const modelCache = new Map();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

const overlays = createOverlays(scene);
const lightingRig = createLightingRig({
  scene,
  currentSetDef,
  getCurrentModelIndex: () => currentModelIndex,
  getMonolith: () => monolith,
  guiParams,
});
const ui = createUI({
  setDefs: SET_DEFS,
  getWhiteMode: () => whiteMode,
  getCurrentSetIndex: () => currentSetIndex,
  getLightingMode: () => lightingMode,
  onSwitchLightingMode: switchLightingMode,
  onSwitchSet: switchSet,
});
const guiControls = createGuiControls({
  guiParams,
  renderer,
  scene,
  postProcessing,
  onWhiteModeChange: setWhiteMode,
  onLightingModeChange: switchLightingMode,
  onRefreshPostProcessing: refreshPostProcessingPasses,
  triggerGlitch: postProcessing.triggerGlitch,
});

const progressContainer = document.createElement('div');
progressContainer.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:200px;z-index:200';
const progressBar = document.createElement('div');
progressBar.style.cssText = 'width:0%;height:2px;background:#fff;transition:width 0.2s';
const progressLabel = document.createElement('div');
progressLabel.style.cssText = 'color:rgba(255,255,255,0.5);font:12px/1 monospace;text-align:center;margin-bottom:8px';
progressLabel.textContent = 'loading';
progressContainer.appendChild(progressLabel);
progressContainer.appendChild(progressBar);
document.body.appendChild(progressContainer);

function currentSetDef() {
  return SET_DEFS[currentSetIndex];
}

function currentModels() {
  return currentSetDef().models;
}

function refreshPostProcessingPasses() {
  postProcessing.refreshPostProcessingPasses(currentFx);
}

function switchFx(mode) {
  currentFx = mode;
  refreshPostProcessingPasses();
  guiControls.syncGuiDisplay();
}

function toggleFx(mode) {
  switchFx(currentFx === mode ? FX_NONE : mode);
}

function revealScene() {
  if (pendingLightingMode !== null) {
    switchLightingMode(pendingLightingMode);
    pendingLightingMode = null;
  }
  renderer.domElement.style.opacity = '1';
}

function assignModelPostProcessingLayer(model) {
  model.traverse((child) => {
    child.layers.enable(postProcessing.modelLayer);
  });
}

function swapModel(model, name, animations) {
  if (mixer) {
    mixer.stopAllAction();
    mixer = null;
  }
  scene.remove(monolith);
  monolith = model;
  scene.add(monolith);

  if (animations?.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    animations.forEach((clip) => mixer.clipAction(clip).play());
  }

  ui.updateLabel(name);
}

function loadModel(index) {
  if (index === currentModelIndex) return;
  currentModelIndex = index;
  postProcessing.triggerGlitch();
  renderer.domElement.style.opacity = '0';
  overlays.updateTextVisibility(currentSetIndex, -1);

  const entry = currentModels()[index];
  const def = currentSetDef();
  const cacheKey = entry.path;

  if (modelCache.has(cacheKey)) {
    const cached = modelCache.get(cacheKey);
    materialManager.applyModelMaterials(cached.model, def, currentSetIndex, index, xrayMode);
    setTimeout(() => {
      swapModel(cached.model, entry.name, cached.animations);
      overlays.updateTextVisibility(currentSetIndex, index);
      revealScene();
    }, 200);
    return;
  }

  loader.load(
    resolveAssetUrl(entry.path),
    (gltf) => {
      if (firstLoad) {
        firstLoad = false;
        progressContainer.style.transition = 'opacity 0.4s';
        progressContainer.style.opacity = '0';
        setTimeout(() => progressContainer.remove(), 500);
      }

      const model = gltf.scene;
      const animations = gltf.animations;

      assignModelPostProcessingLayer(model);
      materialManager.normalizeModelTransform(model, def, index);
      materialManager.applyModelTextureFiltering(model);
      materialManager.applyModelMaterials(model, def, currentSetIndex, index, xrayMode);

      modelCache.set(cacheKey, { model, animations });
      setTimeout(() => {
        swapModel(model, entry.name, animations);
        overlays.updateTextVisibility(currentSetIndex, index);
        revealScene();
      }, 200);
    },
    (progress) => {
      if (firstLoad && progress.total) {
        progressBar.style.width = `${Math.round((progress.loaded / progress.total) * 100)}%`;
      }
    },
  );
}

function refreshDisplayedModelMaterials() {
  if (!monolith || currentModelIndex < 0) return;
  materialManager.applyModelMaterials(monolith, currentSetDef(), currentSetIndex, currentModelIndex, xrayMode);
}

function switchLightingMode(mode) {
  lightingMode = mode;
  lightingRig.particles.visible = mode === 1;
  if (mode === 0) lightingRig.clearParticleGlow();
  guiParams.lightingMode = mode === 0 ? 'A (Scene)' : 'B (Particles)';
  guiControls.syncGuiDisplay();
  ui.updateModeButtons();
}

function applyWhiteMode() {
  document.body.style.background = whiteMode ? 'white' : '#111111';
  scene.background = new THREE.Color(whiteMode ? 0xffffff : 0x111111);
  overlays.applyWhiteMode(whiteMode);
  ui.applyWhiteMode();
}

function setWhiteMode(value) {
  whiteMode = value;
  guiParams.whiteMode = value;
  applyWhiteMode();
}

function toggleWhiteMode() {
  whiteMode = !whiteMode;
  guiParams.whiteMode = whiteMode;
  guiControls.syncGuiDisplay();
  applyWhiteMode();
}

function toggleXrayMode() {
  xrayMode = !xrayMode;
  if (xrayMode) {
    restoreChromaticAberrationAfterXray = guiParams.chromaticAberrationEnabled;
    if (guiParams.chromaticAberrationEnabled) {
      guiParams.chromaticAberrationEnabled = false;
      refreshPostProcessingPasses();
      guiControls.syncGuiDisplay();
    }
  } else if (restoreChromaticAberrationAfterXray) {
    guiParams.chromaticAberrationEnabled = true;
    restoreChromaticAberrationAfterXray = false;
    refreshPostProcessingPasses();
    guiControls.syncGuiDisplay();
  }
  refreshDisplayedModelMaterials();
}

function toggleChromaticAberration() {
  guiParams.chromaticAberrationEnabled = !guiParams.chromaticAberrationEnabled;
  refreshPostProcessingPasses();
  guiControls.syncGuiDisplay();
}

function switchSet(index) {
  currentSetIndex = index;
  currentModelIndex = -1;

  const def = currentSetDef();
  overlays.hideAllOverlays();
  overlays.setStarWarsLogoVisible(Boolean(def.nullBackground));
  scene.background = def.nullBackground ? null : new THREE.Color(whiteMode ? 0xffffff : 0x111111);

  pendingLightingMode = def.defaultLighting ?? 0;
  ui.updateSetButtons();
  loadModel(def.defaultModel ?? 0);
}

const hotkeyMap = {};
SET_DEFS.forEach((def, index) => {
  if (def.hotkey) hotkeyMap[def.hotkey] = index;
});

const keyHandlers = {
  '4': () => toggleFx(FX_CINEMATIC),
  '6': toggleWhiteMode,
  z: () => toggleFx(FX_DATABEND),
  Z: () => toggleFx(FX_DATABEND),
  g: guiControls.toggleGUI,
  G: guiControls.toggleGUI,
  c: toggleChromaticAberration,
  C: toggleChromaticAberration,
  x: toggleXrayMode,
  X: toggleXrayMode,
};

window.addEventListener('keydown', (event) => {
  if (event.key === 'Tab') {
    event.preventDefault();
    switchSet((currentSetIndex + 1) % SET_DEFS.length);
    return;
  }

  if (keyHandlers[event.key]) {
    keyHandlers[event.key]();
    return;
  }

  if (hotkeyMap[event.key] !== undefined) {
    switchSet(hotkeyMap[event.key]);
    return;
  }

  const models = currentModels();
  if (event.key === 'ArrowRight') loadModel((currentModelIndex + 1) % models.length);
  if (event.key === 'ArrowLeft') loadModel((currentModelIndex - 1 + models.length) % models.length);
});

let lastTap = 0;
renderer.domElement.addEventListener('touchend', (event) => {
  const now = Date.now();
  if (now - lastTap < 300) {
    event.preventDefault();
    const models = currentModels();
    loadModel((currentModelIndex + 1) % models.length);
  }
  lastTap = now;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postProcessing.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  const delta = clock.getDelta();
  const elapsedTime = clock.elapsedTime;
  postProcessing.updateAnimatedUniforms(elapsedTime);
  postProcessing.updateGlitch(delta);
  if (mixer) mixer.update(delta);
  controls.update();
  if (xrayMode) materialManager.updateXrayAnimation(elapsedTime);

  if (lightingMode === 1) {
    lightingRig.updateParticleLighting();
  } else {
    lightingRig.updateSceneLighting();
  }

  if (postProcessing.getBloomRingActive()) {
    lightingRig.animateBloomRing();
  }

  if (postProcessing.hasActivePostProcessing()) {
    postProcessing.renderIsolatedModelLayer();
    postProcessing.composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

renderer.setAnimationLoop(animate);
refreshPostProcessingPasses();
switchSet(currentSetIndex);
