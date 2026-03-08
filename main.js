import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Text } from 'troika-three-text';

// ── Scene setup ──────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
document.body.style.background = '#111111';
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.5, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.style.position = 'relative';
renderer.domElement.style.zIndex = '1';
renderer.domElement.style.transition = 'opacity 0.6s';
renderer.domElement.style.opacity = '0';
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.5, 0);
controls.enableDamping = true;
controls.update();

// ── Loading progress ─────────────────────────────────────────────────────────

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
let firstLoad = true;

// ── Model loader ─────────────────────────────────────────────────────────────

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
const modelCache = new Map();
const clock = new THREE.Clock();
let mixer = null;
let monolith = new THREE.Group();
scene.add(monolith);

// ── Set definitions ──────────────────────────────────────────────────────────
// Each set can define:
//   models[]        - model entries with key/name/path
//   defaultModel    - index to load on set switch (default 0)
//   hidden          - hide from bottom nav (keyboard-only access)
//   hotkey          - keyboard shortcut to access hidden sets
//   defaultLighting - 0 = mode A, 1 = mode B (particles)
//   materialStyle   - 'default' | 'reduced' | 'glossy' | 'anime'
//   lightingStyle   - 'neon' | 'splitTone' | 'dualRing' | 'singleRing' | 'ambientOnly' | 'pointRing'
//   logo            - { type: '3d'|'css', ... } for set logos
//   overlayTexts    - per-model text overlays

const SET_DEFS = [
  { // 0: Astolfo
    models: [
      { key: '1', name: 'Astolfo', path: '/set1/astolfo.glb' },
      { key: '2', name: 'Astolfo 2', path: '/set1/astolfo2.glb' },
      { key: '3', name: 'Astolfo 3', path: '/set1/astolfo3.glb' },
      { key: '4', name: 'Astolfo 4', path: '/set1/astolfo4.glb' },
      { key: '5', name: 'Astolfo 6', path: '/set1/astolfo6.glb' },
      { key: '6', name: 'Angel Devil', path: '/set1/angeldevil1.glb' },
    ],
    buttonLabel: '1',
    lightingStyle: 'neon',
    particleHue: 'warm',
  },
  { // 1: Shinji
    models: [
      { key: '1', name: 'Shinji', path: '/set2/shinji.glb' },
      { key: '2', name: 'Shinji 2', path: '/set2/shinji2.glb' },
      { key: '3', name: 'Shinji 3', path: '/set2/shinji3.glb' },
      { key: '4', name: 'Shinji 4', path: '/set2/shinji4.glb' },
    ],
    buttonLabel: '2',
    lightingStyle: 'splitTone',
    particleHue: 'rainbow',
  },
  { // 2: EVA
    models: [
      { key: '1', name: 'EVA-01 Running', path: '/set3/eva01running.glb' },
      { key: '2', name: 'EVA-02 Running', path: '/set3/eva02running.glb' },
      { key: '3', name: 'Angel Walk', path: '/set3/angelwalk.glb' },
      { key: '4', name: 'EVA-01', path: '/set3/eva01.glb' },
      { key: '5', name: 'EVA-02', path: '/set3/eva02.glb' },
    ],
    buttonLabel: '3',
    lightingStyle: 'dualRing',
    materialOverrides: [
      { match: (si, mi) => mi !== 2, metalness: 0.2, roughness: 0.6, clearMetalnessMap: true },
      { match: (si, mi) => mi === 2, metalness: 0.9, roughness: 0.25 },
    ],
    lightingOverrides: {
      2: 'ambientOnly', // Angel Walk
    },
  },
  { // 3: Star Wars
    models: [
      { key: '1', name: 'X-Wing', path: '/set4/1xwing.glb' },
      { key: '2', name: 'TIE Fighter', path: '/set4/2tie.glb' },
      { key: '3', name: 'Star Destroyer', path: '/set4/3sd.glb' },
      { key: '4', name: 'R90', path: '/set4/zr90.glb' },
    ],
    buttonLabel: '4',
    lightingStyle: 'pointRing',
    positionYOffset: 0.8,
    rotationOverride: { x: -0.0215, y: 0.288, z: 0.288 },
    nullBackground: true,
  },
  { // 4: Mahoraga
    models: [
      { key: '1', name: 'Mahoraga', path: '/set5/mahoraga.glb' },
    ],
    buttonLabel: '✱',
    lightingStyle: 'singleRing',
    materialStyle: 'anime',
  },
  { // 5: One Piece (set6)
    models: [
      { key: '1', name: 'Sanji', path: '/set6/sanji.glb' },
      { key: '2', name: 'Sanji 2', path: '/set6/sanji2.glb' },
    ],
    defaultModel: 1,
    hidden: true,
    hotkey: '7',
    buttonLabel: '7',
    lightingStyle: 'dualRing',
    defaultLighting: 1,
    materialOverrides: [
      { match: () => true, metalness: 0.05, roughness: 0.85, clearMetalnessMap: true },
    ],
  },
  { // 6: Rimuru (set8)
    models: [
      { key: '1', name: 'Rimuru', path: '/set8/rimuru.glb' },
      { key: '2', name: 'Rimuru 2', path: '/set8/rimuru2.glb' },
      { key: '3', name: 'Rimuru 3', path: '/set8/rimuru3.glb' },
    ],
    defaultModel: 2,
    hidden: true,
    hotkey: '8',
    buttonLabel: '8',
    lightingStyle: 'dualRing',
    defaultLighting: 1,
    materialStyle: 'anime',
  },
];

// ── State ────────────────────────────────────────────────────────────────────

let whiteMode = false;
let currentSetIndex = 2;
let currentModelIndex = -1;
let lightingMode = 0;

function currentSetDef() { return SET_DEFS[currentSetIndex]; }
function currentModels() { return currentSetDef().models; }

// ── Helpers: materials ───────────────────────────────────────────────────────

function applyMaterialOverrides(model, setIndex, modelIndex) {
  const def = SET_DEFS[setIndex];

  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mat = child.material;

    // Always strip emissive maps
    if (mat.emissiveMap) {
      mat.emissiveMap = null;
      mat.emissive.set(0x000000);
      mat.needsUpdate = true;
    }

    // Anime-style flat shading
    if (def.materialStyle === 'anime') {
      mat.metalness = 0;
      mat.roughness = 1.0;
      mat.envMap = null;
      mat.envMapIntensity = 0;
      if (mat.metalnessMap) mat.metalnessMap = null;
      if (mat.roughnessMap) mat.roughnessMap = null;
      mat.needsUpdate = true;
      return;
    }

    // Per-set material overrides
    if (def.materialOverrides) {
      for (const override of def.materialOverrides) {
        if (override.match(setIndex, modelIndex)) {
          mat.metalness = override.metalness !== undefined
            ? Math.min(mat.metalness, override.metalness) : mat.metalness;
          mat.roughness = override.roughness !== undefined
            ? Math.max(mat.roughness, override.roughness) : mat.roughness;
          if (override.clearMetalnessMap && mat.metalnessMap) mat.metalnessMap = null;
          mat.needsUpdate = true;
          break;
        }
      }
    }
  });
}

// ── Helpers: 3D text ─────────────────────────────────────────────────────────

function createText(opts) {
  const t = new Text();
  t.text = opts.text;
  t.font = opts.font;
  t.fontSize = opts.fontSize;
  t.color = 0xffffff;
  t.anchorX = opts.anchorX || 'left';
  t.anchorY = opts.anchorY || 'bottom';
  t.position.set(...opts.position);
  t.material.transparent = true;
  t.material.opacity = opts.opacity ?? 0.85;
  if (opts.letterSpacing) t.letterSpacing = opts.letterSpacing;
  if (opts.lineHeight) t.lineHeight = opts.lineHeight;
  if (opts.textAlign) t.textAlign = opts.textAlign;
  t.visible = false;
  t.sync();
  scene.add(t);
  return t;
}

// ── Scene text overlays ──────────────────────────────────────────────────────

// Mahoraga title
const mahoragaText = createText({
  text: 'EIGHT-HANDLED SWORD\nDIVERGENT SILA\nDIVINE GENERAL\nMAHORAGA',
  font: '/fonts/anton.ttf', fontSize: 0.35, lineHeight: 1.3,
  anchorX: 'center', textAlign: 'center', anchorY: 'middle',
  position: [-3.5, 1.5, 0], opacity: 0.8,
});

// EVA-01 titles (left side)
const evaTitle = createText({
  text: 'EVANGELION UNIT-01', font: '/fonts/evangelion.ttf',
  fontSize: 0.4, letterSpacing: 0.08, position: [-6.5, 1.2, 0],
});
const evaSubtitle = createText({
  text: 'MULTIPURPOSE HUMANOID DECISIVE WEAPON, ARTIFICIAL HUMAN',
  font: '/fonts/evangelion.ttf', fontSize: 0.13, letterSpacing: 0.04,
  anchorY: 'top', position: [-6.5, 1.15, 0], opacity: 0.6,
});
const evaJpText = createText({
  text: '汎用ヒト型決戦兵器 人造人間エヴァンゲリオン初号機',
  font: '/fonts/evangelion.ttf', fontSize: 0.13, letterSpacing: 0.02,
  anchorY: 'top', position: [-6.5, 1.0, 0], opacity: 0.6,
});

// EVA-02 titles (right side)
const eva02Title = createText({
  text: 'EVANGELION UNIT-02', font: '/fonts/evangelion.ttf',
  fontSize: 0.4, letterSpacing: 0.08, anchorX: 'right',
  position: [6.5, 1.2, 0],
});
const eva02Subtitle = createText({
  text: 'MULTIPURPOSE HUMANOID DECISIVE WEAPON, ARTIFICIAL HUMAN',
  font: '/fonts/evangelion.ttf', fontSize: 0.13, letterSpacing: 0.04,
  anchorX: 'right', anchorY: 'top', position: [6.5, 1.15, 0], opacity: 0.6,
});
const eva02JpText = createText({
  text: '汎用ヒト型決戦兵器 人造人間エヴァンゲリオン弐号機',
  font: '/fonts/evangelion.ttf', fontSize: 0.13, letterSpacing: 0.02,
  anchorX: 'right', anchorY: 'top', position: [6.5, 1.0, 0], opacity: 0.6,
});

// All scene text objects (for white mode toggling)
const allSceneTexts = [evaTitle, evaSubtitle, evaJpText, eva02Title, eva02Subtitle, eva02JpText, mahoragaText];

// ── Logos ────────────────────────────────────────────────────────────────────

// Star Wars CSS background logo
const swLogo = document.createElement('img');
swLogo.src = '/set4/starwars_logo_yellow.svg';
swLogo.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-55%);width:50vw;opacity:0.12;pointer-events:none;z-index:0;display:none';
document.body.insertBefore(swLogo, document.body.firstChild);

// 3D plane logos
function create3DLogo(texturePath, aspect, height, position, extraOpts = {}) {
  const texture = new THREE.TextureLoader().load(texturePath);
  const matOpts = { map: texture, transparent: true, opacity: 0.85, depthWrite: false, ...extraOpts };
  const mat = new THREE.MeshBasicMaterial(matOpts);
  const geo = new THREE.PlaneGeometry(height * aspect, height);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...position);
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

const opLogoMesh = create3DLogo('/set6/onepiece_logo.png', 1600 / 740, 3.0, [-4.5, 7.0, -3]);
const rimuruLogoMesh = create3DLogo('/set8/rimuru_logo.png', 900 / 615, 3.0, [-3.5, 7.0, -3], { alphaTest: 0.01 });

// Map set index → logo mesh (for visibility toggling)
const setLogos = { 5: opLogoMesh, 6: rimuruLogoMesh };

// ── Text/logo visibility ────────────────────────────────────────────────────

function updateTextVisibility(modelIndex) {
  const show = modelIndex >= 0;
  mahoragaText.visible = show && currentSetIndex === 4;

  // 3D logos
  for (const [idx, mesh] of Object.entries(setLogos)) {
    mesh.visible = show && currentSetIndex === Number(idx);
  }

  // EVA titles
  evaTitle.visible = currentSetIndex === 2 && modelIndex === 0;
  evaSubtitle.visible = currentSetIndex === 2 && modelIndex === 0;
  evaJpText.visible = currentSetIndex === 2 && modelIndex === 0;
  eva02Title.visible = currentSetIndex === 2 && modelIndex === 1;
  eva02Subtitle.visible = currentSetIndex === 2 && modelIndex === 1;
  eva02JpText.visible = currentSetIndex === 2 && modelIndex === 1;
}

// ── Model loading ────────────────────────────────────────────────────────────

function loadModel(index) {
  if (index === currentModelIndex) return;
  currentModelIndex = index;
  renderer.domElement.style.opacity = '0';
  updateTextVisibility(-1);
  const entry = currentModels()[index];
  const def = currentSetDef();

  if (modelCache.has(index)) {
    setTimeout(() => {
      const cached = modelCache.get(index);
      swapModel(cached.model, entry.name, cached.animations);
      updateTextVisibility(index);
      revealScene();
    }, 200);
    return;
  }

  loader.load(entry.path, (gltf) => {
    if (firstLoad) {
      firstLoad = false;
      progressContainer.style.transition = 'opacity 0.4s';
      progressContainer.style.opacity = '0';
      setTimeout(() => progressContainer.remove(), 500);
    }

    const model = gltf.scene;
    const animations = gltf.animations;

    // Normalize scale
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = (5 / Math.max(size.x, size.y, size.z)) * 1.5625;
    model.scale.setScalar(scale);

    // Center horizontally, place on ground
    box.setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    model.position.y += def.positionYOffset ?? -1.2;

    // Rotation
    if (def.rotationOverride) {
      model.rotation.x = def.rotationOverride.x;
      model.rotation.y = def.rotationOverride.y;
      model.rotation.z = def.rotationOverride.z;
    } else {
      model.rotation.y = 0.35;
    }

    // Material overrides
    applyMaterialOverrides(model, currentSetIndex, index);

    modelCache.set(index, { model, animations });
    setTimeout(() => {
      swapModel(model, entry.name, animations);
      updateTextVisibility(index);
      revealScene();
    }, 200);
  }, (progress) => {
    if (firstLoad && progress.total) {
      progressBar.style.width = Math.round((progress.loaded / progress.total) * 100) + '%';
    }
  });
}

function swapModel(model, name, animations) {
  if (mixer) { mixer.stopAllAction(); mixer = null; }
  scene.remove(monolith);
  monolith = model;
  scene.add(monolith);
  if (animations?.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    animations.forEach((clip) => mixer.clipAction(clip).play());
  }
  updateLabel(name);
}

function revealScene() {
  renderer.domElement.style.opacity = '1';
}

// ── UI: HUD label ────────────────────────────────────────────────────────────

const label = document.createElement('div');
label.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);color:#fff;font:14px/1 monospace;opacity:0;transition:opacity 0.3s;pointer-events:none;text-shadow:0 1px 4px #000';
document.body.appendChild(label);
let labelTimeout;
function updateLabel(name) {
  label.textContent = name;
  label.style.opacity = '1';
  clearTimeout(labelTimeout);
  labelTimeout = setTimeout(() => label.style.opacity = '0', 1500);
}

// ── UI: Music toggle ─────────────────────────────────────────────────────────

const musicBtn = document.createElement('div');
musicBtn.textContent = '♪';
musicBtn.style.cssText = 'position:fixed;top:16px;right:48px;color:rgba(255,255,255,0.5);font-size:60px;cursor:pointer;z-index:100;user-select:none;transition:color 0.2s,text-shadow 0.2s';
musicBtn.addEventListener('mouseenter', () => { if (!musicPlaying) musicBtn.style.color = 'rgba(255,255,255,0.8)'; });
musicBtn.addEventListener('mouseleave', () => { if (!musicPlaying) musicBtn.style.color = 'rgba(255,255,255,0.5)'; });
document.body.appendChild(musicBtn);

const bgm = new Audio('/set3/bgm.mp3');
bgm.loop = true;
let musicPlaying = false;

musicBtn.addEventListener('click', () => {
  musicPlaying = !musicPlaying;
  if (musicPlaying) {
    bgm.play();
    musicBtn.style.color = '#fff';
    musicBtn.style.textShadow = '0 0 8px rgba(255,255,255,0.6)';
  } else {
    bgm.pause();
    musicBtn.style.color = 'rgba(255,255,255,0.5)';
    musicBtn.style.textShadow = 'none';
  }
});

// ── UI: Button helpers ───────────────────────────────────────────────────────

const BTN_CSS = 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.3);color:#fff;font:14px/1 monospace;cursor:pointer;background:rgba(255,255,255,0.05);transition:all 0.2s;user-select:none';

function styleButton(btn, active) {
  const c = whiteMode ? '0,0,0' : '255,255,255';
  btn.style.color = whiteMode ? '#000' : '#fff';
  btn.style.background = `rgba(${c},${active ? (whiteMode ? 0.15 : 0.25) : 0.05})`;
  btn.style.borderColor = `rgba(${c},${active ? 0.7 : 0.3})`;
}

// ── UI: Set selector ─────────────────────────────────────────────────────────

const setNav = document.createElement('div');
setNav.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:10';
document.body.appendChild(setNav);
const setButtons = [];

SET_DEFS.forEach((def, i) => {
  const btn = document.createElement('div');
  btn.textContent = def.buttonLabel;
  btn.style.cssText = BTN_CSS;
  if (def.hidden) btn.style.display = 'none';
  btn.addEventListener('click', () => switchSet(i));
  btn.addEventListener('mouseenter', () => { if (i !== currentSetIndex) styleButton(btn, false); });
  btn.addEventListener('mouseleave', () => { if (i !== currentSetIndex) styleButton(btn, false); });
  setNav.appendChild(btn);
  setButtons.push(btn);
});

function updateSetButtons() {
  setButtons.forEach((btn, i) => styleButton(btn, i === currentSetIndex));
}
updateSetButtons();

// ── UI: Lighting mode selector ───────────────────────────────────────────────

const modeNav = document.createElement('div');
modeNav.style.cssText = 'position:fixed;top:16px;left:16px;display:flex;gap:8px;z-index:10';
document.body.appendChild(modeNav);
const modeButtons = [];

['A', 'B'].forEach((lbl, i) => {
  const btn = document.createElement('div');
  btn.textContent = lbl;
  btn.style.cssText = BTN_CSS;
  btn.addEventListener('click', () => switchLightingMode(i));
  btn.addEventListener('mouseenter', () => { if (i !== lightingMode) styleButton(btn, false); });
  btn.addEventListener('mouseleave', () => { if (i !== lightingMode) styleButton(btn, false); });
  modeNav.appendChild(btn);
  modeButtons.push(btn);
});

function updateModeButtons() {
  modeButtons.forEach((btn, i) => styleButton(btn, i === lightingMode));
}
updateModeButtons();

function switchLightingMode(mode) {
  lightingMode = mode;
  particles.visible = mode === 1;
  if (mode === 0) glowLights.forEach(l => l.intensity = 0);
  updateModeButtons();
}

// ── White mode ───────────────────────────────────────────────────────────────

function applyWhiteMode() {
  document.body.style.background = whiteMode ? 'white' : '#111111';
  scene.background = new THREE.Color(whiteMode ? 0xffffff : 0x111111);

  const textColor = whiteMode ? '#000' : '#fff';
  label.style.color = textColor;
  musicBtn.style.color = textColor;

  const textColorHex = whiteMode ? 0x000000 : 0xffffff;
  allSceneTexts.forEach(t => { t.color = textColorHex; t.sync(); });

  updateSetButtons();
  updateModeButtons();
}

// ── Set switching ────────────────────────────────────────────────────────────

function switchSet(index) {
  currentSetIndex = index;
  modelCache.clear();
  currentModelIndex = -1;

  const def = currentSetDef();

  // Hide all overlays
  mahoragaText.visible = false;
  allSceneTexts.forEach(t => t.visible = false);
  for (const mesh of Object.values(setLogos)) mesh.visible = false;

  // Star Wars CSS logo
  swLogo.style.display = def.nullBackground ? 'block' : 'none';
  scene.background = def.nullBackground ? null : new THREE.Color(whiteMode ? 0xffffff : 0x111111);

  // Lighting mode
  switchLightingMode(def.defaultLighting ?? 0);
  updateSetButtons();

  // Load default model
  loadModel(def.defaultModel ?? 0);
}

// ── Input ────────────────────────────────────────────────────────────────────

// Build hotkey map from set defs
const hotkeyMap = {};
SET_DEFS.forEach((def, i) => {
  if (def.hotkey) hotkeyMap[def.hotkey] = i;
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    switchSet((currentSetIndex + 1) % SET_DEFS.length);
    return;
  }
  if (e.key === '6') {
    whiteMode = !whiteMode;
    applyWhiteMode();
    return;
  }
  if (hotkeyMap[e.key] !== undefined) {
    switchSet(hotkeyMap[e.key]);
    return;
  }

  const models = currentModels();
  const idx = models.findIndex(m => m.key === e.key);
  if (idx !== -1) loadModel(idx);
  if (e.key === 'ArrowRight') loadModel((currentModelIndex + 1) % models.length);
  if (e.key === 'ArrowLeft') loadModel((currentModelIndex - 1 + models.length) % models.length);
});

// Double tap to cycle models (touch)
let lastTap = 0;
renderer.domElement.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTap < 300) {
    e.preventDefault();
    const models = currentModels();
    loadModel((currentModelIndex + 1) % models.length);
  }
  lastTap = now;
});

// ── Lights ───────────────────────────────────────────────────────────────────

const ambient = new THREE.AmbientLight(0xffffff, 0);
scene.add(ambient);

// Particle system
const particleCount = 5000;
const particleGeo = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
const velocities = new Float32Array(particleCount);
for (let i = 0; i < particleCount; i++) {
  particlePositions[i * 3] = (Math.random() - 0.5) * 30;
  particlePositions[i * 3 + 1] = Math.random() * 25;
  particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 30;
  velocities[i] = 0.01 + Math.random() * 0.03;
}
const particleColors = new Float32Array(particleCount * 3);
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
const particleTexture = new THREE.TextureLoader().load('/textures/star_02.png');
const particleMat = new THREE.PointsMaterial({ size: 0.18, sizeAttenuation: true, map: particleTexture, transparent: true, depthWrite: false, blending: THREE.NormalBlending, vertexColors: true });
const particles = new THREE.Points(particleGeo, particleMat);
particles.visible = false;
scene.add(particles);

// Glow lights for particle mode
const glowLights = [];
const glowCount = 6;
const GLOW_RADIUS = 25;
for (let i = 0; i < glowCount; i++) {
  const light = new THREE.PointLight(0xffffff, 0, 8);
  light.position.set(0, -10, 0);
  scene.add(light);
  glowLights.push(light);
}
let lightFrame = 0;
const _tempColor = new THREE.Color();

// Ring lights
const ringGeometry = new THREE.TorusGeometry(3, 0.05, 8, 64);
const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
ringMesh.rotation.x = Math.PI / 2;
ringMesh.visible = false;
scene.add(ringMesh);

const ringLight = new THREE.PointLight(0xffffff, 3, 10);
scene.add(ringLight);
const ringLight2 = new THREE.PointLight(0xffffff, 3, 10);
scene.add(ringLight2);

// Directional ring lights
const dirRingLight = new THREE.DirectionalLight(0xffffff, 0);
dirRingLight.position.set(0, 8, 0);
dirRingLight.target.position.set(0, 0, 0);
scene.add(dirRingLight);
scene.add(dirRingLight.target);

const dirRingLight2 = new THREE.DirectionalLight(0xffffff, 0);
dirRingLight2.position.set(0, 8, 0);
dirRingLight2.target.position.set(0, 0, 0);
scene.add(dirRingLight2);
scene.add(dirRingLight2.target);

const RING_TOP = 8, RING_BOTTOM = -3;
const RING_RANGE = RING_TOP - RING_BOTTOM;
const RING_SPEED = 0.0004;

// Split lighting
const warmLight = new THREE.DirectionalLight(0xff8844, 0);
warmLight.position.set(-3, 3, 2);
scene.add(warmLight);
const coolLight = new THREE.DirectionalLight(0x4488ff, 0);
coolLight.position.set(3, 3, 2);
scene.add(coolLight);

// ── Resize ───────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Lighting update functions ────────────────────────────────────────────────

function resetAllLights() {
  ringLight.intensity = 0;
  ringLight2.intensity = 0;
  dirRingLight.intensity = 0;
  dirRingLight2.intensity = 0;
  warmLight.intensity = 0;
  coolLight.intensity = 0;
}

function updateParticleLighting() {
  resetAllLights();
  ambient.color.set(0xffffff);
  ambient.intensity = 0.08;

  // Animate particles
  const pos = particles.geometry.attributes.position.array;
  for (let i = 0; i < particleCount; i++) {
    pos[i * 3 + 1] -= velocities[i];
    pos[i * 3] += Math.sin(Date.now() * 0.001 + i) * 0.002;
    if (pos[i * 3 + 1] < -1) {
      pos[i * 3 + 1] = 25;
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
  }
  particles.geometry.attributes.position.needsUpdate = true;

  // Particle colors
  const t = Date.now() * 0.005;
  const hueType = currentSetDef().particleHue;
  let baseHue;

  if (lightFrame % 4 === 0) {
    const cols = particles.geometry.attributes.color.array;
    for (let i = 0; i < particleCount; i++) {
      const flicker = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 3 + i * 7.13));
      if (hueType === 'warm') {
        baseHue = 0.04 + Math.sin(t) * 0.02 + Math.sin(t * 2.3) * 0.01 + Math.sin(t * 5.7) * 0.01;
        _tempColor.setHSL(baseHue + Math.sin(i * 3.77 + t) * 0.03, 1.0, 0.35 + flicker * 0.4);
      } else if (hueType === 'rainbow') {
        baseHue = (t * 0.1) % 1.0;
        _tempColor.setHSL((baseHue + i / particleCount + Math.sin(i * 0.5 + t) * 0.1) % 1.0, 1.0, 0.35 + flicker * 0.4);
      } else {
        baseHue = 0;
        _tempColor.setHSL(0, 0, 0.6 + flicker * 0.35);
      }
      cols[i * 3] = _tempColor.r;
      cols[i * 3 + 1] = _tempColor.g;
      cols[i * 3 + 2] = _tempColor.b;
    }
    particles.geometry.attributes.color.needsUpdate = true;
  }
  if (baseHue === undefined) {
    baseHue = hueType === 'warm' ? 0.04 : hueType === 'rainbow' ? (t * 0.1) % 1.0 : 0;
  }

  // Glow lights near model
  if (lightFrame % 4 === 0) {
    const mx = monolith.position.x, my = monolith.position.y, mz = monolith.position.z;
    const nearest = [];
    const pos2 = particles.geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      const dx = pos2[i * 3] - mx, dy = pos2[i * 3 + 1] - my, dz = pos2[i * 3 + 2] - mz;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < GLOW_RADIUS * GLOW_RADIUS) {
        nearest.push({ x: pos2[i * 3], y: pos2[i * 3 + 1], z: pos2[i * 3 + 2], distSq });
        if (nearest.length > glowCount * 3) {
          nearest.sort((a, b) => a.distSq - b.distSq);
          nearest.length = glowCount;
        }
      }
    }
    nearest.sort((a, b) => a.distSq - b.distSq);
    for (let i = 0; i < glowCount; i++) {
      const light = glowLights[i];
      if (i < nearest.length) {
        const p = nearest[i];
        light.position.set(p.x, p.y, p.z);
        light.intensity = (1 - Math.sqrt(p.distSq) / GLOW_RADIUS) * 6;
        light.color.setHSL(baseHue, hueType ? (hueType === 'warm' || hueType === 'rainbow' ? 1.0 : 0) : 0, 0.5);
      } else {
        light.intensity = 0;
      }
    }
  }
  lightFrame++;
}

function getLightingStyle() {
  const def = currentSetDef();
  if (def.lightingOverrides?.[currentModelIndex]) return def.lightingOverrides[currentModelIndex];
  return def.lightingStyle;
}

function updateSceneLighting() {
  const style = getLightingStyle();
  ambient.color.set(0xffffff);
  resetAllLights();

  const angle = Date.now() * 0.0004;

  switch (style) {
    case 'neon':
      ambient.color.set(0xcc44ff);
      ambient.intensity = 1.0;
      warmLight.color.set(0xff1493);
      coolLight.color.set(0x8800ff);
      warmLight.position.set(Math.cos(angle) * 4, 3, Math.sin(angle) * 4);
      coolLight.position.set(Math.cos(angle + Math.PI) * 4, 2, Math.sin(angle + Math.PI) * 4);
      warmLight.intensity = 2;
      coolLight.intensity = 2;
      break;

    case 'splitTone': {
      const a = Date.now() * 0.0003;
      warmLight.color.set(0xff8844);
      coolLight.color.set(0x4488ff);
      warmLight.position.set(Math.cos(a) * 4, 3, Math.sin(a) * 4);
      coolLight.position.set(Math.cos(a + Math.PI) * 4, 3, Math.sin(a + Math.PI) * 4);
      ambient.intensity = 0.3;
      warmLight.intensity = 1.5;
      coolLight.intensity = 1.5;
      break;
    }

    case 'dualRing': {
      ambient.intensity = 0.2;
      const now = Date.now() * RING_SPEED;
      const p1 = now % 1.0, p2 = (now + 0.5) % 1.0;
      dirRingLight.position.set(0, RING_TOP - p1 * RING_RANGE, 2);
      dirRingLight.intensity = 3 * Math.min(Math.min(p1, 1 - p1) * 5, 1);
      dirRingLight2.position.set(0, RING_TOP - p2 * RING_RANGE, -2);
      dirRingLight2.intensity = 3 * Math.min(Math.min(p2, 1 - p2) * 5, 1);
      break;
    }

    case 'singleRing': {
      ambient.intensity = 0.05;
      const now = Date.now() * 0.00015;
      const p = now % 1.0;
      const center = Math.abs(p - 0.5) * 2;
      dirRingLight.position.set(0, RING_TOP - p * RING_RANGE, 2);
      dirRingLight.intensity = 4 * Math.pow(1 - center, 4);
      break;
    }

    case 'ambientOnly':
      ambient.intensity = 2.8;
      break;

    case 'pointRing':
    default: {
      ringLight.distance = 30;
      ringLight2.distance = 30;
      const now = Date.now() * RING_SPEED;
      const p1 = now % 1.0, p2 = (now + 0.5) % 1.0;
      ringLight.position.set(0, RING_TOP - p1 * RING_RANGE, 0);
      ringLight.intensity = 5 * Math.min(Math.min(p1, 1 - p1) * 5, 1);
      ringLight2.position.set(0, RING_TOP - p2 * RING_RANGE, 0);
      ringLight2.intensity = 5 * Math.min(Math.min(p2, 1 - p2) * 5, 1);
      break;
    }
  }
}

// ── Animate ──────────────────────────────────────────────────────────────────

function animate() {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  controls.update();

  if (lightingMode === 1) {
    updateParticleLighting();
  } else {
    updateSceneLighting();
  }

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// ── Boot ─────────────────────────────────────────────────────────────────────

loadModel(0);
