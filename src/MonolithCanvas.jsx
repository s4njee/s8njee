import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { createGuiControls, createDefaultGuiParams } from './monolith/gui.js';
import { createLightingRig } from './monolith/lighting.js';
import { createMaterialManager } from './monolith/materials.js';
import { createOverlays } from './monolith/overlays.js';
import { SET_DEFS } from './monolith/set-defs.js';
import { createUI } from './monolith/ui.js';
import { resolveAssetUrl } from './monolith/asset-url.js';
import { executeModelLoad, clearPendingTimeouts, getModelPathForQuality } from './monolith/model-loader.js';
import SafeCanvas from '../../../src/shared/webgl/SafeCanvas.tsx';
import { useFrameRate } from '../../../src/shared/performance/index.ts';
import {
  SharedEffectStack,
  createSharedEffectHotkeyListener,
  getHueCycleHue,
  SHARED_FX_CINEMATIC,
  SHARED_FX_DATABEND,
  SHARED_FX_NONE,
  setChromaticAberrationState,
  toggleChromaticAberrationState,
  toggleHueCycleState,
  toggleSharedFxMode,
  toggleXrayModeState,
} from '../../../src/shared/special-effects/index.ts';

const LIGHTING_MODE_SCENE = 0;
const LIGHTING_MODE_PARTICLES = 1;
const LIGHTING_MODE_LABELS = [
  'A (Scene)',
  'B (Particles)',
];
const CHROMATIC_OSCILLATION_SPEED = 3.2;
const CINEMATIC_AMBIENT_INTENSITY_START = 1;
const CINEMATIC_AMBIENT_INTENSITY_END = 3.2;
const CINEMATIC_BLOOM_INTENSITY_START = 0.2;
const CINEMATIC_BLOOM_INTENSITY_END = 1.2;
const CINEMATIC_BLOOM_OSCILLATION_SPEED = 2.4;
const SET3_INDEX = 2;
const SET3_SPACEBAR_ANIMATION_SPEED = 1.5;

function mapMonolithBloomSettings(guiParams) {
  // Monolith's legacy sliders were tuned for UnrealBloomPass. Translate them
  // into values that read similarly in @react-three/postprocessing's Bloom.
  return {
    intensity: Math.max(1.2, guiParams.bloomStrength * 3.5),
    radius: Math.min(1, (guiParams.bloomRadius * 2.8) + 0.12),
    smoothing: THREE.MathUtils.clamp(0.35 + ((1 - guiParams.bloomThreshold) * 0.5), 0, 1),
    threshold: THREE.MathUtils.clamp((guiParams.bloomThreshold - 0.77) * 0.05, 0, 1),
  };
}

// ── Initial state factory ──────────────────────────────────────────────────────────────

function createInitialMonolithState() {
  return {
    whiteMode: false,
    hueCycleEnabled: false,
    hueCycleBaseHue: 0,
    hueCycleSavedEnabled: false,
    hueCycleSavedHue: 0,
    hueCycleSavedSaturation: 0,
    hueCycleStartTime: 0,
    xrayMode: false,
    restoreChromaticAberrationAfterXray: false,
    currentSetIndex: 2,
    currentModelIndex: -1,
    lightingMode: LIGHTING_MODE_SCENE,
    currentFx: SHARED_FX_NONE,
    cinematicBloomOscillationStartTime: null,
    cinematicBloomIntensityOverride: null,
    pixelMosaicEnabled: false,
    spacebarAnimationBoost: false,
    thermalVisionEnabled: false,
    pendingLightingMode: null,
    animationSpeedBoostEnabled: false,
  };
}

// ── Glitch logic ───────────────────────────────────────────────────────────────────────

function canTriggerMonolithGlitch(state) {
  return (
    state.currentFx === SHARED_FX_CINEMATIC ||
    state.currentFx === SHARED_FX_DATABEND ||
    state.pixelMosaicEnabled ||
    state.thermalVisionEnabled
  );
}

function createMonolithEffectSnapshot(guiParams, state, glitchTriggerToken) {
  const bloom = mapMonolithBloomSettings(guiParams);

  return {
    barrelBlurAmount: guiParams.barrelBlurAmount,
    barrelBlurEnabled: guiParams.barrelBlurEnabled,
    barrelBlurOffsetX: guiParams.barrelBlurOffsetX,
    barrelBlurOffsetY: guiParams.barrelBlurOffsetY,
    bloomEnabled: guiParams.bloomEnabled,
    bloomIntensity: state.cinematicBloomIntensityOverride ?? bloom.intensity,
    bloomRadius: bloom.radius,
    bloomSmoothing: bloom.smoothing,
    bloomThreshold: bloom.threshold,
    chromaticAberrationEnabled: guiParams.chromaticAberrationEnabled,
    chromaticModulationOffset: guiParams.chromaticAberrationModulationOffset,
    chromaticOffsetX: guiParams.chromaticAberrationOffsetX,
    chromaticOffsetY: guiParams.chromaticAberrationOffsetY,
    chromaticOscillationSpeed: CHROMATIC_OSCILLATION_SPEED,
    chromaticRadialModulation: guiParams.chromaticAberrationRadialModulation,
    cinematicEnabled: state.currentFx === SHARED_FX_CINEMATIC,
    databendEnabled: state.currentFx === SHARED_FX_DATABEND,
    glitchDuration: guiParams.glitchDuration,
    glitchEnabled: canTriggerMonolithGlitch(state),
    glitchStrength: guiParams.glitchStrength,
    glitchTriggerToken,
    hue: guiParams.hue,
    hueCycleBaseHue: state.hueCycleBaseHue,
    hueCycleEnabled: state.hueCycleEnabled,
    hueCycleStartTime: state.hueCycleStartTime,
    hueSatEnabled: state.currentFx === SHARED_FX_CINEMATIC && guiParams.hueSatEnabled,
    pixelMosaicEnabled: state.pixelMosaicEnabled,
    saturation: guiParams.saturation,
    scanlineDensity: guiParams.scanlineDensity,
    scanlineEnabled: guiParams.scanlineEnabled,
    scanlineOpacity: guiParams.scanlineOpacity,
    scanlineScrollSpeed: guiParams.scanlineScrollSpeed,
    thermalVisionEnabled: state.thermalVisionEnabled,
  };
}

function MonolithScene({ modelQuality }) {
  const { gl, scene, camera } = useThree();
  const { qualityTier } = useFrameRate();

  // ── Refs ────────────────────────────────────────────────────────────────────
  // All mutable scene values live in refs rather than state so they can be
  // read and written imperatively inside callbacks and the useFrame loop
  // without triggering re-renders. Only effectSnapshot is React state, because
  // SharedEffectStack needs to re-render when post-processing settings change.
  const controlsRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const guiParamsRef = useRef(createDefaultGuiParams());
  const materialManagerRef = useRef(null);
  const overlaysRef = useRef(null);
  const lightingRigRef = useRef(null);
  const uiRef = useRef(null);
  const guiControlsRef = useRef(null);
  const progressRef = useRef(null);
  const loaderRef = useRef(null);
  const modelCacheRef = useRef(new Map()); // session cache keyed by model path; see TODO in root ToDo.md #6
  const mixerRef = useRef(null);
  const monolithRef = useRef(new THREE.Group());
  const stateRef = useRef(createInitialMonolithState());
  const glitchTriggerTokenRef = useRef(0);
  const [effectSnapshot, setEffectSnapshot] = useState(() => (
    createMonolithEffectSnapshot(guiParamsRef.current, stateRef.current, glitchTriggerTokenRef.current)
  ));

  // ── Derived helpers ────────────────────────────────────────────────────────────

  const currentSetDef = () => SET_DEFS[stateRef.current.currentSetIndex];
  const currentModels = () => currentSetDef().models;
  const getLightingModeLabel = (mode) => LIGHTING_MODE_LABELS[mode] ?? LIGHTING_MODE_LABELS[0];
  const getEffectiveWhiteMode = () => stateRef.current.whiteMode;
  const isSet3AnimatedModelActive = () => (
    stateRef.current.currentSetIndex === SET3_INDEX &&
    mixerRef.current !== null
  );
  const syncAnimationPlaybackSpeed = () => {
    if (!mixerRef.current) return;
    mixerRef.current.timeScale = (
      stateRef.current.spacebarAnimationBoost && isSet3AnimatedModelActive()
        ? SET3_SPACEBAR_ANIMATION_SPEED
        : 1
    );
  };

  // ── Effect snapshot ───────────────────────────────────────────────────────────
  // syncEffectSnapshot() is the only way effectSnapshot changes. Calling it
  // causes SharedEffectStack to re-render with the latest settings from both
  // guiParamsRef and stateRef. triggerGlitch increments a token that
  // SharedEffectStack uses to fire a one-shot glitch burst.

  const revealScene = () => {
    if (stateRef.current.pendingLightingMode !== null) {
      switchLightingMode(stateRef.current.pendingLightingMode);
      stateRef.current.pendingLightingMode = null;
    }
    gl.domElement.style.opacity = '1';
  };

  const syncEffectSnapshot = ({ triggerGlitch = false } = {}) => {
    if (triggerGlitch && canTriggerMonolithGlitch(stateRef.current)) {
      glitchTriggerTokenRef.current += 1;
    }

    setEffectSnapshot(
      createMonolithEffectSnapshot(
        guiParamsRef.current,
        stateRef.current,
        glitchTriggerTokenRef.current,
      ),
    );
  };

  // ── Scene / material helpers ──────────────────────────────────────────────────────

  const markDisplayedModelMaterialsDirty = () => {
    monolithRef.current.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.needsUpdate = true;
      });
    });
  };

  const applySceneAppearance = () => {
    const effectiveWhiteMode = getEffectiveWhiteMode();

    document.body.style.background = effectiveWhiteMode ? 'white' : '#111111';
    scene.environment = null;
    scene.background = currentSetDef().nullBackground
      ? null
      : new THREE.Color(effectiveWhiteMode ? 0xffffff : 0x111111);
    overlaysRef.current?.applyWhiteMode(effectiveWhiteMode);
    overlaysRef.current?.setStarWarsLogoVisible(Boolean(currentSetDef().nullBackground));
    uiRef.current?.applyWhiteMode();
  };

  const setWhiteMode = (value) => {
    stateRef.current.whiteMode = value;
    guiParamsRef.current.whiteMode = value;
    applySceneAppearance();
  };

  const applyChromaticXrayState = (nextState) => {
    const chromaticChanged = (
      guiParamsRef.current.chromaticAberrationEnabled !== nextState.chromaticAberrationEnabled
    );
    const xrayChanged = stateRef.current.xrayMode !== nextState.xrayMode;

    guiParamsRef.current.chromaticAberrationEnabled = nextState.chromaticAberrationEnabled;
    stateRef.current.restoreChromaticAberrationAfterXray = nextState.restoreChromaticAfterXray;
    stateRef.current.xrayMode = nextState.xrayMode;

    if (chromaticChanged) syncEffectSnapshot();

    if (chromaticChanged || xrayChanged) {
      guiControlsRef.current?.syncGuiDisplay();
    }

    if (xrayChanged) {
      refreshDisplayedModelMaterials();
    }
  };

  const toggleFx = (mode) => {
    stateRef.current.currentFx = toggleSharedFxMode(stateRef.current.currentFx, mode);
    syncEffectSnapshot();
    guiControlsRef.current?.syncGuiDisplay();
  };

  const toggleCinematicFx = () => {
    const enabling = stateRef.current.currentFx !== SHARED_FX_CINEMATIC;

    stateRef.current.currentFx = enabling ? SHARED_FX_CINEMATIC : SHARED_FX_NONE;
    stateRef.current.cinematicBloomOscillationStartTime = enabling
      ? clockRef.current.getElapsedTime()
      : null;
    stateRef.current.cinematicBloomIntensityOverride = enabling
      ? CINEMATIC_BLOOM_INTENSITY_START
      : null;

    syncEffectSnapshot();
    guiControlsRef.current?.syncGuiDisplay();
  };

  const refreshDisplayedModelMaterials = () => {
    if (stateRef.current.currentModelIndex < 0) return;
    materialManagerRef.current?.applyModelMaterials(
      monolithRef.current,
      currentSetDef(),
      stateRef.current.currentSetIndex,
      stateRef.current.currentModelIndex,
      stateRef.current.xrayMode,
    );
  };

  const swapModel = (model, name, animations) => {
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current = null;
    }

    scene.remove(monolithRef.current);
    monolithRef.current = model;
    scene.add(monolithRef.current);

    if (animations?.length > 0) {
      mixerRef.current = new THREE.AnimationMixer(model);
      animations.forEach((clip) => mixerRef.current.clipAction(clip).play());
      syncAnimationPlaybackSpeed();
    }

    uiRef.current?.updateLabel(name);
  };

  // ── Model loading ────────────────────────────────────────────────────────────────
  // Thin wrapper around executeModelLoad() in monolith/model-loader.js.
  // The loader module owns the full pipeline: progress bar, streaming,
  // GLTF parsing, material application, and the 200ms swap timeout.
  // See docs/agents/loadmodel.md for the extraction plan.

  const loadModel = async (index, { showProgressIfUncached = false, forceReload = false } = {}) => {
    if (!loaderRef.current || (!forceReload && index === stateRef.current.currentModelIndex)) return;
    stateRef.current.currentModelIndex = index;
    syncEffectSnapshot({ triggerGlitch: true });

    const entry = currentModels()[index];
    const resolvedTier = modelQuality === 'auto' ? qualityTier : modelQuality;
    const resolvedPath = getModelPathForQuality(entry, resolvedTier);

    await executeModelLoad({
      index,
      showProgressIfUncached,
      entry: {
        ...entry,
        path: resolvedPath,
      },
      def: currentSetDef(),
      setIndex: stateRef.current.currentSetIndex,
      xrayMode: stateRef.current.xrayMode,
      cacheKey: resolvedPath,
      modelCache: modelCacheRef.current,
      loader: loaderRef.current,
      progress: progressRef.current,
      materialManager: materialManagerRef.current,
      getCurrentModelIndex: () => stateRef.current.currentModelIndex,
      onSwapModel: swapModel,
      onUpdateOverlays: (si, mi) => overlaysRef.current?.updateTextVisibility(si, mi),
      onRevealScene: revealScene,
      canvasDom: gl.domElement,
    });
  };

  useEffect(() => {
    if (stateRef.current.currentModelIndex > -1) {
      loadModel(stateRef.current.currentModelIndex, { forceReload: true });
    }
  }, [qualityTier, modelQuality]);

  // ── Mode switching ────────────────────────────────────────────────────────────────

  const switchLightingMode = (mode) => {
    stateRef.current.lightingMode = mode;
    const particlesOn = mode === LIGHTING_MODE_PARTICLES;
    if (lightingRigRef.current) {
      lightingRigRef.current.setParticleLightingEnabled(particlesOn);
    }
    guiParamsRef.current.lightingMode = getLightingModeLabel(mode);
    applySceneAppearance();
    guiControlsRef.current?.syncGuiDisplay();
    uiRef.current?.updateModeButtons();
  };

  // ── Effect toggles ────────────────────────────────────────────────────────────────

  const toggleWhiteMode = () => {
    setWhiteMode(!stateRef.current.whiteMode);
    guiControlsRef.current?.syncGuiDisplay();
  };

  const toggleChromaticAberration = () => {
    applyChromaticXrayState(toggleChromaticAberrationState({
      chromaticAberrationEnabled: guiParamsRef.current.chromaticAberrationEnabled,
      restoreChromaticAfterXray: stateRef.current.restoreChromaticAberrationAfterXray,
      xrayMode: stateRef.current.xrayMode,
    }));
  };

  const toggleXrayMode = () => {
    applyChromaticXrayState(toggleXrayModeState({
      chromaticAberrationEnabled: guiParamsRef.current.chromaticAberrationEnabled,
      restoreChromaticAfterXray: stateRef.current.restoreChromaticAberrationAfterXray,
      xrayMode: stateRef.current.xrayMode,
    }));
  };

  const toggleHueCycle = () => {
    const nextState = toggleHueCycleState({
      hue: guiParamsRef.current.hue,
      hueCycleBaseHue: stateRef.current.hueCycleBaseHue,
      hueCycleEnabled: stateRef.current.hueCycleEnabled,
      hueCycleSavedEnabled: stateRef.current.hueCycleSavedEnabled,
      hueCycleSavedHue: stateRef.current.hueCycleSavedHue,
      hueCycleSavedSaturation: stateRef.current.hueCycleSavedSaturation,
      hueCycleStartTime: stateRef.current.hueCycleStartTime,
      hueSatEnabled: guiParamsRef.current.hueSatEnabled,
      saturation: guiParamsRef.current.saturation,
    }, clockRef.current.getElapsedTime());

    stateRef.current.hueCycleEnabled = nextState.hueCycleEnabled;
    stateRef.current.hueCycleSavedEnabled = nextState.hueCycleSavedEnabled;
    stateRef.current.hueCycleSavedHue = nextState.hueCycleSavedHue;
    stateRef.current.hueCycleSavedSaturation = nextState.hueCycleSavedSaturation;
    stateRef.current.hueCycleBaseHue = nextState.hueCycleBaseHue;
    stateRef.current.hueCycleStartTime = nextState.hueCycleStartTime;

    guiParamsRef.current.hueSatEnabled = nextState.hueSatEnabled;
    guiParamsRef.current.hue = nextState.hue;
    guiParamsRef.current.saturation = nextState.saturation;

    syncEffectSnapshot();
    guiControlsRef.current?.syncGuiDisplay();
  };

  const togglePixelMosaic = () => {
    stateRef.current.pixelMosaicEnabled = !stateRef.current.pixelMosaicEnabled;
    syncEffectSnapshot();
    guiControlsRef.current?.syncGuiDisplay();
  };

  const toggleThermalVision = () => {
    stateRef.current.thermalVisionEnabled = !stateRef.current.thermalVisionEnabled;
    syncEffectSnapshot();
    guiControlsRef.current?.syncGuiDisplay();
  };

  const switchSet = (index) => {
    stateRef.current.currentSetIndex = index;
    stateRef.current.currentModelIndex = -1;
    if (index !== SET3_INDEX) {
      stateRef.current.spacebarAnimationBoost = false;
    }
    syncAnimationPlaybackSpeed();

    const def = currentSetDef();
    overlaysRef.current?.hideAllOverlays();
    overlaysRef.current?.setStarWarsLogoVisible(Boolean(def.nullBackground));
    applySceneAppearance();

    stateRef.current.pendingLightingMode = def.defaultLighting ?? LIGHTING_MODE_SCENE;
    uiRef.current?.updateSetButtons();
    loadModel(def.defaultModel ?? 0, { showProgressIfUncached: true });
  };

  // ── Setup effect (mount / unmount) ───────────────────────────────────────────────

  useEffect(() => {
    scene.background = new THREE.Color(0x111111);
    document.body.style.background = '#111111';

    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 100;
    camera.position.set(0, 2.5, 14);
    camera.updateProjectionMatrix();

    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.4;
    gl.domElement.style.position = 'relative';
    gl.domElement.style.zIndex = '1';
    gl.domElement.style.transition = 'opacity 0.6s';
    gl.domElement.style.opacity = '0';

    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(0, 2.5, 0);
    controls.enableDamping = true;
    controls.update();
    controlsRef.current = controls;

    materialManagerRef.current = createMaterialManager(gl);

    scene.add(monolithRef.current);

    overlaysRef.current = createOverlays(scene);

    lightingRigRef.current = createLightingRig({
      scene,
      currentSetDef,
      getCurrentModelIndex: () => stateRef.current.currentModelIndex,
      getMonolith: () => monolithRef.current,
      guiParams: guiParamsRef.current,
    });

    uiRef.current = createUI({
      setDefs: SET_DEFS,
      getWhiteMode: getEffectiveWhiteMode,
      getCurrentSetIndex: () => stateRef.current.currentSetIndex,
      getLightingMode: () => stateRef.current.lightingMode,
      onSwitchLightingMode: switchLightingMode,
      onSwitchSet: switchSet,
    });

    guiControlsRef.current = createGuiControls({
      guiParams: guiParamsRef.current,
      renderer: gl,
      scene,
      onWhiteModeChange: setWhiteMode,
      onLightingModeChange: switchLightingMode,
      onChromaticAberrationChange: (enabled) => {
        applyChromaticXrayState(setChromaticAberrationState({
          chromaticAberrationEnabled: guiParamsRef.current.chromaticAberrationEnabled,
          restoreChromaticAfterXray: stateRef.current.restoreChromaticAberrationAfterXray,
          xrayMode: stateRef.current.xrayMode,
        }, enabled));
      },
      onEffectSettingsChange: syncEffectSnapshot,
      onTriggerGlitch: () => syncEffectSnapshot({ triggerGlitch: true }),
    });

    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:200px;z-index:200;opacity:0;pointer-events:none;transition:opacity 0.4s';
    const progressBar = document.createElement('div');
    progressBar.style.cssText = 'width:0%;height:2px;background:#fff;transition:width 0.2s';
    const progressLabel = document.createElement('div');
    progressLabel.style.cssText = 'color:rgba(255,255,255,0.5);font:12px/1 monospace;text-align:center;margin-bottom:8px';
    progressLabel.textContent = 'loading';
    progressContainer.appendChild(progressLabel);
    progressContainer.appendChild(progressBar);
    document.body.appendChild(progressContainer);
    progressRef.current = { bar: progressBar, container: progressContainer };

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(resolveAssetUrl('/draco/'));
    dracoLoader.preload();

    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(resolveAssetUrl('/basis/'));
    ktx2Loader.detectSupport(gl);

    loaderRef.current = new GLTFLoader();
    loaderRef.current.setDRACOLoader(dracoLoader);
    loaderRef.current.setKTX2Loader(ktx2Loader);
    loaderRef.current.setMeshoptDecoder(MeshoptDecoder);

    const hotkeyMap = {};
    SET_DEFS.forEach((def, index) => {
      if (def.hotkey) hotkeyMap[def.hotkey] = index;
    });

    const handleSharedEffectHotkey = createSharedEffectHotkeyListener({
      cinematic: toggleCinematicFx,
      chromaticAberration: toggleChromaticAberration,
      databend: () => toggleFx(SHARED_FX_DATABEND),
      hueCycle: toggleHueCycle,
      pixelMosaic: togglePixelMosaic,
      thermalVision: toggleThermalVision,
      xrayMode: toggleXrayMode,
    });

  // ── Hotkey handler ────────────────────────────────────────────────────────────────
    // Arrow keys → model navigation within the active set.
    // Tab       → cycle sets forward.
    // 6         → toggle white mode.
    // G         → toggle lil-gui debug panel.
    // Number keys (7/8/0) → jump to hidden sets (wired via SET_DEFS.hotkey).
    // All post-processing hotkeys are delegated to handleSharedEffectHotkey.
    const onKeyDown = (event) => {
      if (event.code === 'Space') {
        const shouldBoost = isSet3AnimatedModelActive();
        if (shouldBoost || stateRef.current.spacebarAnimationBoost) {
          event.preventDefault();
        }

        if (!stateRef.current.spacebarAnimationBoost) {
          stateRef.current.spacebarAnimationBoost = true;
          syncAnimationPlaybackSpeed();
        }
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const models = currentModels();
        if (!models.length) return;

        const currentIndex = stateRef.current.currentModelIndex >= 0
          ? stateRef.current.currentModelIndex
          : (currentSetDef().defaultModel ?? 0);
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex = (currentIndex + direction + models.length) % models.length;
        loadModel(nextIndex);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        switchSet((stateRef.current.currentSetIndex + 1) % SET_DEFS.length);
        return;
      }

      if (event.key === '6') {
        toggleWhiteMode();
        return;
      }

      if (event.key === 'g' || event.key === 'G') {
        guiControlsRef.current?.toggleGUI();
        return;
      }

      if (handleSharedEffectHotkey(event)) {
        return;
      }

      if (hotkeyMap[event.key] !== undefined) {
        switchSet(hotkeyMap[event.key]);
        return;
      }
    };

    const onKeyUp = (event) => {
      if (event.code !== 'Space') return;

      if (stateRef.current.spacebarAnimationBoost) {
        stateRef.current.spacebarAnimationBoost = false;
        syncAnimationPlaybackSpeed();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    switchSet(stateRef.current.currentSetIndex);
    syncEffectSnapshot();
    applySceneAppearance();

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      controls.dispose();
      guiControlsRef.current?.destroy();
      uiRef.current?.destroy();
      overlaysRef.current?.destroy();
      progressContainer.remove();
      scene.remove(monolithRef.current);
      scene.environment = null;
      scene.background = null;
      dracoLoader.dispose();
      ktx2Loader.dispose();
      mixerRef.current?.stopAllAction();
      clearPendingTimeouts();
    };
    // camera, gl, and scene are stable R3F singletons — this runs once on mount.
  }, [camera, gl, scene]);

  // ── Per-frame animation loop ─────────────────────────────────────────────────────────

  useFrame((_, delta) => {
    const elapsed = clockRef.current.getElapsedTime();

    controlsRef.current?.update();
    mixerRef.current?.update(delta);
    materialManagerRef.current?.updateXrayAnimation(elapsed);

    if (stateRef.current.cinematicBloomOscillationStartTime !== null) {
      const oscillation = 0.5 + (
        0.5 * Math.sin((elapsed - stateRef.current.cinematicBloomOscillationStartTime) * CINEMATIC_BLOOM_OSCILLATION_SPEED)
      );
      const nextBloomIntensity = THREE.MathUtils.lerp(
        CINEMATIC_BLOOM_INTENSITY_START,
        CINEMATIC_BLOOM_INTENSITY_END,
        oscillation,
      );
      const nextAmbientIntensity = THREE.MathUtils.lerp(
        CINEMATIC_AMBIENT_INTENSITY_START,
        CINEMATIC_AMBIENT_INTENSITY_END,
        oscillation,
      );

      if (stateRef.current.cinematicBloomIntensityOverride !== nextBloomIntensity) {
        stateRef.current.cinematicBloomIntensityOverride = nextBloomIntensity;
        syncEffectSnapshot();
      }

      lightingRigRef.current?.setCinematicAmbientIntensity(nextAmbientIntensity);
    } else {
      lightingRigRef.current?.setCinematicAmbientIntensity(null);
    }

    if (stateRef.current.hueCycleEnabled) {
      guiParamsRef.current.hue = getHueCycleHue(
        stateRef.current.hueCycleBaseHue,
        stateRef.current.hueCycleStartTime,
        elapsed,
      );
      guiParamsRef.current.saturation = 1;
    }

    if (stateRef.current.lightingMode === LIGHTING_MODE_SCENE) {
      lightingRigRef.current?.updateSceneLighting({
        forceRefresh: effectSnapshot.cinematicEnabled && effectSnapshot.bloomEnabled,
      });
    } else if (stateRef.current.lightingMode === LIGHTING_MODE_PARTICLES) {
      lightingRigRef.current?.updateParticleLighting();
    }

    if (effectSnapshot.cinematicEnabled && effectSnapshot.bloomEnabled) {
      lightingRigRef.current?.animateBloomRing();
    }
  });

  return <SharedEffectStack {...effectSnapshot} />;
}

export default function MonolithCanvas({ modelQuality = 'auto' }) {
  const dpr = useMemo(() => [0.75, Math.min(window.devicePixelRatio, 1.5)], []);

  return (
    <SafeCanvas
      dpr={dpr}
      rendererOptions={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      sceneLabel="Monolith"
    >
      <Suspense fallback={null}>
        <MonolithScene modelQuality={modelQuality} />
      </Suspense>
    </SafeCanvas>
  );
}
