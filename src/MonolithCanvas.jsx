import React, { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

import { createGuiControls, createDefaultGuiParams } from './monolith/gui.js';
import { createLightingRig } from './monolith/lighting.js';
import { createMaterialManager } from './monolith/materials.js';
import { createOverlays } from './monolith/overlays.js';
import { createPostProcessing } from './monolith/postprocessing.js';
import { SET_DEFS } from './monolith/set-defs.js';
import { createUI } from './monolith/ui.js';
import { resolveAssetUrl } from './monolith/asset-url.js';
import {
  createSharedEffectHotkeyListener,
  getHueCycleHue,
  toggleChromaticAberrationState,
  toggleHueCycleState,
  toggleXrayModeState,
} from '../../../src/shared/special-effects/shared-special-effects.ts';

const FX_NONE = 0;
const FX_CINEMATIC = 1;
const FX_DATABEND = 2;
const FX_CROSSHATCH = 3;
const LIGHTING_MODE_SCENE = 0;
const LIGHTING_MODE_PARTICLES = 1;
const LIGHTING_MODE_SHANGHAI_BUND = 2;
const LIGHTING_MODE_LABELS = [
  'A (Scene)',
  'B (Particles)',
  'C (Shanghai Bund)',
];
const SHANGHAI_BUND_HDR_PATH = '/hdri/shanghai_bund_2k.hdr';

function MonolithScene() {
  const { gl, scene, camera, size } = useThree();
  const controlsRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const guiParamsRef = useRef(createDefaultGuiParams());
  const postProcessingRef = useRef(null);
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
  const hdriRef = useRef({
    background: null,
    environmentTarget: null,
  });
  const stateRef = useRef({
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
    currentFx: FX_NONE,
    pendingLightingMode: null,
    firstLoad: true,
  });

  const currentSetDef = () => SET_DEFS[stateRef.current.currentSetIndex];
  const currentModels = () => currentSetDef().models;
  const getLightingModeLabel = (mode) => LIGHTING_MODE_LABELS[mode] ?? LIGHTING_MODE_LABELS[0];
  const getEffectiveWhiteMode = () => (
    stateRef.current.whiteMode && stateRef.current.lightingMode !== LIGHTING_MODE_SHANGHAI_BUND
  );
  const isShanghaiBundModeReady = () => (
    stateRef.current.lightingMode === LIGHTING_MODE_SHANGHAI_BUND
    && Boolean(hdriRef.current.background)
    && Boolean(hdriRef.current.environmentTarget)
  );

  const revealScene = () => {
    if (stateRef.current.pendingLightingMode !== null) {
      switchLightingMode(stateRef.current.pendingLightingMode);
      stateRef.current.pendingLightingMode = null;
    }
    gl.domElement.style.opacity = '1';
  };

  const refreshPostProcessingPasses = () => {
    postProcessingRef.current?.refreshPostProcessingPasses(stateRef.current.currentFx);
  };

  const setHueSaturationUniforms = () => {
    postProcessingRef.current?.setHueSaturation(
      guiParamsRef.current.hue,
      guiParamsRef.current.saturation,
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
    const shanghaiBundModeReady = isShanghaiBundModeReady();

    document.body.style.background = shanghaiBundModeReady
      ? '#06080d'
      : effectiveWhiteMode ? 'white' : '#111111';
    scene.environment = shanghaiBundModeReady
      ? hdriRef.current.environmentTarget.texture
      : null;
    scene.background = shanghaiBundModeReady
      ? hdriRef.current.background
      : currentSetDef().nullBackground
        ? null
        : new THREE.Color(effectiveWhiteMode ? 0xffffff : 0x111111);
    overlaysRef.current?.applyWhiteMode(effectiveWhiteMode);
    overlaysRef.current?.setStarWarsLogoVisible(
      Boolean(currentSetDef().nullBackground)
      && stateRef.current.lightingMode !== LIGHTING_MODE_SHANGHAI_BUND,
    );
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

    if (chromaticChanged) {
      refreshPostProcessingPasses();
    }

    if (chromaticChanged || xrayChanged) {
      guiControlsRef.current?.syncGuiDisplay();
    }

    if (xrayChanged) {
      refreshDisplayedModelMaterials();
    }
  };

  const switchFx = (mode) => {
    stateRef.current.currentFx = mode;
    refreshPostProcessingPasses();
    guiControlsRef.current?.syncGuiDisplay();
  };

  const toggleFx = (mode) => {
    switchFx(stateRef.current.currentFx === mode ? FX_NONE : mode);
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

  const assignModelPostProcessingLayer = (model) => {
    const postProcessing = postProcessingRef.current;
    if (!postProcessing) return;
    model.traverse((child) => {
      child.layers.enable(postProcessing.modelLayer);
    });
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

  const loadModel = (index) => {
    if (!loaderRef.current || index === stateRef.current.currentModelIndex) return;
    stateRef.current.currentModelIndex = index;
    postProcessingRef.current?.triggerGlitch();
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

    loaderRef.current.load(
      resolveAssetUrl(entry.path),
      (gltf) => {
        if (stateRef.current.firstLoad && progressRef.current) {
          stateRef.current.firstLoad = false;
          progressRef.current.container.style.transition = 'opacity 0.4s';
          progressRef.current.container.style.opacity = '0';
          window.setTimeout(() => progressRef.current?.container.remove(), 500);
        }

        const model = gltf.scene;
        const animations = gltf.animations;

        assignModelPostProcessingLayer(model);
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
      (progress) => {
        if (stateRef.current.firstLoad && progress.total && progressRef.current) {
          progressRef.current.bar.style.width = `${Math.round((progress.loaded / progress.total) * 100)}%`;
        }
      },
      (error) => {
        console.error('Failed to load model', entry.path, error);
        gl.domElement.style.opacity = '1';
        if (progressRef.current) {
          progressRef.current.container.style.opacity = '1';
          progressRef.current.bar.style.width = '100%';
          progressRef.current.bar.style.background = '#ff5c5c';
          progressRef.current.container.style.width = '320px';
          const label = progressRef.current.container.firstChild;
          if (label) {
            label.textContent = `failed to load ${entry.name.toLowerCase()}`;
            label.style.color = 'rgba(255,92,92,0.9)';
          }
        }
      },
    );
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

    postProcessingRef.current?.setForcedHueSaturationEnabled(nextState.hueCycleEnabled);
    refreshPostProcessingPasses();
    setHueSaturationUniforms();
    guiControlsRef.current?.syncGuiDisplay();
  };

  const togglePixelMosaic = () => {
    const pp = postProcessingRef.current;
    if (!pp) return;
    pp.setPixelMosaicEnabled(!pp.getPixelMosaicEnabled());
    refreshPostProcessingPasses();
  };

  const toggleThermalVision = () => {
    const pp = postProcessingRef.current;
    if (!pp) return;
    pp.setThermalVisionEnabled(!pp.getThermalVisionEnabled());
    refreshPostProcessingPasses();
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
    camera.layers.enable(1);

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

    const postProcessing = createPostProcessing({
      renderer: gl,
      scene,
      camera,
      getElapsedTime: () => clockRef.current.getElapsedTime(),
      getGuiParams: () => guiParamsRef.current,
      getMonolith: () => monolithRef.current,
    });
    postProcessingRef.current = postProcessing;
    postProcessing.setHueSaturation(guiParamsRef.current.hue, guiParamsRef.current.saturation);

    materialManagerRef.current = createMaterialManager(gl);

    monolithRef.current.layers.enable(postProcessing.modelLayer);
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
      postProcessing,
      onWhiteModeChange: setWhiteMode,
      onLightingModeChange: switchLightingMode,
      onRefreshPostProcessing: refreshPostProcessingPasses,
      triggerGlitch: postProcessing.triggerGlitch,
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

    let disposed = false;
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    pmremGenerator.compileEquirectangularShader();
    const hdriLoader = new RGBELoader();
    hdriLoader.load(
      resolveAssetUrl(SHANGHAI_BUND_HDR_PATH),
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const environmentTarget = pmremGenerator.fromEquirectangular(texture);
        hdriRef.current = { background: texture, environmentTarget };
        applySceneAppearance();
        markDisplayedModelMaterialsDirty();
      },
      undefined,
      (error) => {
        console.error('Failed to load Shanghai Bund HDRI', error);
      },
    );

    const hotkeyMap = {};
    SET_DEFS.forEach((def, index) => {
      if (def.hotkey) hotkeyMap[def.hotkey] = index;
    });

    const handleSharedEffectHotkey = createSharedEffectHotkeyListener({
      cinematic: () => toggleFx(FX_CINEMATIC),
      chromaticAberration: toggleChromaticAberration,
      databend: () => toggleFx(FX_DATABEND),
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

      if (event.key === '5') {
        toggleFx(FX_CROSSHATCH);
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

      const index = Number(event.key) - 1;
      if (!Number.isNaN(index) && index >= 0 && index < currentModels().length) {
        loadModel(index);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    switchSet(stateRef.current.currentSetIndex);
    refreshPostProcessingPasses();
    applySceneAppearance();

    return () => {
      disposed = true;
      window.removeEventListener('keydown', onKeyDown);
      controls.dispose();
      guiControlsRef.current?.destroy();
      uiRef.current?.destroy();
      overlaysRef.current?.destroy();
      postProcessing.composer.dispose();
      postProcessing.bloomPass.dispose();
      postProcessing.scanlinePass.dispose();
      postProcessing.hueSatPass.dispose();
      postProcessing.barrelBlurPass.dispose();
      postProcessing.chromaticAberrationPass.dispose();
      postProcessing.glitchPass.dispose();
      postProcessing.databendPass.dispose();
      postProcessing.crosshatchPass.dispose();
      postProcessing.godRayPass.dispose();
      postProcessing.pixelMosaicPass.dispose();
      postProcessing.thermalVisionPass.dispose();
      progressContainer.remove();
      scene.remove(monolithRef.current);
      scene.environment = null;
      scene.background = null;
      hdriRef.current.environmentTarget?.dispose();
      hdriRef.current.background?.dispose();
      pmremGenerator.dispose();
      dracoLoader.dispose();
      mixerRef.current?.stopAllAction();
    };
  }, [camera, gl, scene]);

  useEffect(() => {
    postProcessingRef.current?.setSize(size.width, size.height);
  }, [size]);

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
      setHueSaturationUniforms();
    }

    if (stateRef.current.lightingMode === LIGHTING_MODE_SCENE) {
      lightingRigRef.current?.updateSceneLighting();
    } else if (stateRef.current.lightingMode === LIGHTING_MODE_PARTICLES) {
      lightingRigRef.current?.updateParticleLighting();
    } else {
      lightingRigRef.current?.updateEnvironmentLighting();
    }

    if (postProcessingRef.current?.getBloomRingActive()) {
      lightingRigRef.current?.animateBloomRing();
    }

    postProcessingRef.current?.updateGlitch(delta);
    postProcessingRef.current?.updateAnimatedUniforms(elapsed);

    if (postProcessingRef.current?.hasActivePostProcessing()) {
      postProcessingRef.current.renderIsolatedModelLayer();
      postProcessingRef.current.composer.render();
      return;
    }

    gl.render(scene, camera);
  }, 1);

  return null;
}

export default function MonolithCanvas() {
  const dpr = useMemo(() => [1, Math.min(window.devicePixelRatio, 2)], []);

  return (
    <Canvas dpr={dpr} gl={{ antialias: true, alpha: true }}>
      <Suspense fallback={null}>
        <MonolithScene />
      </Suspense>
    </Canvas>
  );
}
