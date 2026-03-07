import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.5, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

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
    { key: '5', name: 'Astolfo 5', path: '/set1/astolfo5.glb' },
    { key: '6', name: 'Astolfo 6', path: '/set1/astolfo6.glb' },
    { key: '7', name: 'Angel Devil', path: '/set1/angeldevil1.glb' },
  ],
  [
    { key: '1', name: 'Shinji', path: '/set2/shinji.glb' },
    { key: '2', name: 'Shinji 2', path: '/set2/shinji2.glb' },
    { key: '3', name: 'Shinji 3', path: '/set2/shinji3.glb' },
    { key: '4', name: 'Shinji 4', path: '/set2/shinji4.glb' },
  ],
  [
    { key: '1', name: 'EVA-01', path: '/set3/eva01.glb' },
    { key: '2', name: 'EVA-02', path: '/set3/eva02.glb' },
  ],
  [
    { key: '1', name: 'X-Wing', path: '/set4/1xwing.glb' },
    { key: '2', name: 'TIE Fighter', path: '/set4/2tie.glb' },
    { key: '3', name: 'Star Destroyer', path: '/set4/3sd.glb' },
    { key: '4', name: 'R90', path: '/set4/zr90.glb' },
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

function loadModel(index) {
  if (index === currentModelIndex) return;
  currentModelIndex = index;
  const entry = models[index];

  if (modelCache.has(index)) {
    swapModel(modelCache.get(index), entry.name);
    return;
  }

  loader.load(entry.path, (gltf) => {
    const model = gltf.scene;
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
    model.rotation.y = 0.35;

    modelCache.set(index, model);
    swapModel(model, entry.name);
  });
}

function swapModel(model, name) {
  scene.remove(monolith);
  monolith = model;
  scene.add(monolith);
  updateLabel(name);
}

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
  btn.textContent = i + 1;
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

function switchSet(index) {
  currentSetIndex = index;
  models = sets[index];
  modelCache.clear();
  currentModelIndex = -1;
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

// Red snow particles
const particleCount = 5000;
const particleGeo = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const velocities = new Float32Array(particleCount);
for (let i = 0; i < particleCount; i++) {
  positions[i * 3] = (Math.random() - 0.5) * 30;
  positions[i * 3 + 1] = Math.random() * 25;
  positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
  velocities[i] = 0.01 + Math.random() * 0.03;
}
const colors = new Float32Array(particleCount * 3);
particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
const particleTexture = new THREE.TextureLoader().load('/textures/star_02.png');
const particleMat = new THREE.PointsMaterial({ size: 0.18, sizeAttenuation: true, map: particleTexture, transparent: true, depthWrite: false, blending: THREE.NormalBlending, vertexColors: true });
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// Minimal ambient so the cross is only lit by "particle" glow
const ambient = new THREE.AmbientLight(0xffffff, 0.03);
scene.add(ambient);

// Point lights that track the nearest particles to the cross
const glowLights = [];
const glowCount = 12; // balanced between quality and perf
const GLOW_RADIUS = 25;
for (let i = 0; i < glowCount; i++) {
  const light = new THREE.PointLight(0xffffff, 0, 8);
  light.position.set(0, -10, 0);
  scene.add(light);
  glowLights.push(light);
}

let lightFrame = 0; // throttle light updates

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animate
function animate() {
  controls.update();

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

  // Per-set particle colors — update every 3rd frame
  const t = Date.now() * 0.005;
  let baseHue;
  if (lightFrame % 3 === 0) {
    const cols = particles.geometry.attributes.color.array;
    const _c = new THREE.Color();
    for (let i = 0; i < particleCount; i++) {
      const flicker = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 3 + i * 7.13));
      if (currentSetIndex === 0) {
        // Set 1: red/orange embers
        baseHue = 0.04 + Math.sin(t) * 0.02 + Math.sin(t * 2.3) * 0.01 + Math.sin(t * 5.7) * 0.01;
        const h = baseHue + Math.sin(i * 3.77 + t) * 0.03;
        _c.setHSL(h, 1.0, 0.35 + flicker * 0.4);
      } else if (currentSetIndex === 1) {
        // Set 2: RGB cycling
        baseHue = (t * 0.1) % 1.0;
        const h = (baseHue + i / particleCount + Math.sin(i * 0.5 + t) * 0.1) % 1.0;
        _c.setHSL(h, 1.0, 0.35 + flicker * 0.4);
      } else {
        // Set 3: white
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

  // Find closest particles — update every 3rd frame
  if (lightFrame % 3 === 0) {
    const mx = monolith.position.x, my = monolith.position.y, mz = monolith.position.z;
    const nearest = [];
    for (let i = 0; i < particleCount; i++) {
      const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
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

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);