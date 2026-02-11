import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 4.5, 0);
controls.enableDamping = true;
controls.update();

// Monolith — 1:4:9 ratio
const width = 4;
const height = 9;
const depth = 1;
const geometry = new THREE.BoxGeometry(width, height, depth);
const material = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.1, metalness: 0.9 });
const monolith = new THREE.Mesh(geometry, material);
monolith.position.y = height / 2;
monolith.rotation.y = 0.35;
monolith.rotation.x = -0.261592653589793;
scene.add(monolith);

// Red snow particles
const particleCount = 1000;
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
const particleTexture = new THREE.TextureLoader().load('/textures/circle_01.png');
const particleMat = new THREE.PointsMaterial({ size: 0.18, sizeAttenuation: true, map: particleTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const particles = new THREE.Points(particleGeo, particleMat);
scene.add(particles);

// Minimal ambient so the monolith is only lit by "particle" glow
const ambient = new THREE.AmbientLight(0xffffff, 0.03);
scene.add(ambient);

// Floating point lights that simulate particle glow on the monolith
const glowLights = [];
const glowCount = 6;
for (let i = 0; i < glowCount; i++) {
  const light = new THREE.PointLight(0xffffff, 8, 12);
  const angle = (i / glowCount) * Math.PI * 2;
  light.position.set(Math.cos(angle) * 5, 2 + (i / glowCount) * 8, Math.sin(angle) * 5);
  scene.add(light);
  glowLights.push({ light, baseAngle: angle, baseY: 2 + (i / glowCount) * 8 });
}

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

  const hue = (Date.now() * 0.0003) % 1;
  particleMat.color.setHSL(hue, 1.0, 0.7);

  // Sync glow lights with particle color and orbit slowly
  const t = Date.now() * 0.0005;
  for (let i = 0; i < glowLights.length; i++) {
    const g = glowLights[i];
    const angle = g.baseAngle + t;
    g.light.position.x = Math.cos(angle) * 5;
    g.light.position.z = Math.sin(angle) * 5;
    g.light.position.y = g.baseY + Math.sin(t * 2 + i) * 1.5;
    g.light.color.setHSL(hue, 1.0, 0.5);
  }

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
