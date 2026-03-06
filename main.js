import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

const loader = new GLTFLoader();
loader.load('/astolfo.glb', (gltf) => {
  const model = gltf.scene;
  // Compute bounding box to normalize size
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = (5 / maxDim) * 1.5625; // ~5 units tall * 1.25 * 1.25
  model.scale.setScalar(scale);
  // Re-center horizontally, sit on ground
  box.setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;

  scene.remove(monolith);
  monolith = model;
  monolith.position.y += -1.2; // offset: adjust this value to move up/down
  monolith.rotation.y = 0.35;
  scene.add(monolith);
});

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

  // Ember colors — update every 3rd frame
  const t = Date.now() * 0.005;
  const baseHue = 0.04 + Math.sin(t) * 0.02 + Math.sin(t * 2.3) * 0.01 + Math.sin(t * 5.7) * 0.01;
  if (lightFrame % 3 === 0) {
    const cols = particles.geometry.attributes.color.array;
    const _c = new THREE.Color();
    for (let i = 0; i < particleCount; i++) {
      const flicker = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 3 + i * 7.13));
      const h = baseHue + Math.sin(i * 3.77 + t) * 0.03;
      _c.setHSL(h, 1.0, 0.35 + flicker * 0.4);
      cols[i * 3] = _c.r;
      cols[i * 3 + 1] = _c.g;
      cols[i * 3 + 2] = _c.b;
    }
    particles.geometry.attributes.color.needsUpdate = true;
  }
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
        light.color.setHSL(hue, 1.0, 0.5);
      } else {
        light.intensity = 0;
      }
    }
  }
  lightFrame++;

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);