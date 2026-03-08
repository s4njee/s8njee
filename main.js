import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Text } from 'troika-three-text';
// import GUI from 'lil-gui';

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

// Loading progress bar (first load only)
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

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.5, 0);
controls.enableDamping = true;
controls.update();

// Load Astolfo GLB model
let monolith = new THREE.Group(); // placeholder until loaded
monolith.position.y = 0;
scene.add(monolith);

// Model switching
const sets = [
  [
    { key: '1', name: 'Astolfo', path: '/set1/astolfo.glb' },
    { key: '2', name: 'Astolfo 2', path: '/set1/astolfo2.glb' },
    { key: '3', name: 'Astolfo 3', path: '/set1/astolfo3.glb' },
    { key: '4', name: 'Astolfo 4', path: '/set1/astolfo4.glb' },
    { key: '5', name: 'Astolfo 6', path: '/set1/astolfo6.glb' },
    { key: '6', name: 'Angel Devil', path: '/set1/angeldevil1.glb' },
  ],
  [
    { key: '1', name: 'Shinji', path: '/set2/shinji.glb' },
    { key: '2', name: 'Shinji 2', path: '/set2/shinji2.glb' },
    { key: '3', name: 'Shinji 3', path: '/set2/shinji3.glb' },
    { key: '4', name: 'Shinji 4', path: '/set2/shinji4.glb' },
  ],
  [
    { key: '1', name: 'EVA-01 Running', path: '/set3/eva01running.glb' },
    { key: '2', name: 'EVA-02 Running', path: '/set3/eva02running.glb' },
    { key: '3', name: 'Angel Walk', path: '/set3/angelwalk.glb' },
    { key: '4', name: 'EVA-01', path: '/set3/eva01.glb' },
    { key: '5', name: 'EVA-02', path: '/set3/eva02.glb' },
  ],
  [
    { key: '1', name: 'X-Wing', path: '/set4/1xwing.glb' },
    { key: '2', name: 'TIE Fighter', path: '/set4/2tie.glb' },
    { key: '3', name: 'Star Destroyer', path: '/set4/3sd.glb' },
    { key: '4', name: 'R90', path: '/set4/zr90.glb' },
  ],
  [
    { key: '1', name: 'Mahoraga', path: '/set5/mahoraga.glb' },
  ],
];
let currentSetIndex = 2;
let models = sets[2];
let currentModelIndex = -1;
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
const modelCache = new Map();
const clock = new THREE.Clock();
let mixer = null;

function updateTextVisibility(index) {
  if (typeof mahoragaText !== 'undefined') {
    mahoragaText.visible = index >= 0 && currentSetIndex === 4;
  }
  if (typeof evaTitle !== 'undefined') {
    evaTitle.visible = currentSetIndex === 2 && index === 0;
    evaSubtitle.visible = currentSetIndex === 2 && index === 0;
    evaJpText.visible = currentSetIndex === 2 && index === 0;
    eva02Title.visible = currentSetIndex === 2 && index === 1;
    eva02Subtitle.visible = currentSetIndex === 2 && index === 1;
    eva02JpText.visible = currentSetIndex === 2 && index === 1;
  }
}

function revealScene() {
  renderer.domElement.style.opacity = '1';
}

function loadModel(index) {
  if (index === currentModelIndex) return;
  currentModelIndex = index;
  // Hide immediately for sync reveal
  renderer.domElement.style.opacity = '0';
  // Hide text until model ready
  updateTextVisibility(-1);
  const entry = models[index];

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
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = (5 / maxDim) * 1.5625;
    model.scale.setScalar(scale);
    box.setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;
    model.position.y += currentSetIndex === 3 ? 0.8 : -1.2;
    if (currentSetIndex === 3) {
      model.rotation.x = -0.0215;
      model.rotation.y = 0.288;
      model.rotation.z = 0.288;
    } else {
      model.rotation.y = 0.35;
    }

    // Strip emissive maps so model responds to scene lighting
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const mat = child.material;
        if (mat.emissiveMap) {
          mat.emissiveMap = null;
          mat.emissive.set(0x000000);
          mat.needsUpdate = true;
        }
        // Reduce metalness for set3 (except Angel Walk)
        if (currentSetIndex === 2 && currentModelIndex !== 2) {
          mat.metalness = Math.min(mat.metalness, 0.2);
          mat.roughness = Math.max(mat.roughness, 0.6);
          if (mat.metalnessMap) mat.metalnessMap = null;
          mat.needsUpdate = true;
        }
        // Glossy for Angel Walk
        if (currentSetIndex === 2 && currentModelIndex === 2) {
          mat.metalness = 0.9;
          mat.roughness = 0.25;
          mat.needsUpdate = true;
        }
        // Anime-style flat shading for set5
        if (currentSetIndex === 4) {
          mat.metalness = 0;
          mat.roughness = 1.0;
          mat.envMap = null;
          mat.envMapIntensity = 0;
          if (mat.metalnessMap) mat.metalnessMap = null;
          if (mat.roughnessMap) mat.roughnessMap = null;
          mat.needsUpdate = true;
        }
      }
    });

    modelCache.set(index, { model, animations });
    const doReveal = () => {
      swapModel(model, entry.name, animations);
      updateTextVisibility(index);
      revealScene();
    };
    // Ensure fade-out has time to complete
    setTimeout(doReveal, 200);
  }, (progress) => {
    if (firstLoad && progress.total) {
      const pct = Math.round((progress.loaded / progress.total) * 100);
      progressBar.style.width = pct + '%';
    }
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
  if (animations && animations.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    animations.forEach((clip) => mixer.clipAction(clip).play());
  }
  updateLabel(name);
}

// Music toggle
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
  if (musicPlaying) {
    bgm.pause();
    musicPlaying = false;
    musicBtn.style.color = 'rgba(255,255,255,0.5)';
    musicBtn.style.textShadow = 'none';
  } else {
    bgm.play();
    musicPlaying = true;
    musicBtn.style.color = '#fff';
    musicBtn.style.textShadow = '0 0 8px rgba(255,255,255,0.6)';
  }
});

// HUD label
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

// Set selector UI
const setNav = document.createElement('div');
setNav.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:10';
document.body.appendChild(setNav);
const setButtons = [];
for (let i = 0; i < sets.length; i++) {
  const btn = document.createElement('div');
  btn.textContent = i === 4 ? '✱' : i + 1;
  btn.style.cssText = 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.3);color:#fff;font:14px/1 monospace;cursor:pointer;background:rgba(255,255,255,0.05);transition:all 0.2s;user-select:none';
  btn.addEventListener('click', () => switchSet(i));
  btn.addEventListener('mouseenter', () => { if (i !== currentSetIndex) btn.style.background = 'rgba(255,255,255,0.15)'; });
  btn.addEventListener('mouseleave', () => { if (i !== currentSetIndex) btn.style.background = 'rgba(255,255,255,0.05)'; });
  setNav.appendChild(btn);
  setButtons.push(btn);
}
function updateSetButtons() {
  setButtons.forEach((btn, i) => {
    btn.style.background = i === currentSetIndex ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.05)';
    btn.style.borderColor = i === currentSetIndex ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
  });
}
updateSetButtons();

// Set4 Star Wars logo — fixed CSS background
const swLogo = document.createElement('img');
swLogo.src = '/set4/starwars_logo_yellow.svg';
swLogo.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-55%);width:50vw;opacity:0.12;pointer-events:none;z-index:0;display:none';
document.body.insertBefore(swLogo, document.body.firstChild);
if (currentSetIndex === 3) swLogo.style.display = 'block';

// Set5 3D title text
const mahoragaText = new Text();
mahoragaText.text = 'EIGHT-HANDLED SWORD\nDIVERGENT SILA\nDIVINE GENERAL\nMAHORAGA';
mahoragaText.font = '/fonts/anton.ttf';
mahoragaText.fontSize = 0.35;
mahoragaText.lineHeight = 1.3;
mahoragaText.color = 0xffffff;
mahoragaText.anchorX = 'center';
mahoragaText.textAlign = 'center';
mahoragaText.anchorY = 'middle';
mahoragaText.position.set(-3.5, 1.5, 0);
mahoragaText.material.transparent = true;
mahoragaText.material.opacity = 0.8;
mahoragaText.visible = currentSetIndex === 4;
mahoragaText.sync();
scene.add(mahoragaText);

// Set3 model 0 (EVA-01 Running) title text
const evaTitle = new Text();
evaTitle.text = 'EVANGELION UNIT-01';
evaTitle.font = '/fonts/evangelion.ttf';
evaTitle.fontSize = 0.4;
evaTitle.letterSpacing = 0.08;
evaTitle.color = 0xffffff;
evaTitle.anchorX = 'left';
evaTitle.anchorY = 'bottom';
evaTitle.position.set(-6.5, 1.2, 0);
evaTitle.material.transparent = true;
evaTitle.material.opacity = 0.85;
evaTitle.visible = currentSetIndex === 2 && currentModelIndex === 0;
evaTitle.sync();
scene.add(evaTitle);

const evaSubtitle = new Text();
evaSubtitle.text = 'MULTIPURPOSE HUMANOID DECISIVE WEAPON, ARTIFICIAL HUMAN';
evaSubtitle.font = '/fonts/evangelion.ttf';
evaSubtitle.fontSize = 0.13;
evaSubtitle.letterSpacing = 0.04;
evaSubtitle.color = 0xffffff;
evaSubtitle.anchorX = 'left';
evaSubtitle.anchorY = 'top';
evaSubtitle.position.set(-6.5, 1.15, 0);
evaSubtitle.material.transparent = true;
evaSubtitle.material.opacity = 0.6;
evaSubtitle.visible = currentSetIndex === 2 && currentModelIndex === 0;
evaSubtitle.sync();
scene.add(evaSubtitle);

const evaJpText = new Text();
evaJpText.text = '汎用ヒト型決戦兵器 人造人間エヴァンゲリオン初号機';
evaJpText.font = '/fonts/evangelion.ttf';
evaJpText.fontSize = 0.13;
evaJpText.letterSpacing = 0.02;
evaJpText.color = 0xffffff;
evaJpText.anchorX = 'left';
evaJpText.anchorY = 'top';
evaJpText.position.set(-6.5, 1.0, 0);
evaJpText.material.transparent = true;
evaJpText.material.opacity = 0.6;
evaJpText.visible = currentSetIndex === 2 && currentModelIndex === 0;
evaJpText.sync();
scene.add(evaJpText);

// Set3 model 1 (EVA-02 Running) title text — right side
const eva02Title = new Text();
eva02Title.text = 'EVANGELION UNIT-02';
eva02Title.font = '/fonts/evangelion.ttf';
eva02Title.fontSize = 0.4;
eva02Title.letterSpacing = 0.08;
eva02Title.color = 0xffffff;
eva02Title.anchorX = 'right';
eva02Title.anchorY = 'bottom';
eva02Title.position.set(6.5, 1.2, 0);
eva02Title.material.transparent = true;
eva02Title.material.opacity = 0.85;
eva02Title.visible = currentSetIndex === 2 && currentModelIndex === 1;
eva02Title.sync();
scene.add(eva02Title);

const eva02Subtitle = new Text();
eva02Subtitle.text = 'MULTIPURPOSE HUMANOID DECISIVE WEAPON, ARTIFICIAL HUMAN';
eva02Subtitle.font = '/fonts/evangelion.ttf';
eva02Subtitle.fontSize = 0.13;
eva02Subtitle.letterSpacing = 0.04;
eva02Subtitle.color = 0xffffff;
eva02Subtitle.anchorX = 'right';
eva02Subtitle.anchorY = 'top';
eva02Subtitle.position.set(6.5, 1.15, 0);
eva02Subtitle.material.transparent = true;
eva02Subtitle.material.opacity = 0.6;
eva02Subtitle.visible = currentSetIndex === 2 && currentModelIndex === 1;
eva02Subtitle.sync();
scene.add(eva02Subtitle);

const eva02JpText = new Text();
eva02JpText.text = '汎用ヒト型決戦兵器 人造人間エヴァンゲリオン弐号機';
eva02JpText.font = '/fonts/evangelion.ttf';
eva02JpText.fontSize = 0.13;
eva02JpText.letterSpacing = 0.02;
eva02JpText.color = 0xffffff;
eva02JpText.anchorX = 'right';
eva02JpText.anchorY = 'top';
eva02JpText.position.set(6.5, 1.0, 0);
eva02JpText.material.transparent = true;
eva02JpText.material.opacity = 0.6;
eva02JpText.visible = currentSetIndex === 2 && currentModelIndex === 1;
eva02JpText.sync();
scene.add(eva02JpText);

function switchSet(index) {
  currentSetIndex = index;
  models = sets[index];
  modelCache.clear();
  currentModelIndex = -1;
  if (mahoragaText) mahoragaText.visible = false;
  swLogo.style.display = index === 3 ? 'block' : 'none';
  scene.background = index === 3 ? null : new THREE.Color(0x111111);
  updateSetButtons();
  loadModel(0);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    switchSet((currentSetIndex + 1) % sets.length);
    return;
  }
  const idx = models.findIndex(m => m.key === e.key);
  if (idx !== -1) loadModel(idx);
  if (e.key === 'ArrowRight') loadModel((currentModelIndex + 1) % models.length);
  if (e.key === 'ArrowLeft') loadModel((currentModelIndex - 1 + models.length) % models.length);
});

// Load default
loadModel(0);

const ambient = new THREE.AmbientLight(0xffffff, 0);
scene.add(ambient);

// Lighting mode: 0 = current (elevator/split), 1 = particles
let lightingMode = 0;

// Particle system (from shinji branch)
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

// Lighting mode selector (top-left)
const modeNav = document.createElement('div');
modeNav.style.cssText = 'position:fixed;top:16px;left:16px;display:flex;gap:8px;z-index:10';
document.body.appendChild(modeNav);
const modeLabels = ['A', 'B'];
const modeButtons = [];
for (let i = 0; i < 2; i++) {
  const btn = document.createElement('div');
  btn.textContent = modeLabels[i];
  btn.style.cssText = 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.3);color:#fff;font:14px/1 monospace;cursor:pointer;background:rgba(255,255,255,0.05);transition:all 0.2s;user-select:none';
  btn.addEventListener('click', () => switchLightingMode(i));
  btn.addEventListener('mouseenter', () => { if (i !== lightingMode) btn.style.background = 'rgba(255,255,255,0.15)'; });
  btn.addEventListener('mouseleave', () => { if (i !== lightingMode) btn.style.background = 'rgba(255,255,255,0.05)'; });
  modeNav.appendChild(btn);
  modeButtons.push(btn);
}
function updateModeButtons() {
  modeButtons.forEach((btn, i) => {
    btn.style.background = i === lightingMode ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.05)';
    btn.style.borderColor = i === lightingMode ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
  });
}
updateModeButtons();

function switchLightingMode(mode) {
  lightingMode = mode;
  particles.visible = mode === 1;
  if (mode === 0) {
    glowLights.forEach(l => l.intensity = 0);
  }
  updateModeButtons();
}

// Elevator ring light — single ring using a torus mesh for the glow
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

// Cheaper directional lights for set3 (EVA)
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

const RING_TOP = 8;
const RING_BOTTOM = -3;
const RING_RANGE = RING_TOP - RING_BOTTOM;
const RING_SPEED = 0.0004;

// Two-tone split lighting for set 2 (portraits)
const warmLight = new THREE.DirectionalLight(0xff8844, 0);
warmLight.position.set(-3, 3, 2);
scene.add(warmLight);

const coolLight = new THREE.DirectionalLight(0x4488ff, 0);
coolLight.position.set(3, 3, 2);
scene.add(coolLight);

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animate
function animate() {
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  controls.update();

  if (lightingMode === 1) {
    // Particle lighting mode
    ringLight.intensity = 0;
    ringLight2.intensity = 0;
    dirRingLight.intensity = 0;
    dirRingLight2.intensity = 0;
    warmLight.intensity = 0;
    coolLight.intensity = 0;
    ambient.color.set(0xffffff);
    ambient.intensity = 0.08;

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

    const t = Date.now() * 0.005;
    let baseHue;
    if (lightFrame % 4 === 0) {
      const cols = particles.geometry.attributes.color.array;
      const _c = _tempColor;
      for (let i = 0; i < particleCount; i++) {
        const flicker = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 3 + i * 7.13));
        if (currentSetIndex === 0) {
          baseHue = 0.04 + Math.sin(t) * 0.02 + Math.sin(t * 2.3) * 0.01 + Math.sin(t * 5.7) * 0.01;
          const h = baseHue + Math.sin(i * 3.77 + t) * 0.03;
          _c.setHSL(h, 1.0, 0.35 + flicker * 0.4);
        } else if (currentSetIndex === 1) {
          baseHue = (t * 0.1) % 1.0;
          const h = (baseHue + i / particleCount + Math.sin(i * 0.5 + t) * 0.1) % 1.0;
          _c.setHSL(h, 1.0, 0.35 + flicker * 0.4);
        } else {
          baseHue = 0;
          const l = 0.6 + flicker * 0.35;
          _c.setHSL(0, 0, l);
        }
        cols[i * 3] = _c.r;
        cols[i * 3 + 1] = _c.g;
        cols[i * 3 + 2] = _c.b;
      }
      particles.geometry.attributes.color.needsUpdate = true;
    }
    if (baseHue === undefined) baseHue = currentSetIndex === 0 ? 0.04 : currentSetIndex === 1 ? (t * 0.1) % 1.0 : 0;
    const hue = baseHue;

    if (lightFrame % 4 === 0) {
      const mx = monolith.position.x, my = monolith.position.y, mz = monolith.position.z;
      const nearest = [];
      const pos2 = particles.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        const px = pos2[i * 3], py = pos2[i * 3 + 1], pz = pos2[i * 3 + 2];
        const dx = px - mx, dy = py - my, dz = pz - mz;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < GLOW_RADIUS * GLOW_RADIUS) {
          nearest.push({ x: px, y: py, z: pz, distSq });
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
          const dist = Math.sqrt(p.distSq);
          light.intensity = (1 - dist / GLOW_RADIUS) * 6;
          light.color.setHSL(hue, (currentSetIndex >= 2) ? 0 : 1.0, 0.5);
        } else {
          light.intensity = 0;
        }
      }
    }
    lightFrame++;
  } else if (currentSetIndex === 0) {
    // Set 1: neon pink/purple
    ringLight.intensity = 0;
    ringLight2.intensity = 0;
    dirRingLight.intensity = 0;
    dirRingLight2.intensity = 0;
    warmLight.intensity = 0;
    coolLight.intensity = 0;
    ambient.color.set(0xcc44ff);
    ambient.intensity = 1.0;
    const angle = Date.now() * 0.0004;
    // Pink from one side, purple from the other
    warmLight.color.set(0xff1493);
    coolLight.color.set(0x8800ff);
    warmLight.position.set(Math.cos(angle) * 4, 3, Math.sin(angle) * 4);
    coolLight.position.set(Math.cos(angle + Math.PI) * 4, 2, Math.sin(angle + Math.PI) * 4);
    warmLight.intensity = 2;
    coolLight.intensity = 2;
  } else if (currentSetIndex === 1) {
    // Set 2: two-tone split with slow rotation
    ringLight.intensity = 0;
    ringLight2.intensity = 0;
    dirRingLight.intensity = 0;
    dirRingLight2.intensity = 0;
    const angle = Date.now() * 0.0003;
    warmLight.color.set(0xff8844);
    coolLight.color.set(0x4488ff);
    warmLight.position.set(Math.cos(angle) * 4, 3, Math.sin(angle) * 4);
    coolLight.position.set(Math.cos(angle + Math.PI) * 4, 3, Math.sin(angle + Math.PI) * 4);
    ambient.color.set(0xffffff);
    ambient.intensity = 0.3;
    warmLight.intensity = 1.5;
    coolLight.intensity = 1.5;
  } else {
    // Other sets: elevator ring lights (y-axis)
    ambient.color.set(0xffffff);
    warmLight.intensity = 0;
    coolLight.intensity = 0;
    ringLight.intensity = 0;
    ringLight2.intensity = 0;

    if (currentSetIndex === 4) {
      // Mahoraga set: slow dramatic single ring
      ambient.intensity = 0.05;
      dirRingLight2.intensity = 0;
      const now = Date.now() * 0.00015;
      const progress1 = now % 1.0;

      const y1 = RING_TOP - progress1 * RING_RANGE;
      const center = Math.abs(progress1 - 0.5) * 2;
      const fade1 = Math.pow(1 - center, 4);
      dirRingLight.position.set(0, y1, 2);
      dirRingLight.intensity = 4 * fade1;
    } else if (currentSetIndex === 2 && currentModelIndex === 2) {
      // Angel Walk: ambient only, no rings
      ambient.intensity = 2.8;
      dirRingLight.intensity = 0;
      dirRingLight2.intensity = 0;
    } else if (currentSetIndex === 2) {
      // EVA set: dual DirectionalLight rings
      ambient.intensity = 0.2;
      const now = Date.now() * RING_SPEED;
      const progress1 = now % 1.0;
      const progress2 = (now + 0.5) % 1.0;

      const y1 = RING_TOP - progress1 * RING_RANGE;
      const fade1 = Math.min(Math.min(progress1, 1 - progress1) * 5, 1);
      dirRingLight.position.set(0, y1, 2);
      dirRingLight.intensity = 3 * fade1;

      const y2 = RING_TOP - progress2 * RING_RANGE;
      const fade2 = Math.min(Math.min(progress2, 1 - progress2) * 5, 1);
      dirRingLight2.position.set(0, y2, -2);
      dirRingLight2.intensity = 3 * fade2;
    } else {
      // Other sets: PointLights for radial falloff
      dirRingLight.intensity = 0;
      dirRingLight2.intensity = 0;
      ringLight.distance = 30;
      ringLight2.distance = 30;
      const now = Date.now() * RING_SPEED;
      const progress1 = now % 1.0;
      const progress2 = (now + 0.5) % 1.0;

      const y1 = RING_TOP - progress1 * RING_RANGE;
      const fade1 = Math.min(Math.min(progress1, 1 - progress1) * 5, 1);
      ringLight.position.set(0, y1, 0);
      ringLight.intensity = 5 * fade1;

      const y2 = RING_TOP - progress2 * RING_RANGE;
      const fade2 = Math.min(Math.min(progress2, 1 - progress2) * 5, 1);
      ringLight2.position.set(0, y2, 0);
      ringLight2.intensity = 5 * fade2;
    }
  }

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);