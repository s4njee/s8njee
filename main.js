import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import GUI from 'lil-gui';

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
    if (currentSetIndex === 3) {
      model.rotation.x = -0.0215;
      model.rotation.y = 0.288;
      model.rotation.z = 0.288;
    } else {
      model.rotation.y = 0.35;
    }

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

// Debug GUI
const gui = new GUI();
const debugParams = { rotX: 0, rotY: 0.35, rotZ: 0, posY: -1.2 };
gui.add(debugParams, 'rotX', -Math.PI, Math.PI, 0.01).name('Rotation X').onChange(v => { monolith.rotation.x = v; });
gui.add(debugParams, 'rotY', -Math.PI, Math.PI, 0.01).name('Rotation Y').onChange(v => { monolith.rotation.y = v; });
gui.add(debugParams, 'rotZ', -Math.PI, Math.PI, 0.01).name('Rotation Z').onChange(v => { monolith.rotation.z = v; });
gui.add(debugParams, 'posY', -5, 5, 0.1).name('Position Y').onChange(v => { monolith.position.y = v; });

// Load default
loadModel(0);

const ambient = new THREE.AmbientLight(0xffffff, 0);
scene.add(ambient);

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
  controls.update();

  if (currentSetIndex === 0) {
    // Set 1: neon pink/purple
    ringLight.intensity = 0;
    ringLight2.intensity = 0;
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
    ambient.intensity = 0.15;
    warmLight.intensity = 0;
    coolLight.intensity = 0;
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

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);