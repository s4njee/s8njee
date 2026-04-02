import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { createGuiControls, createDefaultGuiParams } from './monolith/gui.js';
import { createLightingRig } from './monolith/lighting.js';
import { createMaterialManager } from './monolith/materials.js';
import { createOverlays } from './monolith/overlays.js';
import { SET_DEFS } from './monolith/set-defs.js';
import { createUI } from './monolith/ui.js';
import { resolveAssetUrl } from './monolith/asset-url.js';
import { cachedFetch } from './monolith/model-cache.js';
import SafeCanvas from '../../../src/shared/webgl/SafeCanvas.tsx';
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
    pixelMosaicEnabled: false,
    thermalVisionEnabled: false,
    pendingLightingMode: null,
    firstLoad: true,
  };
}

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
    bloomIntensity: bloom.intensity,
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

function MonolithScene() {
  const { gl, scene, camera } = useThree();
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
  const modelCacheRef = useRef(new Map());
  const mixerRef = useRef(null);
  const monolithRef = useRef(new THREE.Group());
  const stateRef = useRef(createInitialMonolithState());
  const glitchTriggerTokenRef = useRef(0);
  const [effectSnapshot, setEffectSnapshot] = useState(() => (
    createMonolithEffectSnapshot(guiParamsRef.current, stateRef.current, glitchTriggerTokenRef.current)
  ));

  const currentSetDef = () => SET_DEFS[stateRef.current.currentSetIndex];
  const currentModels = () => currentSetDef().models;
  const getLightingModeLabel = (mode) => LIGHTING_MODE_LABELS[mode] ?? LIGHTING_MODE_LABELS[0];
  const getEffectiveWhiteMode = () => stateRef.current.whiteMode;

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
    }

    uiRef.current?.updateLabel(name);
  };

  /** Displays the red "failed to load" progress bar state. */
  const showLoadError = (modelName) => {
    if (progressRef.current) {
      progressRef.current.container.style.opacity = '1';
      progressRef.current.bar.style.width = '100%';
      progressRef.current.bar.style.background = '#ff5c5c';
      progressRef.current.container.style.width = '320px';
      const label = progressRef.current.container.firstChild;
      if (label) {
        label.textContent = `failed to load ${modelName.toLowerCase()}`;
        label.style.color = 'rgba(255,92,92,0.9)';
      }
    }
  };

  const loadModel = (index) => {
    if (!loaderRef.current || index === stateRef.current.currentModelIndex) return;
    stateRef.current.currentModelIndex = index;
    syncEffectSnapshot({ triggerGlitch: true });
    gl.domElement.style.opacity = '0';
    overlaysRef.current?.updateTextVisibility(stateRef.current.currentSetIndex, -1);

    const entry = currentModels()[index];
    const def = currentSetDef();
    const cacheKey = entry.path;

    if (modelCacheRef.current.has(cacheKey)) {
      const cached = modelCacheRef.current.get(cacheKey);
      materialManagerRef.current?.applyModelMaterials(
        cached.model,
        def,
        stateRef.current.currentSetIndex,
        index,
        stateRef.current.xrayMode,
      );
      window.setTimeout(() => {
        swapModel(cached.model, entry.name, cached.animations);
        overlaysRef.current?.updateTextVisibility(stateRef.current.currentSetIndex, index);
        revealScene();
      }, 200);
      return;
    }

    // Fetch the GLB through the persistent Cache API layer, then parse with
    // GLTFLoader.  Using cachedFetch() + parse() instead of loader.load() lets
    // us cache the raw binary response across sessions so revisits skip the
    // network entirely.  DRACO decompression still runs via the DRACOLoader
    // attached to the GLTFLoader instance.
    const modelUrl = resolveAssetUrl(entry.path);

    cachedFetch(modelUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} loading ${entry.path}`);
        }
        return response.arrayBuffer();
      })
      .then((buffer) => {
        loaderRef.current.parse(
          buffer,
          // resourcePath — tells the parser where to resolve relative
          // references (textures, etc.) within the GLB
          resolveAssetUrl(entry.path.substring(0, entry.path.lastIndexOf('/') + 1)),
          (gltf) => {
            if (stateRef.current.firstLoad && progressRef.current) {
              stateRef.current.firstLoad = false;
              progressRef.current.container.style.transition = 'opacity 0.4s';
              progressRef.current.container.style.opacity = '0';
              window.setTimeout(() => progressRef.current?.container.remove(), 500);
            }

            const model = gltf.scene;
            const animations = gltf.animations;

            materialManagerRef.current?.normalizeModelTransform(model, def, index);
            materialManagerRef.current?.applyModelTextureFiltering(model);
            materialManagerRef.current?.applyModelMaterials(
              model,
              def,
              stateRef.current.currentSetIndex,
              index,
              stateRef.current.xrayMode,
            );

            modelCacheRef.current.set(cacheKey, { model, animations });
            window.setTimeout(() => {
              swapModel(model, entry.name, animations);
              overlaysRef.current?.updateTextVisibility(stateRef.current.currentSetIndex, index);
              revealScene();
            }, 200);
          },
          (error) => {
            console.error('Failed to parse model', entry.path, error);
            gl.domElement.style.opacity = '1';
            showLoadError(entry.name);
          },
        );
      })
      .catch((error) => {
        console.error('Failed to load model', entry.path, error);
        gl.domElement.style.opacity = '1';
        showLoadError(entry.name);
      });
  };

  const switchLightingMode = (mode) => {
    stateRef.current.lightingMode = mode;
    if (lightingRigRef.current) {
      lightingRigRef.current.particles.visible = mode === LIGHTING_MODE_PARTICLES;
      if (mode !== LIGHTING_MODE_PARTICLES) lightingRigRef.current.clearParticleGlow();
    }
    guiParamsRef.current.lightingMode = getLightingModeLabel(mode);
    applySceneAppearance();
    markDisplayedModelMaterialsDirty();
    guiControlsRef.current?.syncGuiDisplay();
    uiRef.current?.updateModeButtons();
  };

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

    const def = currentSetDef();
    overlaysRef.current?.hideAllOverlays();
    overlaysRef.current?.setStarWarsLogoVisible(Boolean(def.nullBackground));
    applySceneAppearance();

    stateRef.current.pendingLightingMode = def.defaultLighting ?? LIGHTING_MODE_SCENE;
    uiRef.current?.updateSetButtons();
    loadModel(def.defaultModel ?? 0);
  };

  useEffect(() => {
    scene.background = new THREE.Color(0x111111);
    document.body.style.background = '#111111';

    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 100;
    camera.position.set(0, 2.5, 14);
    camera.updateProjectionMatrix();

    gl.setPixelRatio(window.devicePixelRatio);
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
    progressContainer.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:200px;z-index:200';
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

    loaderRef.current = new GLTFLoader();
    loaderRef.current.setDRACOLoader(dracoLoader);

    const hotkeyMap = {};
    SET_DEFS.forEach((def, index) => {
      if (def.hotkey) hotkeyMap[def.hotkey] = index;
    });

    const handleSharedEffectHotkey = createSharedEffectHotkeyListener({
      cinematic: () => toggleFx(SHARED_FX_CINEMATIC),
      chromaticAberration: toggleChromaticAberration,
      databend: () => toggleFx(SHARED_FX_DATABEND),
      hueCycle: toggleHueCycle,
      pixelMosaic: togglePixelMosaic,
      thermalVision: toggleThermalVision,
      xrayMode: toggleXrayMode,
    });

    const onKeyDown = (event) => {
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

    window.addEventListener('keydown', onKeyDown);

    switchSet(stateRef.current.currentSetIndex);
    syncEffectSnapshot();
    applySceneAppearance();

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      controls.dispose();
      guiControlsRef.current?.destroy();
      uiRef.current?.destroy();
      overlaysRef.current?.destroy();
      progressContainer.remove();
      scene.remove(monolithRef.current);
      scene.environment = null;
      scene.background = null;
      dracoLoader.dispose();
      mixerRef.current?.stopAllAction();
    };
  }, [camera, gl, scene]);

  useFrame((_, delta) => {
    const elapsed = clockRef.current.getElapsedTime();

    controlsRef.current?.update();
    mixerRef.current?.update(delta);
    materialManagerRef.current?.updateXrayAnimation(elapsed);

    if (stateRef.current.hueCycleEnabled) {
      guiParamsRef.current.hue = getHueCycleHue(
        stateRef.current.hueCycleBaseHue,
        stateRef.current.hueCycleStartTime,
        elapsed,
      );
      guiParamsRef.current.saturation = 1;
    }

    if (stateRef.current.lightingMode === LIGHTING_MODE_SCENE) {
      lightingRigRef.current?.updateSceneLighting();
    } else if (stateRef.current.lightingMode === LIGHTING_MODE_PARTICLES) {
      lightingRigRef.current?.updateParticleLighting();
    }

    if (effectSnapshot.cinematicEnabled && effectSnapshot.bloomEnabled) {
      lightingRigRef.current?.animateBloomRing();
    }
  });

  return <SharedEffectStack {...effectSnapshot} />;
}

export default function MonolithCanvas() {
  const dpr = useMemo(() => [1, Math.min(window.devicePixelRatio, 2)], []);

  return (
    <SafeCanvas
      dpr={dpr}
      rendererOptions={{ antialias: true, alpha: true }}
      sceneLabel="Monolith"
    >
      <Suspense fallback={null}>
        <MonolithScene />
      </Suspense>
    </SafeCanvas>
  );
}
