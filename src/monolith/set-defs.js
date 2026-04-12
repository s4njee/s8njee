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
      { key: '1', name: 'Astolfo', path: '/set1/astolfo.ktx2.glb', mediumPath: '/set1/astolfo.medium.ktx2.glb', lowPath: '/set1/astolfo.low.ktx2.glb' },
      { key: '2', name: 'Astolfo 2', path: '/set1/astolfo2.ktx2.glb', mediumPath: '/set1/astolfo2.medium.ktx2.glb', lowPath: '/set1/astolfo2.low.ktx2.glb' },
      { key: '3', name: 'Astolfo 3', path: '/set1/astolfo3.ktx2.glb', mediumPath: '/set1/astolfo3.medium.ktx2.glb', lowPath: '/set1/astolfo3.low.ktx2.glb' },
      { key: '4', name: 'Astolfo 4', path: '/set1/astolfo4.ktx2.glb', mediumPath: '/set1/astolfo4.medium.ktx2.glb', lowPath: '/set1/astolfo4.low.ktx2.glb' },
      { key: '5', name: 'Astolfo 6', path: '/set1/astolfo6.ktx2.glb', mediumPath: '/set1/astolfo6.medium.ktx2.glb', lowPath: '/set1/astolfo6.low.ktx2.glb' },
      { key: '6', name: 'Angel Devil', path: '/set1/angeldevil1.ktx2.glb', mediumPath: '/set1/angeldevil1.medium.ktx2.glb', lowPath: '/set1/angeldevil1.low.ktx2.glb' },
    ],
    buttonLabel: '1',
    lightingStyle: 'neon',
    particleHue: 'warm',
  },
  {
    models: [
      { key: '1', name: 'Shinji', path: '/set2/shinji.ktx2.glb', mediumPath: '/set2/shinji.medium.ktx2.glb', lowPath: '/set2/shinji.low.ktx2.glb' },
      { key: '2', name: 'Misato', path: '/set2/misato.ktx2.glb', mediumPath: '/set2/misato.medium.ktx2.glb', lowPath: '/set2/misato.low.ktx2.glb' },
      { key: '3', name: 'Shinji 3', path: '/set2/shinji3.ktx2.glb', mediumPath: '/set2/shinji3.medium.ktx2.glb', lowPath: '/set2/shinji3.low.ktx2.glb' },
      { key: '4', name: 'Shinji 4', path: '/set2/shinji4.ktx2.glb', mediumPath: '/set2/shinji4.medium.ktx2.glb', lowPath: '/set2/shinji4.low.ktx2.glb' },
      { key: '5', name: 'Asushin', path: '/set2/asushin.ktx2.glb', mediumPath: '/set2/asushin.medium.ktx2.glb', lowPath: '/set2/asushin.low.ktx2.glb' },
    ],
    buttonLabel: '2',
    lightingStyle: 'splitTone',
    particleHue: 'rainbow',
  },
  {
    models: [
      { key: '1', name: 'EVA-01 Running', path: '/set3/eva01running.ktx2.glb', mediumPath: '/set3/eva01running.medium.ktx2.glb', lowPath: '/set3/eva01running.low.ktx2.glb' },
      { key: '2', name: 'EVA-02 Running', path: '/set3/eva02running.ktx2.glb', mediumPath: '/set3/eva02running.medium.ktx2.glb', lowPath: '/set3/eva02running.low.ktx2.glb' },
      { key: '3', name: 'Angel Walk', path: '/set3/angelwalk.ktx2.glb', mediumPath: '/set3/angelwalk.medium.ktx2.glb', lowPath: '/set3/angelwalk.low.ktx2.glb' },
      { key: '4', name: 'EVA-01 Running 2', path: '/set3/eva01running2.ktx2.glb', mediumPath: '/set3/eva01running2.medium.ktx2.glb', lowPath: '/set3/eva01running2.low.ktx2.glb' },
      { key: '5', name: 'EVA-02 Running 2', path: '/set3/eva02running2.ktx2.glb', mediumPath: '/set3/eva02running2.medium.ktx2.glb', lowPath: '/set3/eva02running2.low.ktx2.glb' },
      { key: '6', name: 'EVA-01', path: '/set3/eva01.ktx2.glb', mediumPath: '/set3/eva01.medium.ktx2.glb', lowPath: '/set3/eva01.low.ktx2.glb' },
      { key: '7', name: 'EVA-02', path: '/set3/eva02.ktx2.glb', mediumPath: '/set3/eva02.medium.ktx2.glb', lowPath: '/set3/eva02.low.ktx2.glb' },
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
      { key: '1', name: 'X-Wing', path: '/set4/1xwing.ktx2.glb', mediumPath: '/set4/1xwing.medium.ktx2.glb', lowPath: '/set4/1xwing.low.ktx2.glb' },
      { key: '2', name: 'TIE Fighter', path: '/set4/2tie.ktx2.glb', mediumPath: '/set4/2tie.medium.ktx2.glb', lowPath: '/set4/2tie.low.ktx2.glb' },
      { key: '3', name: 'Star Destroyer', path: '/set4/3sd.ktx2.glb', mediumPath: '/set4/3sd.medium.ktx2.glb', lowPath: '/set4/3sd.low.ktx2.glb' },
      { key: '4', name: 'R90', path: '/set4/zr90.ktx2.glb', mediumPath: '/set4/zr90.medium.ktx2.glb', lowPath: '/set4/zr90.low.ktx2.glb' },
    ],
    buttonLabel: '4',
    lightingStyle: 'pointRing',
    positionYOffset: 0.8,
    rotationOverride: { x: -0.0215, y: 0.288, z: 0.288 },
    nullBackground: true,
  },
  {
    models: [
      { key: '1', name: 'Mahoraga', path: '/set5/mahoraga.ktx2.glb', mediumPath: '/set5/mahoraga.medium.ktx2.glb', lowPath: '/set5/mahoraga.low.ktx2.glb' },
      { key: '2', name: 'Denji', path: '/set5/denji.ktx2.glb', mediumPath: '/set5/denji.medium.ktx2.glb', lowPath: '/set5/denji.low.ktx2.glb' },
    ],
    buttonLabel: '✱',
    lightingStyle: 'streetlightSlow',
    materialStyle: 'anime',
  },
  {
    models: [
      { key: '1', name: 'Sanji', path: '/set6/sanji.ktx2.glb', mediumPath: '/set6/sanji.medium.ktx2.glb', lowPath: '/set6/sanji.low.ktx2.glb' },
      { key: '2', name: 'Sanji 2', path: '/set6/sanji2.ktx2.glb', mediumPath: '/set6/sanji2.medium.ktx2.glb', lowPath: '/set6/sanji2.low.ktx2.glb' },
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
      { key: '1', name: 'Rimuru', path: '/set8/rimuru.ktx2.glb', mediumPath: '/set8/rimuru.medium.ktx2.glb', lowPath: '/set8/rimuru.low.ktx2.glb' },
      { key: '2', name: 'Diablo', path: '/set8/diablo.ktx2.glb', mediumPath: '/set8/diablo.medium.ktx2.glb', lowPath: '/set8/diablo.low.ktx2.glb' },
      { key: '3', name: 'Veldora', path: '/set8/veldora.ktx2.glb', mediumPath: '/set8/veldora.medium.ktx2.glb', lowPath: '/set8/veldora.low.ktx2.glb' },
      { key: '4', name: 'Rimuru 2', path: '/set8/rimuru2.ktx2.glb', mediumPath: '/set8/rimuru2.medium.ktx2.glb', lowPath: '/set8/rimuru2.low.ktx2.glb' },
      { key: '5', name: 'Rimuru 3', path: '/set8/rimuru3.ktx2.glb', mediumPath: '/set8/rimuru3.medium.ktx2.glb', lowPath: '/set8/rimuru3.low.ktx2.glb' },
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
      { key: '1', name: 'Asuka', path: '/misc/asuka.ktx2.glb', mediumPath: '/misc/asuka.medium.ktx2.glb', lowPath: '/misc/asuka.low.ktx2.glb' },
      { key: '2', name: 'Akira', path: '/misc/akira.ktx2.glb', mediumPath: '/misc/akira.medium.ktx2.glb', lowPath: '/misc/akira.low.ktx2.glb' },
      { key: '3', name: 'Ubel', path: '/misc/ubel.ktx2.glb', mediumPath: '/misc/ubel.medium.ktx2.glb', lowPath: '/misc/ubel.low.ktx2.glb' },
      { key: '4', name: 'Wing Zero', path: '/misc/wingzero.ktx2.glb', mediumPath: '/misc/wingzero.medium.ktx2.glb', lowPath: '/misc/wingzero.low.ktx2.glb' },
      { key: '5', name: 'Emil', path: '/misc/emil.ktx2.glb', mediumPath: '/misc/emil.medium.ktx2.glb', lowPath: '/misc/emil.low.ktx2.glb' },
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
