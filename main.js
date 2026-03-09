import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Text } from 'troika-three-text';
import GUI from 'lil-gui';


// ── Scene setup ──────────────────────────────────────────────────────────────

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

// ── Post-processing (bloom) ──────────────────────────────────────────────────

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.5, 0.15, 0.77  // strength, radius, threshold
);
bloomPass.enabled = false;
composer.addPass(bloomPass);
// ── Scanline effect ──────────────────────────────────────────────────────────

const ScanlineShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    density: { value: 5.13 },
    opacity: { value: 0.75 },
    scrollSpeed: { value: 0.08 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float density;
    uniform float opacity;
    uniform float scrollSpeed;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float scanline = sin((vUv.y + time * scrollSpeed) * density * 300.0) * 0.5 + 0.5;
      color.rgb = mix(color.rgb, color.rgb * scanline, opacity);
      gl_FragColor = color;
    }
  `,
};

const scanlinePass = new ShaderPass(ScanlineShader);
scanlinePass.enabled = false;
composer.addPass(scanlinePass);

// ── Linocut effect ───────────────────────────────────────────────────────────

const LinocutShader = {
  uniforms: {
    tDiffuse: { value: null },
    scale: { value: 0.85 },
    density: { value: 360.0 },
    noiseScale: { value: 0.0 },
    centerX: { value: 0.5 },
    centerY: { value: 0.5 },
    rotation: { value: 0.0 },
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float scale;
    uniform float density;
    uniform float noiseScale;
    uniform float centerX;
    uniform float centerY;
    uniform float rotation;
    uniform vec2 resolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));

      // Work in screen-space pixels normalized by height, so line density stays
      // visually consistent across aspect ratios and matches the tighter pmndrs look.
      vec2 center = vec2(centerX, centerY);
      vec2 p = (vUv - center) * resolution / resolution.y;

      float s = sin(rotation);
      float c = cos(rotation);
      p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

      // Dense diagonal hatch pattern. Keep density fairly high, and let scale
      // control line width/feel rather than the overall spacing.
      float frequency = density;
      float stripe = 0.5 + 0.5 * sin((p.x + p.y) * frequency);

      // Noise slightly breaks up the mechanical regularity.
      float n = (noise(p * 42.0 + 17.0) - 0.5) * noiseScale;
      stripe = clamp(stripe + n, 0.0, 1.0);

      // scale behaves like line width control: higher scale -> bolder black cuts,
      // but keep the bias narrower so midtones retain more visible detail.
      float widthBias = mix(-0.08, 0.12, clamp(scale, 0.0, 2.0) * 0.5);
      float threshold = clamp(luma + widthBias, 0.0, 1.0);
      float ink = step(stripe, threshold);

      gl_FragColor = vec4(vec3(ink), color.a);
    }
  `,
};

const linocutPass = new ShaderPass(LinocutShader);
linocutPass.enabled = false;
linocutPass.uniforms.scale.value = 0.85;
linocutPass.uniforms.density.value = 360.0;
linocutPass.uniforms.noiseScale.value = 0.0;
linocutPass.uniforms.centerX.value = 0.5;
linocutPass.uniforms.centerY.value = 0.5;
linocutPass.uniforms.rotation.value = 0.0;
composer.addPass(linocutPass);

// ── Hue & Saturation effect ──────────────────────────────────────────────────

const HueSaturationShader = {
  uniforms: {
    tDiffuse: { value: null },
    hue: { value: 0.0 },
    saturation: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float hue;
    uniform float saturation;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Hue rotation
      float angle = hue;
      float s = sin(angle);
      float c = cos(angle);
      vec3 weights = vec3(0.2126, 0.7152, 0.0722);
      float cosComp = 1.0 - c;
      mat3 hueRotation = mat3(
        weights.x + c * (1.0 - weights.x) + s * (-weights.x),
        weights.x + c * (-weights.x) + s * 0.143,
        weights.x + c * (-weights.x) + s * (-(1.0 - weights.x)),
        weights.y + c * (-weights.y) + s * (-weights.y),
        weights.y + c * (1.0 - weights.y) + s * 0.140,
        weights.y + c * (-weights.y) + s * weights.y,
        weights.z + c * (-weights.z) + s * (1.0 - weights.z),
        weights.z + c * (-weights.z) + s * (-0.283),
        weights.z + c * (1.0 - weights.z) + s * weights.z
      );
      color.rgb = hueRotation * color.rgb;

      // Saturation
      float luma = dot(color.rgb, weights);
      color.rgb = mix(vec3(luma), color.rgb, 1.0 + saturation);

      gl_FragColor = color;
    }
  `,
};

const hueSatPass = new ShaderPass(HueSaturationShader);
hueSatPass.enabled = false;
composer.addPass(hueSatPass);

// ── Glitch effect (triggered on model switch) ───────────────────────────────

const GlitchShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    amount: { value: 0.0 },
    seed: { value: 0.0 },
    columns: { value: 0.05 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float amount;
    uniform float seed;
    uniform float columns;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Block displacement
      float blockY = floor(uv.y * (10.0 + seed * 20.0)) / 10.0;
      float blockX = floor(uv.x / columns) * columns;
      float noise = rand(vec2(blockY, seed + time));
      float glitchLine = step(1.0 - amount * 0.3, noise);
      uv.x += glitchLine * (rand(vec2(blockY, time)) - 0.5) * amount * 0.15;

      // Chromatic aberration
      float shift = amount * 0.015 * (rand(vec2(time, seed)) - 0.5);
      vec4 cr = texture2D(tDiffuse, vec2(uv.x + shift, uv.y));
      vec4 cg = texture2D(tDiffuse, uv);
      vec4 cb = texture2D(tDiffuse, vec2(uv.x - shift, uv.y));
      vec4 color = vec4(cr.r, cg.g, cb.b, cg.a);

      // Scanline flicker
      float flicker = rand(vec2(time * 100.0, uv.y * 50.0));
      color.rgb *= 1.0 - amount * 0.08 * step(0.97, flicker);

      gl_FragColor = color;
    }
  `,
};

const glitchPass = new ShaderPass(GlitchShader);
glitchPass.enabled = false;
composer.addPass(glitchPass);

let glitchTimer = null;
const GLITCH_DURATION = 0.4; // seconds
let glitchElapsed = 0;
let glitchActive = false;

function triggerGlitch() {
  if (!postProcessingActive) return;
  glitchPass.enabled = true;
  glitchActive = true;
  glitchElapsed = 0;
  glitchPass.uniforms.seed.value = Math.random() * 100;
}

function updateGlitch(delta) {
  if (!glitchActive) return;
  glitchElapsed += delta;
  const progress = glitchElapsed / guiParams.glitchDuration;
  if (progress >= 1.0) {
    glitchActive = false;
    glitchPass.enabled = false;
    glitchPass.uniforms.amount.value = 0;
    return;
  }
  // Ramp up then down
  const intensity = progress < 0.3
    ? progress / 0.3
    : 1.0 - ((progress - 0.3) / 0.7);
  glitchPass.uniforms.amount.value = intensity * guiParams.glitchStrength;
  glitchPass.uniforms.time.value = clock.elapsedTime;
}

composer.addPass(new OutputPass());

// 0 = off, 1 = bloom
let currentFx = 0;
let bloomEnabled = false;
let postProcessingActive = false;

function refreshPostProcessingPasses() {
  postProcessingActive = currentFx === 1;
  bloomPass.enabled = postProcessingActive && guiParams.bloomEnabled;
  linocutPass.enabled = postProcessingActive && guiParams.linocutEnabled;
  hueSatPass.enabled = postProcessingActive && guiParams.hueSatEnabled;
  scanlinePass.enabled = postProcessingActive && guiParams.scanlineEnabled;
  bloomEnabled = bloomPass.enabled;
  bloomRingActive = bloomPass.enabled;
}

let bloomRingActive = false;
function switchFx(mode) {
  currentFx = mode;
  refreshPostProcessingPasses();
  gui.controllersRecursive().forEach(c => c.updateDisplay());
  updateFxButtons();
}


// ── lil-gui ──────────────────────────────────────────────────────────────────

const guiParams = {
  showGUI: false,

  // Bloom
  bloomEnabled: true,
  bloomStrength: 0.5,
  bloomRadius: 0.15,
  bloomThreshold: 0.77,

  // Linocut
  linocutEnabled: false,
  linocutScale: 0.85,
  linocutDensity: 360.0,
  linocutNoiseScale: 0.0,
  linocutCenterX: 0.5,
  linocutCenterY: 0.5,
  linocutRotation: 0.0,

  // Hue & Saturation
  hueSatEnabled: false,
  hue: 0.0,
  saturation: 0.0,

  // Glitch (on model switch)
  glitchDuration: 0.4,
  glitchStrength: 1.0,

  // Scanline
  scanlineEnabled: true,
  scanlineDensity: 5.13,
  scanlineOpacity: 0.75,
  scanlineScrollSpeed: 0.08,

  // Tone mapping
  exposure: 0.76,
  toneMapping: 'ACESFilmic',

  // Ambient light
  ambientIntensity: 0.2,
  ambientColor: '#ffffff',

  // Scene
  backgroundColor: '#111111',
  whiteMode: false,

  // Lighting mode
  lightingMode: 'A (Scene)',
};

const gui = new GUI({ title: '⚙ Settings' });
gui.domElement.style.zIndex = '200';
gui.hide(); // hidden by default

// -- Bloom folder --
const bloomFolder = gui.addFolder('Bloom');
bloomFolder.add(guiParams, 'bloomEnabled').name('Enabled').onChange(() => {
  refreshPostProcessingPasses();
});
bloomFolder.add(guiParams, 'bloomStrength', 0, 3, 0.01).name('Strength').onChange((v) => {
  bloomPass.strength = v;
});
bloomFolder.add(guiParams, 'bloomRadius', 0, 1, 0.01).name('Radius').onChange((v) => {
  bloomPass.radius = v;
});
bloomFolder.add(guiParams, 'bloomThreshold', 0, 1, 0.01).name('Threshold').onChange((v) => {
  bloomPass.threshold = v;
});

// -- Linocut folder --
const linocutFolder = gui.addFolder('Linocut');
linocutFolder.add(guiParams, 'linocutEnabled').name('Enabled').onChange(() => {
  refreshPostProcessingPasses();
});
linocutFolder.add(guiParams, 'linocutScale', 0, 2, 0.01).name('Scale').onChange((v) => {
  linocutPass.uniforms.scale.value = v;
});
linocutFolder.add(guiParams, 'linocutDensity', 50, 1600, 1).name('Density').onChange((v) => {
  linocutPass.uniforms.density.value = v;
});
linocutFolder.add(guiParams, 'linocutNoiseScale', 0, 1, 0.01).name('Noise Scale').onChange((v) => {
  linocutPass.uniforms.noiseScale.value = v;
});
linocutFolder.add(guiParams, 'linocutCenterX', 0, 1, 0.01).name('Center X').onChange((v) => {
  linocutPass.uniforms.centerX.value = v;
});
linocutFolder.add(guiParams, 'linocutCenterY', 0, 1, 0.01).name('Center Y').onChange((v) => {
  linocutPass.uniforms.centerY.value = v;
});
linocutFolder.add(guiParams, 'linocutRotation', -Math.PI, Math.PI, 0.01).name('Rotation').onChange((v) => {
  linocutPass.uniforms.rotation.value = v;
});

// -- Hue & Saturation folder --
const hueSatFolder = gui.addFolder('Hue & Saturation');
hueSatFolder.add(guiParams, 'hueSatEnabled').name('Enabled').onChange(() => {
  refreshPostProcessingPasses();
});
hueSatFolder.add(guiParams, 'hue', -Math.PI, Math.PI, 0.001).name('Hue').onChange((v) => {
  hueSatPass.uniforms.hue.value = v;
});
hueSatFolder.add(guiParams, 'saturation', -1, 1, 0.001).name('Saturation').onChange((v) => {
  hueSatPass.uniforms.saturation.value = v;
});

// -- Glitch folder --
const glitchFolder = gui.addFolder('Glitch');
glitchFolder.add(guiParams, 'glitchDuration', 0.1, 2.0, 0.01).name('Duration (s)');
glitchFolder.add(guiParams, 'glitchStrength', 0.1, 3.0, 0.01).name('Strength');
glitchFolder.add({ trigger: () => triggerGlitch() }, 'trigger').name('⚡ Test Glitch');

// -- Scanline folder --
const scanlineFolder = gui.addFolder('Scanline');
scanlineFolder.add(guiParams, 'scanlineEnabled').name('Enabled').onChange(() => {
  refreshPostProcessingPasses();
});
scanlineFolder.add(guiParams, 'scanlineDensity', 0.1, 10, 0.01).name('Density').onChange((v) => {
  scanlinePass.uniforms.density.value = v;
});
scanlineFolder.add(guiParams, 'scanlineOpacity', 0, 1, 0.01).name('Opacity').onChange((v) => {
  scanlinePass.uniforms.opacity.value = v;
});
scanlineFolder.add(guiParams, 'scanlineScrollSpeed', 0, 2, 0.01).name('Scroll Speed').onChange((v) => {
  scanlinePass.uniforms.scrollSpeed.value = v;
});

// -- Tone Mapping folder --
const toneFolder = gui.addFolder('Tone Mapping');
toneFolder.add(guiParams, 'exposure', 0, 3, 0.01).name('Exposure').onChange((v) => {
  renderer.toneMappingExposure = v;
});
toneFolder.add(guiParams, 'toneMapping', ['NoToneMapping', 'Linear', 'Reinhard', 'Cineon', 'ACESFilmic', 'AgX', 'Neutral']).name('Algorithm').onChange((v) => {
  const map = {
    NoToneMapping: THREE.NoToneMapping,
    Linear: THREE.LinearToneMapping,
    Reinhard: THREE.ReinhardToneMapping,
    Cineon: THREE.CineonToneMapping,
    ACESFilmic: THREE.ACESFilmicToneMapping,
    AgX: THREE.AgXToneMapping,
    Neutral: THREE.NeutralToneMapping,
  };
  renderer.toneMapping = map[v] ?? THREE.ACESFilmicToneMapping;
});

// -- Ambient Light folder --
const ambientFolder = gui.addFolder('Ambient Light');
ambientFolder.add(guiParams, 'ambientIntensity', 0, 10, 0.01).name('Intensity');
ambientFolder.addColor(guiParams, 'ambientColor').name('Color');

// -- Scene folder --
const sceneFolder = gui.addFolder('Scene');
sceneFolder.addColor(guiParams, 'backgroundColor').name('Background').onChange((v) => {
  scene.background = new THREE.Color(v);
  document.body.style.background = v;
});
sceneFolder.add(guiParams, 'whiteMode').name('White Mode').onChange((v) => {
  whiteMode = v;
  applyWhiteMode();
});
sceneFolder.add(guiParams, 'lightingMode', ['A (Scene)', 'B (Particles)']).name('Lighting Mode').onChange((v) => {
  switchLightingMode(v === 'A (Scene)' ? 0 : 1);
});

// -- Toggle GUI visibility with 'g' key --
let guiVisible = false;
function toggleGUI() {
  guiVisible = !guiVisible;
  if (guiVisible) gui.show(); else gui.hide();
}

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
//
// Central config for all model sets. Adding a new set is just adding an entry here.
//
// Schema:
//   models[]           – array of { key, name, path } for each model variant
//   buttonLabel        – label shown on the bottom nav button
//   defaultModel       – index to load on set switch (default: 0)
//   hidden             – if true, button is hidden from nav (keyboard-only via hotkey)
//   hotkey             – key to press to switch to this set (for hidden sets)
//   lightingStyle      – which lighting preset to use in mode A:
//                        'neon'        → rotating pink/purple directional lights
//                        'splitTone'   → warm/cool opposing directional lights
//                        'dualRing'    → two directional lights sweeping vertically
//                        'singleRing'  → single dramatic directional sweep
//                        'pointRing'   → two point lights sweeping vertically
//                        'ambientOnly' → flat ambient, no directional
//   lightingOverrides  – per-model lighting style overrides { modelIndex: style }
//   defaultLighting    – default lighting mode (0 = A, 1 = B/particles)
//   particleHue        – particle color scheme in mode B: 'warm' | 'rainbow' | undefined (white)
//   materialStyle      – global material preset: 'anime' strips all PBR for flat look
//   materialOverrides  – array of { match(setIdx, modelIdx), metalness, roughness, clearMetalnessMap }
//   positionYOffset    – vertical offset for model placement (default: -1.2)
//   rotationOverride   – { x, y, z } rotation instead of default y=0.35
//   nullBackground     – if true, scene.background = null (for CSS backgrounds like Star Wars logo)

const SET_DEFS = [
  { // 0: Astolfo – neon pink/purple aesthetic
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
  { // 1: Shinji – rainbow particle glow portraits
    models: [
      { key: '1', name: 'Shinji', path: '/set2/shinji.glb' },
      { key: '2', name: 'Misato', path: '/set2/misato.glb' },
      { key: '3', name: 'Shinji 3', path: '/set2/shinji3.glb' },
      { key: '4', name: 'Shinji 4', path: '/set2/shinji4.glb' },
      { key: '5', name: 'Asushin', path: '/set2/asushin.glb' },
    ],
    buttonLabel: '2',
    lightingStyle: 'splitTone',
    particleHue: 'rainbow',
  },
  { // 2: EVA – dual ring sweep, per-model material + lighting overrides
    models: [
      { key: '1', name: 'EVA-01 Running', path: '/set3/eva01running.glb' },
      { key: '2', name: 'EVA-02 Running', path: '/set3/eva02running.glb' },
      { key: '3', name: 'Angel Walk', path: '/set3/angelwalk.glb' },
      { key: '4', name: 'EVA-01', path: '/set3/eva01.glb' },
      { key: '5', name: 'EVA-02', path: '/set3/eva02.glb' },
    ],
    buttonLabel: '3',
    lightingStyle: 'dualRing',
    // EVA units get reduced metalness; Angel Walk (idx 2) gets glossy instead
    materialOverrides: [
      { match: (si, mi) => mi !== 2, metalness: 0.2, roughness: 0.6, clearMetalnessMap: true },
      { match: (si, mi) => mi === 2, metalness: 0.9, roughness: 0.25 },
    ],
    // Running models get streetlight effect; Angel Walk uses flat ambient
    lightingOverrides: {
      0: 'streetlight',
      1: 'streetlight',
      2: 'streetlightSlow',
    },

  },
  { // 3: Star Wars – transparent background for CSS logo overlay, tilted rotation
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
  { // 4: Mahoraga – dramatic single ring sweep, flat anime shading
    models: [
      { key: '1', name: 'Mahoraga', path: '/set5/mahoraga.glb' },
    ],
    buttonLabel: '✱',
    lightingStyle: 'streetlightSlow',
    materialStyle: 'anime',
  },
  { // 5: One Piece (set6) – hidden, press '7' to access
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
  { // 6: Rimuru (set8) – hidden, press '8' to access, flat anime shading
    models: [
      { key: '1', name: 'Rimuru', path: '/set8/rimuru.glb' },
      { key: '2', name: 'Diablo', path: '/set8/diablo.glb' },
      { key: '3', name: 'Veldora', path: '/set8/veldora.glb' },
      { key: '4', name: 'Rimuru 2', path: '/set8/rimuru2.glb' },
      { key: '5', name: 'Rimuru 3', path: '/set8/rimuru3.glb' },
    ],
    defaultModel: 3,
    hidden: true,
    hotkey: '8',
    buttonLabel: '8',
    lightingStyle: 'dualRing',
    defaultLighting: 1,
    materialStyle: 'anime',
  },
  { // 7: Asuka (misc) – hidden, press '/' to access
    models: [
      { key: '1', name: 'Asuka', path: '/misc/asuka.glb' },
      { key: '2', name: 'Akira', path: '/misc/akira.glb' },
    ],
    hidden: true,
    hotkey: '0',
    buttonLabel: '0',
    lightingStyle: 'ambientOnly',
    rotationOverride: { x: 0.6109, y: 0.35, z: 0 },
    positionYOffsetOverrides: { 1: 0.3 },
    lightingOverrides: { 1: 'dualRingBright' },
  },
];

// ── State ────────────────────────────────────────────────────────────────────

let whiteMode = false;
let currentSetIndex = 2;
let currentModelIndex = -1;
let lightingMode = 0;
let pendingLightingMode = null;

function currentSetDef() { return SET_DEFS[currentSetIndex]; }
function currentModels() { return currentSetDef().models; }

// ── Helpers: materials ───────────────────────────────────────────────────────

// Walk the model's mesh tree and adjust PBR properties based on set config.
// Emissive maps are always stripped so models respond to scene lighting instead
// of having baked-in glow that ignores the ring/particle light effects.
function applyMaterialOverrides(model, setIndex, modelIndex) {
  const def = SET_DEFS[setIndex];
  const hasBloom = def.bloomOverrides?.[modelIndex];

  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mat = child.material;

      if (mat.emissiveMap) {
      mat.emissiveMap = null;
      mat.emissive.set(0x000000);
      mat.needsUpdate = true;
    }

    // Anime-style: zero metalness, full roughness, no env maps → cel-shaded look
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

    // Per-set overrides: clamp metalness down and roughness up (never make shinier
    // than the original asset, only duller). First matching rule wins.
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

// Factory for Troika 3D text objects. All start hidden and get toggled
// by updateTextVisibility() when the relevant set/model is active.
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

// Star Wars logo sits behind the WebGL canvas as a CSS-positioned image
// (visible when set3's nullBackground makes scene.background transparent)
const swLogo = document.createElement('img');
swLogo.src = '/set4/starwars_logo_yellow.svg';
swLogo.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-55%);width:50vw;opacity:0.12;pointer-events:none;z-index:0;display:none';
document.body.insertBefore(swLogo, document.body.firstChild);

// 3D plane logos float in the scene (positioned like title cards).
// They use MeshBasicMaterial so they're unaffected by scene lighting.
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

const fateLogoMesh = create3DLogo('/set1/fate.png', 594 / 290, 2.0, [4.5, 0.5, -3], { alphaTest: 0.01 });
const csmLogoMesh = create3DLogo('/set1/chainsawman.png', 1600 / 900, 3.0, [-4.5, 0.5, -3], { alphaTest: 0.01 });
const evaLogoMesh = create3DLogo('/set2/evangelion_logo.png', 960 / 427, 3.0, [-4.5, 7.0, -3], { alphaTest: 0.01 });
const opLogoMesh = create3DLogo('/set6/onepiece_logo.png', 1600 / 740, 3.0, [-4.5, 7.0, -3]);
const rimuruLogoMesh = create3DLogo('/set8/rimuru_logo.png', 900 / 615, 3.0, [-3.5, 7.0, -3], { alphaTest: 0.01 });

// Map set index → logo mesh (for visibility toggling)
const setLogos = { 0: fateLogoMesh, 1: evaLogoMesh, 5: opLogoMesh, 6: rimuruLogoMesh };

// ── Text/logo visibility ────────────────────────────────────────────────────

function updateTextVisibility(modelIndex) {
  const show = modelIndex >= 0;
  mahoragaText.visible = show && currentSetIndex === 4;

  // 3D logos
  for (const [idx, mesh] of Object.entries(setLogos)) {
    mesh.visible = show && currentSetIndex === Number(idx);
  }

  // Per-model logo overrides
  csmLogoMesh.visible = show && currentSetIndex === 0 && modelIndex === 5;
  if (csmLogoMesh.visible) fateLogoMesh.visible = false;

  // EVA titles
  evaTitle.visible = currentSetIndex === 2 && modelIndex === 0;
  evaSubtitle.visible = currentSetIndex === 2 && modelIndex === 0;
  evaJpText.visible = currentSetIndex === 2 && modelIndex === 0;
  eva02Title.visible = currentSetIndex === 2 && modelIndex === 1;
  eva02Subtitle.visible = currentSetIndex === 2 && modelIndex === 1;
  eva02JpText.visible = currentSetIndex === 2 && modelIndex === 1;
}

// ── Model loading ────────────────────────────────────────────────────────────

// Load a model by index within the current set. Fades out the canvas,
// loads the GLB (or pulls from cache), normalizes scale/position, applies
// material overrides, then fades back in.
function loadModel(index) {
  if (index === currentModelIndex) return;
  currentModelIndex = index;
  triggerGlitch();
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

    // Normalize: fit model into a ~7.8 unit tall bounding box (5 * 1.5625)
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
    const yOffset = def.positionYOffsetOverrides?.[index] ?? def.positionYOffset ?? -1.2;
    model.position.y += yOffset;

    // Rotation
    if (def.rotationOverride) {
      model.rotation.x = def.rotationOverride.x;
      model.rotation.y = def.rotationOverride.y;
      model.rotation.z = def.rotationOverride.z;
    } else {
      model.rotation.y = 0.35;
    }

    // Anisotropic filtering — drastically reduces texture jaggies at oblique angles
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    model.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        for (const prop of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
          if (mat[prop]) {
            mat[prop].anisotropy = maxAniso;
            mat[prop].needsUpdate = true;
          }
        }
      }
    });

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
  if (pendingLightingMode !== null) {
    switchLightingMode(pendingLightingMode);
    pendingLightingMode = null;
  }
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

// Shared button styling — adapts to white mode automatically
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
  guiParams.lightingMode = mode === 0 ? 'A (Scene)' : 'B (Particles)';
  gui.controllersRecursive().forEach(c => c.updateDisplay());
  updateModeButtons();
}

// ── UI: FX selector ──────────────────────────────────────────────────────────

function updateFxButtons() {} // no-op, bloom toggled via key '4'



// ── White mode ───────────────────────────────────────────────────────────────

// Toggle via pressing '6'. Flips background, UI text, 3D text colors,
// and button styling between dark (#111) and white themes.
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
  updateFxButtons();
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
  csmLogoMesh.visible = false;

  // Star Wars CSS logo
  swLogo.style.display = def.nullBackground ? 'block' : 'none';
  scene.background = def.nullBackground ? null : new THREE.Color(whiteMode ? 0xffffff : 0x111111);

  // Defer lighting mode switch until model is ready (via pendingLightingMode)
  pendingLightingMode = def.defaultLighting ?? 0;
  updateSetButtons();

  // Load default model
  loadModel(def.defaultModel ?? 0);
}

// ── Input ────────────────────────────────────────────────────────────────────

// Build hotkey map from SET_DEFS so hidden sets are accessible by key
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
  if (e.key === '4') {
    switchFx(currentFx === 1 ? 0 : 1);
    return;
  }
  if (e.key === '6') {
    whiteMode = !whiteMode;
    guiParams.whiteMode = whiteMode;
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    applyWhiteMode();
    return;
  }
  if (e.key === 'g' || e.key === 'G') {
    toggleGUI();
    return;
  }
  if (e.key === 's' || e.key === 'S') {
    if (scanlinePass.enabled) {
      // Switch to linocut
      scanlinePass.enabled = false;
      linocutPass.enabled = true;
      guiParams.scanlineEnabled = false;
      guiParams.linocutEnabled = true;
    } else if (linocutPass.enabled) {
      // Turn both off
      linocutPass.enabled = false;
      guiParams.linocutEnabled = false;
    } else {
      // Turn on scanline
      scanlinePass.enabled = true;
      guiParams.scanlineEnabled = true;
    }
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    return;
  }
  if (hotkeyMap[e.key] !== undefined) {
    switchSet(hotkeyMap[e.key]);
    return;
  }

  const models = currentModels();
  if (e.key === 'ArrowRight') loadModel((currentModelIndex + 1) % models.length);
  if (e.key === 'ArrowLeft') loadModel((currentModelIndex - 1 + models.length) % models.length);
});

// Double-tap to cycle models on touch devices (300ms threshold)
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

// Particle system — 5000 falling particles with per-set color schemes.
// Used in lighting mode B. Particles drift down and reset to top when they
// fall below y=-1. Nearby particles cast colored glow via 6 point lights.
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

// Ring light mesh (torus) — currently hidden, kept for potential visual use
const ringGeometry = new THREE.TorusGeometry(3, 0.05, 8, 64);
const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
ringMesh.rotation.x = Math.PI / 2;
ringMesh.visible = false;
scene.add(ringMesh);

// Point lights used by 'pointRing' style (set4/Star Wars, fallback)
const ringLight = new THREE.PointLight(0xffffff, 3, 10);
scene.add(ringLight);
const ringLight2 = new THREE.PointLight(0xffffff, 3, 10);
scene.add(ringLight2);

// Streetlight point lights for set3 running models
const streetLight1 = new THREE.PointLight(0xffeedd, 0, 15);
streetLight1.position.set(-1.5, 6, 0);
scene.add(streetLight1);
const streetLight2 = new THREE.PointLight(0xffeedd, 0, 15);
streetLight2.position.set(1.5, 6, 0);
scene.add(streetLight2);

// Directional lights used by 'dualRing' and 'singleRing' styles (EVA, Mahoraga, etc.)
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

// Ring sweep parameters — lights travel from RING_TOP to RING_BOTTOM
const RING_TOP = 8, RING_BOTTOM = -3;
const RING_RANGE = RING_TOP - RING_BOTTOM;
const RING_SPEED = 0.0004; // radians per ms

// Split lighting — warm/cool opposing directional lights for 'splitTone' and 'neon'
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
  composer.setSize(window.innerWidth, window.innerHeight);
  linocutPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
});

// ── Lighting update functions ────────────────────────────────────────────────

// Zero out all non-ambient lights before setting the active ones
function resetAllLights() {
  ringLight.intensity = 0;
  ringLight2.intensity = 0;
  dirRingLight.intensity = 0;
  dirRingLight2.intensity = 0;
  warmLight.intensity = 0;
  coolLight.intensity = 0;
  streetLight1.intensity = 0;
  streetLight2.intensity = 0;
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

// Resolve the active lighting style, checking per-model overrides first
function getLightingStyle() {
  const def = currentSetDef();
  if (def.lightingOverrides?.[currentModelIndex]) return def.lightingOverrides[currentModelIndex];
  return def.lightingStyle;
}

// Mode A lighting — dispatches to the appropriate lighting preset each frame
function updateSceneLighting() {
  const style = getLightingStyle();
  ambient.color.set(0xffffff);
  resetAllLights();

  // If GUI is visible, let the ambient folder override base ambient values
  if (guiVisible) {
    ambient.color.set(guiParams.ambientColor);
  }

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

    case 'dualRingBright': {
      ambient.intensity = 0.4;
      const now2 = Date.now() * RING_SPEED;
      const p1b = now2 % 1.0, p2b = (now2 + 0.5) % 1.0;
      dirRingLight.position.set(0, RING_TOP - p1b * RING_RANGE, 2);
      dirRingLight.intensity = 6 * Math.min(Math.min(p1b, 1 - p1b) * 5, 1);
      dirRingLight2.position.set(0, RING_TOP - p2b * RING_RANGE, -2);
      dirRingLight2.intensity = 6 * Math.min(Math.min(p2b, 1 - p2b) * 5, 1);
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

    case 'streetlightSlow': {
      ambient.intensity = 0.5;
      const STREET_SPEED_S = 0.00012;
      const STREET_FAR_S = 20, STREET_NEAR_S = -15;
      const STREET_RANGE_S = STREET_FAR_S - STREET_NEAR_S;
      const stS = Date.now() * STREET_SPEED_S;
      const p1ss = stS % 1.0;
      const p2ss = (stS + 0.5) % 1.0;
      const z1s = STREET_FAR_S - p1ss * STREET_RANGE_S;
      const z2s = STREET_FAR_S - p2ss * STREET_RANGE_S;
      const falloff1s = Math.exp(-z1s * z1s / 25);
      const falloff2s = Math.exp(-z2s * z2s / 25);
      streetLight1.position.set(-1.5, 6, z1s);
      streetLight2.position.set(1.5, 6, z2s);
      streetLight1.intensity = 20 * falloff1s;
      streetLight2.intensity = 20 * falloff2s;
      break;
    }

    case 'streetlight': {
      ambient.intensity = 0.5;
      const STREET_SPEED = 0.0008;
      const STREET_FAR = 15, STREET_NEAR = -10;
      const STREET_RANGE = STREET_FAR - STREET_NEAR;
      const st = Date.now() * STREET_SPEED;
      const p1s = st % 1.0;
      const p2s = (st + 0.5) % 1.0;
      const z1 = STREET_FAR - p1s * STREET_RANGE;
      const z2 = STREET_FAR - p2s * STREET_RANGE;
      const falloff1 = Math.exp(-z1 * z1 / 18);
      const falloff2 = Math.exp(-z2 * z2 / 18);
      streetLight1.position.set(-1.5, 6, z1);
      streetLight2.position.set(1.5, 6, z2);
      streetLight1.intensity = 20 * falloff1;
      streetLight2.intensity = 20 * falloff2;
      break;
    }

    case 'ambientBright':
      ambient.intensity = 8.4;
      dirRingLight.position.set(0, 10, 2);
      dirRingLight.target.position.set(0, 0, 0);
      dirRingLight.intensity = 6;
      break;

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

  // GUI ambient overrides (when panel is open, slider takes precedence)
  if (guiVisible) {
    ambient.intensity = guiParams.ambientIntensity;
  }
}

// ── Animate ──────────────────────────────────────────────────────────────────

function hasActivePostProcessing() {
  return bloomPass.enabled || scanlinePass.enabled || linocutPass.enabled || hueSatPass.enabled || glitchPass.enabled;
}

function animate() {
  const delta = clock.getDelta();
  scanlinePass.uniforms.time.value = clock.elapsedTime;
  updateGlitch(delta);
  if (mixer) mixer.update(delta);
  controls.update();

  if (lightingMode === 1) {
    updateParticleLighting();
  } else {
    updateSceneLighting();
  }

  // Animate bloom sweep lights (two upper + two lower, offset in phase)
  if (bloomRingActive) {
    const ringSpeed = 0.0004;
    const now = Date.now() * ringSpeed;
    // Upper pair
    const p1 = now % 1.0;
    const p2 = (now + 0.5) % 1.0;
    dirRingLight.position.set(0, RING_TOP - p1 * RING_RANGE, 2);
    dirRingLight.intensity = 1.5 * Math.min(Math.min(p1, 1 - p1) * 5, 1);
    dirRingLight2.position.set(0, RING_TOP - p2 * RING_RANGE, -2);
    dirRingLight2.intensity = 1.5 * Math.min(Math.min(p2, 1 - p2) * 5, 1);
    // Lower pair (narrower range, focused on lower body)
    const LOW_TOP = 3, LOW_BOTTOM = -2, LOW_RANGE = LOW_TOP - LOW_BOTTOM;
    const p3 = (now * 0.8) % 1.0;
    const p4 = (now * 0.8 + 0.5) % 1.0;
    streetLight1.position.set(-1.5, LOW_TOP - p3 * LOW_RANGE, 2);
    streetLight1.intensity = 1.5 * Math.min(Math.min(p3, 1 - p3) * 5, 1);
    streetLight2.position.set(1.5, LOW_TOP - p4 * LOW_RANGE, -2);
    streetLight2.intensity = 1.5 * Math.min(Math.min(p4, 1 - p4) * 5, 1);
  }

  if (hasActivePostProcessing()) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}
renderer.setAnimationLoop(animate);

// ── Boot ─────────────────────────────────────────────────────────────────────

loadModel(0);
