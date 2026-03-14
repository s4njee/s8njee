import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import {
  createBarrelBlurShader,
  createChromaticAberrationShader,
  createCrosshatchShader,
  createDatabendShader,
  createGlitchShader,
  createGodRayShader,
  createHueSaturationShader,
  createPixelMosaicShader,
  createScanlineShader,
  createThermalVisionShader,
} from '../../../../src/shared/special-effects/postprocessing-shaders.ts';

export function createPostProcessing({
  renderer,
  scene,
  camera,
  getGuiParams,
  getElapsedTime,
  getMonolith,
}) {
  const GOD_RAY_SAMPLES = 80;
  const GOD_RAY_DEFAULT_DECAY = 0.985;
  const GOD_RAY_DEFAULT_DENSITY = 1.2;
  const GOD_RAY_DEFAULT_WEIGHT = 0.65;
  const GOD_RAY_DEFAULT_EXPOSURE = 1.0;
  const MODEL_LAYER = 1;
  const CHROMATIC_OSCILLATION_SPEED = 3.2;
  const initialWidth = window.innerWidth;
  const initialHeight = window.innerHeight;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const modelLayerTarget = new THREE.WebGLRenderTarget(initialWidth, initialHeight);
  const modelMaskTarget = new THREE.WebGLRenderTarget(initialWidth, initialHeight);
  const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const savedClearColor = new THREE.Color();
  const godRayWorldBounds = new THREE.Box3();
  const godRayWorldCenter = new THREE.Vector3();

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(initialWidth, initialHeight),
    0.5,
    0.15,
    0.77,
  );
  bloomPass.enabled = false;
  composer.addPass(bloomPass);

  const godRayEmissiveTarget = new THREE.WebGLRenderTarget(
    Math.floor(initialWidth / 2),
    Math.floor(initialHeight / 2),
  );
  const godRayEmissiveMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const godRayLightWorldPos = new THREE.Vector3(0, 2.5, 0);
  const godRayScreenPos = new THREE.Vector2(0.5, 0.5);

  const scanlinePass = new ShaderPass(createScanlineShader());
  scanlinePass.enabled = false;
  composer.addPass(scanlinePass);

  const hueSatPass = new ShaderPass(createHueSaturationShader());
  hueSatPass.enabled = false;
  composer.addPass(hueSatPass);

  const barrelBlurPass = new ShaderPass(createBarrelBlurShader());
  barrelBlurPass.enabled = false;
  composer.addPass(barrelBlurPass);

  const chromaticAberrationPass = new ShaderPass(createChromaticAberrationShader());
  chromaticAberrationPass.enabled = false;
  composer.addPass(chromaticAberrationPass);

  const glitchPass = new ShaderPass(createGlitchShader());
  glitchPass.enabled = false;
  composer.addPass(glitchPass);

  const databendPass = new ShaderPass(createDatabendShader());
  databendPass.enabled = false;
  composer.addPass(databendPass);

  const crosshatchPass = new ShaderPass(createCrosshatchShader({
    modelMaskTexture: modelMaskTarget.texture,
    modelTexture: modelLayerTarget.texture,
    width: initialWidth,
    height: initialHeight,
  }));
  crosshatchPass.enabled = false;
  composer.addPass(crosshatchPass);

  const godRayPass = new ShaderPass(createGodRayShader({
    modelMaskTexture: modelMaskTarget.texture,
    occlusionTexture: godRayEmissiveTarget.texture,
    lightPosition: godRayScreenPos,
    exposure: GOD_RAY_DEFAULT_EXPOSURE,
    decay: GOD_RAY_DEFAULT_DECAY,
    density: GOD_RAY_DEFAULT_DENSITY,
    weight: GOD_RAY_DEFAULT_WEIGHT,
    samples: GOD_RAY_SAMPLES,
  }));
  godRayPass.enabled = false;
  composer.addPass(godRayPass);

  const pixelMosaicPass = new ShaderPass(createPixelMosaicShader(initialWidth, initialHeight));
  pixelMosaicPass.enabled = false;
  composer.addPass(pixelMosaicPass);

  const thermalVisionPass = new ShaderPass(createThermalVisionShader(initialWidth, initialHeight));
  thermalVisionPass.enabled = false;
  composer.addPass(thermalVisionPass);

  composer.addPass(new OutputPass());

  let glitchElapsed = 0;
  let glitchActive = false;
  let postProcessingActive = false;
  let bloomRingActive = false;
  let chromaticAberrationStartTime = 0;
  let chromaticAberrationWasEnabled = false;
  let godRaysEnabled = false;
  let pixelMosaicEnabled = false;
  let thermalVisionEnabled = false;
  let forceHueSatPassEnabled = false;

  function refreshPostProcessingPasses(currentFx) {
    const guiParams = getGuiParams();
    const cinematicFxActive = currentFx === 1;
    const databendFxActive = currentFx === 2;
    const crosshatchFxActive = currentFx === 3;
    postProcessingActive = cinematicFxActive || databendFxActive || crosshatchFxActive || godRaysEnabled || pixelMosaicEnabled || thermalVisionEnabled;

    bloomPass.enabled = cinematicFxActive && guiParams.bloomEnabled;
    hueSatPass.enabled = forceHueSatPassEnabled || (cinematicFxActive && guiParams.hueSatEnabled);
    barrelBlurPass.enabled = cinematicFxActive && guiParams.barrelBlurEnabled;
    chromaticAberrationPass.enabled = guiParams.chromaticAberrationEnabled;
    scanlinePass.enabled = cinematicFxActive && guiParams.scanlineEnabled;
    databendPass.enabled = databendFxActive;
    crosshatchPass.enabled = crosshatchFxActive;
    godRayPass.enabled = godRaysEnabled;
    pixelMosaicPass.enabled = pixelMosaicEnabled;
    thermalVisionPass.enabled = thermalVisionEnabled;
    bloomRingActive = bloomPass.enabled;

    if (!databendFxActive) {
      databendPass.uniforms.intensity.value = 0.7;
    }

    if (guiParams.chromaticAberrationEnabled && !chromaticAberrationWasEnabled) {
      chromaticAberrationStartTime = getElapsedTime();
    }
    chromaticAberrationWasEnabled = guiParams.chromaticAberrationEnabled;
    hueSatPass.uniforms.hue.value = guiParams.hue;
    hueSatPass.uniforms.saturation.value = guiParams.saturation;
  }

  function triggerGlitch() {
    if (!postProcessingActive) return;
    glitchPass.enabled = true;
    glitchActive = true;
    glitchElapsed = 0;
    glitchPass.uniforms.seed.value = Math.random() * 100;
  }

  function updateGlitch(delta) {
    if (!glitchActive) return;
    const guiParams = getGuiParams();
    glitchElapsed += delta;
    const progress = glitchElapsed / guiParams.glitchDuration;
    if (progress >= 1.0) {
      glitchActive = false;
      glitchPass.enabled = false;
      glitchPass.uniforms.amount.value = 0;
      return;
    }
    const intensity = progress < 0.3
      ? progress / 0.3
      : 1.0 - ((progress - 0.3) / 0.7);
    glitchPass.uniforms.amount.value = intensity * guiParams.glitchStrength;
    glitchPass.uniforms.time.value = getElapsedTime();
  }

  function updateAnimatedUniforms(elapsedTime) {
    const guiParams = getGuiParams();
    scanlinePass.uniforms.time.value = elapsedTime;
    databendPass.uniforms.time.value = elapsedTime;
    crosshatchPass.uniforms.time.value = elapsedTime;
    if (godRaysEnabled) {
      godRayPass.uniforms.time.value = elapsedTime;
    }
    if (pixelMosaicEnabled) {
      pixelMosaicPass.uniforms.time.value = elapsedTime;
    }
    if (thermalVisionEnabled) {
      thermalVisionPass.uniforms.time.value = elapsedTime;
    }
    if (guiParams.chromaticAberrationEnabled) {
      const phase = elapsedTime - chromaticAberrationStartTime;
      const oscillation = 0.5 - 0.5 * Math.cos(phase * CHROMATIC_OSCILLATION_SPEED);
      chromaticAberrationPass.uniforms.offset.value.set(
        guiParams.chromaticAberrationOffsetX * oscillation,
        guiParams.chromaticAberrationOffsetY * oscillation,
      );
    } else {
      chromaticAberrationPass.uniforms.offset.value.set(0, 0);
    }
  }

  function renderIsolatedModelLayer() {
    const needsCrosshatch = crosshatchPass.enabled;
    const needsGodRays = godRayPass.enabled;
    if (!needsCrosshatch && !needsGodRays) return;

    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousBackground = scene.background;
    const previousClearAlpha = renderer.getClearAlpha();
    const previousLayerMask = camera.layers.mask;
    const previousOverrideMaterial = scene.overrideMaterial;

    renderer.getClearColor(savedClearColor);

    if (needsCrosshatch || needsGodRays) {
      scene.background = null;
      renderer.setRenderTarget(modelMaskTarget);
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      camera.layers.set(MODEL_LAYER);
      scene.overrideMaterial = maskMaterial;
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
    }

    if (needsCrosshatch) {
      scene.background = null;
      renderer.setRenderTarget(modelLayerTarget);
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      camera.layers.set(MODEL_LAYER);
      renderer.render(scene, camera);
    }

    if (needsGodRays) {
      const monolith = getMonolith?.();
      if (monolith) {
        godRayWorldBounds.setFromObject(monolith);
        if (!godRayWorldBounds.isEmpty()) {
          godRayWorldBounds.getCenter(godRayLightWorldPos);
        } else {
          godRayLightWorldPos.copy(monolith.position);
        }
      }

      /* Project the monolith center to screen space for radial blur origin */
      godRayWorldCenter.copy(godRayLightWorldPos);
      const projected = godRayWorldCenter.project(camera);
      godRayScreenPos.set(
        projected.x * 0.5 + 0.5,
        projected.y * 0.5 + 0.5,
      );

      /*
       * Render emissive map: model as bright white against a black void.
       * The radial blur will scatter this brightness outward, creating
       * rays that appear to emanate FROM the model.
       */
      const prevSceneBg = scene.background;
      scene.background = new THREE.Color(0x000000);
      scene.overrideMaterial = godRayEmissiveMaterial;
      renderer.setRenderTarget(godRayEmissiveTarget);
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, true);
      camera.layers.set(MODEL_LAYER);
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      scene.background = prevSceneBg;
    }

    scene.overrideMaterial = previousOverrideMaterial;
    camera.layers.mask = previousLayerMask;
    scene.background = previousBackground;
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(savedClearColor, previousClearAlpha);
    renderer.autoClear = previousAutoClear;
  }

  function setSize(width, height) {
    composer.setSize(width, height);
    modelLayerTarget.setSize(width, height);
    modelMaskTarget.setSize(width, height);
    godRayEmissiveTarget.setSize(Math.floor(width / 2), Math.floor(height / 2));
    crosshatchPass.uniforms.resolution.value.set(width, height);
    pixelMosaicPass.uniforms.resolution.value.set(width, height);
    thermalVisionPass.uniforms.resolution.value.set(width, height);
  }

  function setForcedHueSaturationEnabled(enabled) {
    forceHueSatPassEnabled = enabled;
  }

  function setHueSaturation(hue, saturation) {
    hueSatPass.uniforms.hue.value = hue;
    hueSatPass.uniforms.saturation.value = saturation;
  }

  function hasActivePostProcessing() {
    return bloomPass.enabled || scanlinePass.enabled || hueSatPass.enabled || barrelBlurPass.enabled || chromaticAberrationPass.enabled || glitchPass.enabled || databendPass.enabled || crosshatchPass.enabled || godRayPass.enabled || pixelMosaicPass.enabled || thermalVisionPass.enabled;
  }

  function setGodRaysEnabled(enabled) {
    godRaysEnabled = enabled;
  }

  function getGodRaysEnabled() {
    return godRaysEnabled;
  }

  function setPixelMosaicEnabled(enabled) {
    pixelMosaicEnabled = enabled;
  }

  function getPixelMosaicEnabled() {
    return pixelMosaicEnabled;
  }

  function setThermalVisionEnabled(enabled) {
    thermalVisionEnabled = enabled;
  }

  function getThermalVisionEnabled() {
    return thermalVisionEnabled;
  }

  return {
    barrelBlurPass,
    bloomPass,
    chromaticAberrationPass,
    composer,
    crosshatchPass,
    databendPass,
    glitchPass,
    godRayPass,
    hueSatPass,
    modelLayer: MODEL_LAYER,
    pixelMosaicPass,
    renderIsolatedModelLayer,
    scanlinePass,
    thermalVisionPass,
    hasActivePostProcessing,
    getGodRaysEnabled,
    getPixelMosaicEnabled,
    getThermalVisionEnabled,
    refreshPostProcessingPasses,
    setForcedHueSaturationEnabled,
    setGodRaysEnabled,
    setPixelMosaicEnabled,
    setThermalVisionEnabled,
    setHueSaturation,
    setSize,
    triggerGlitch,
    updateAnimatedUniforms,
    updateGlitch,
    getBloomRingActive: () => bloomRingActive,
  };
}
