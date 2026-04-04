// ── Set definitions ──────────────────────────────────────────────────────────────
// SET_DEFS is the single source of truth for every model set in Monolith.
// Each entry drives:
//   models          — ordered list of GLB assets for this set
//   buttonLabel     — text shown on the set-switcher button in the UI
//   lightingStyle   — key into sceneLightingEffects in lighting.js
//   particleHue     — colour mode for lighting mode B ('warm', 'rainbow', or undefined for white)
//   materialStyle   — 'anime' applies flat/no-env-map shading; omit for PBR
//   materialOverrides — array of { match(si,mi), metalness, roughness, clearMetalnessMap }
//   lightingOverrides — per model-index lighting style overrides
//   positionYOffset — baseline Y lift applied to every model in the set
//   positionYOffsetOverrides — per model-index Y lift exceptions
//   rotationOverride — { x, y, z } replaces the default y=0.35 rotation
//   nullBackground  — renders scene background as null (transparent / black void)
//   defaultModel    — index to load when entering the set (defaults to 0)
//   defaultLighting — lighting mode to apply on set entry (0=Scene, 1=Particles)
//   hidden          — hides the button; set is only reachable via hotkey
//   hotkey          — keyboard key string that jumps directly to this set
//
// Sets 0–4 are the visible rows in the nav bar.
// Sets 5–7 are hidden easter-egg sets reachable only via number-key hotkeys.

export const SET_DEFS = [
  {
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
  {
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
  {
    models: [
      { key: '1', name: 'EVA-01 Running', path: '/set3/eva01running.glb' },
      { key: '2', name: 'EVA-02 Running', path: '/set3/eva02running.glb' },
      { key: '3', name: 'Angel Walk', path: '/set3/angelwalk.glb' },
      { key: '4', name: 'EVA-01 Running 2', path: '/set3/eva01running2.glb' },
      { key: '5', name: 'EVA-02 Running 2', path: '/set3/eva02running2.glb' },
      { key: '6', name: 'EVA-01', path: '/set3/eva01.glb' },
      { key: '7', name: 'EVA-02', path: '/set3/eva02.glb' },
    ],
    buttonLabel: '3',
    lightingStyle: 'dualRing',
    materialOverrides: [
      { match: (si, mi) => mi !== 2, metalness: 0.2, roughness: 0.6, clearMetalnessMap: true },
      { match: (si, mi) => mi === 2, metalness: 0.9, roughness: 0.25 },
    ],
    lightingOverrides: {
      0: 'streetlight',
      1: 'streetlight',
      2: 'streetlightSlow',
      3: 'streetlight',
      4: 'streetlight',
    },
  },
  {
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
  {
    models: [
      { key: '1', name: 'Mahoraga', path: '/set5/mahoraga.glb' },
      { key: '2', name: 'Denji', path: '/set5/denji.glb' },
    ],
    buttonLabel: '✱',
    lightingStyle: 'streetlightSlow',
    materialStyle: 'anime',
  },
  {
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
  {
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
  {
    models: [
      { key: '1', name: 'Asuka', path: '/misc/asuka.glb' },
      { key: '2', name: 'Akira', path: '/misc/akira.glb' },
      { key: '3', name: 'Ubel', path: '/misc/ubel.glb' },
      { key: '4', name: 'Wing Zero', path: '/misc/wingzero.glb' },
      { key: '5', name: 'Emil', path: '/misc/emil.glb' },
    ],
    hidden: true,
    hotkey: '0',
    buttonLabel: '0',
    lightingStyle: 'ambientOnly',
    rotationOverride: { x: 0.6109, y: 0.35, z: 0 },
    positionYOffsetOverrides: { 1: 0.3 },
    lightingOverrides: { 1: 'dualRingBright', 3: 'dualRingBright' },
  },
];
