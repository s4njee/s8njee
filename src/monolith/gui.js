import * as THREE from 'three';
import GUI from 'lil-gui';

export function createDefaultGuiParams() {
  const lightingModes = ['A (Scene)', 'B (Particles)', 'C (Shanghai Bund)'];

  return {
    showGUI: false,
    bloomEnabled: true,
    bloomStrength: 0.5,
    bloomRadius: 0.15,
    bloomThreshold: 0.77,
    barrelBlurEnabled: false,
    barrelBlurAmount: 0.12,
    barrelBlurOffsetX: 0.0,
    barrelBlurOffsetY: 0.0,
    chromaticAberrationEnabled: false,
    chromaticAberrationOffsetX: 0.004,
    chromaticAberrationOffsetY: 0.004,
    chromaticAberrationRadialModulation: false,
    chromaticAberrationModulationOffset: 0.15,
    hueSatEnabled: false,
    hue: 0.0,
    saturation: 0.0,
    glitchDuration: 0.4,
    glitchStrength: 1.0,
    scanlineEnabled: true,
    scanlineDensity: 5.13,
    scanlineOpacity: 0.75,
    scanlineScrollSpeed: 0.08,
    exposure: 1.4,
    toneMapping: 'ACESFilmic',
    ambientOverrideEnabled: false,
    ambientIntensity: 0.78,
    ambientColor: '#ffffff',
    backgroundColor: '#111111',
    whiteMode: false,
    lightingMode: lightingModes[0],
  };
}

export function createGuiControls({
  guiParams,
  renderer,
  scene,
  postProcessing,
  onWhiteModeChange,
  onLightingModeChange,
  onRefreshPostProcessing,
  triggerGlitch,
}) {
  const lightingModes = ['A (Scene)', 'B (Particles)', 'C (Shanghai Bund)'];

  const gui = new GUI({ title: '⚙ Settings' });
  gui.domElement.style.zIndex = '200';
  gui.hide();

  const bloomFolder = gui.addFolder('Bloom');
  bloomFolder.add(guiParams, 'bloomEnabled').name('Enabled').onChange(onRefreshPostProcessing);
  bloomFolder.add(guiParams, 'bloomStrength', 0, 3, 0.01).name('Strength').onChange((value) => {
    postProcessing.bloomPass.strength = value;
  });
  bloomFolder.add(guiParams, 'bloomRadius', 0, 1, 0.01).name('Radius').onChange((value) => {
    postProcessing.bloomPass.radius = value;
  });
  bloomFolder.add(guiParams, 'bloomThreshold', 0, 1, 0.01).name('Threshold').onChange((value) => {
    postProcessing.bloomPass.threshold = value;
  });

  const barrelBlurFolder = gui.addFolder('Barrel Blur');
  barrelBlurFolder.add(guiParams, 'barrelBlurEnabled').name('Enabled').onChange(onRefreshPostProcessing);
  barrelBlurFolder.add(guiParams, 'barrelBlurAmount', 0, 0.5, 0.001).name('Amount').onChange((value) => {
    postProcessing.barrelBlurPass.uniforms.amount.value = value;
  });
  barrelBlurFolder.add(guiParams, 'barrelBlurOffsetX', -0.5, 0.5, 0.001).name('Offset X').onChange((value) => {
    postProcessing.barrelBlurPass.uniforms.offset.value.x = value;
  });
  barrelBlurFolder.add(guiParams, 'barrelBlurOffsetY', -0.5, 0.5, 0.001).name('Offset Y').onChange((value) => {
    postProcessing.barrelBlurPass.uniforms.offset.value.y = value;
  });

  const chromaticAberrationFolder = gui.addFolder('Chromatic Aberration');
  chromaticAberrationFolder.add(guiParams, 'chromaticAberrationEnabled').name('Enabled').onChange(onRefreshPostProcessing);
  chromaticAberrationFolder.add(guiParams, 'chromaticAberrationOffsetX', 0, 0.5, 0.001).name('Offset X').onChange((value) => {
    postProcessing.chromaticAberrationPass.uniforms.offset.value.x = value;
  });
  chromaticAberrationFolder.add(guiParams, 'chromaticAberrationOffsetY', 0, 0.5, 0.001).name('Offset Y').onChange((value) => {
    postProcessing.chromaticAberrationPass.uniforms.offset.value.y = value;
  });
  chromaticAberrationFolder.add(guiParams, 'chromaticAberrationRadialModulation').name('Radial Modulation').onChange((value) => {
    postProcessing.chromaticAberrationPass.uniforms.radialModulation.value = value ? 1.0 : 0.0;
  });
  chromaticAberrationFolder.add(guiParams, 'chromaticAberrationModulationOffset', 0, 1, 0.001).name('Modulation Offset').onChange((value) => {
    postProcessing.chromaticAberrationPass.uniforms.modulationOffset.value = value;
  });

  const hueSatFolder = gui.addFolder('Hue & Saturation');
  hueSatFolder.add(guiParams, 'hueSatEnabled').name('Enabled').onChange(onRefreshPostProcessing);
  hueSatFolder.add(guiParams, 'hue', -Math.PI, Math.PI, 0.001).name('Hue').onChange((value) => {
    postProcessing.hueSatPass.uniforms.hue.value = value;
  });
  hueSatFolder.add(guiParams, 'saturation', -1, 1, 0.001).name('Saturation').onChange((value) => {
    postProcessing.hueSatPass.uniforms.saturation.value = value;
  });

  const glitchFolder = gui.addFolder('Glitch');
  glitchFolder.add(guiParams, 'glitchDuration', 0.1, 2.0, 0.01).name('Duration (s)');
  glitchFolder.add(guiParams, 'glitchStrength', 0.1, 3.0, 0.01).name('Strength');
  glitchFolder.add({ trigger: () => triggerGlitch() }, 'trigger').name('⚡ Test Glitch');

  const scanlineFolder = gui.addFolder('Scanline');
  scanlineFolder.add(guiParams, 'scanlineEnabled').name('Enabled').onChange(onRefreshPostProcessing);
  scanlineFolder.add(guiParams, 'scanlineDensity', 0.1, 10, 0.01).name('Density').onChange((value) => {
    postProcessing.scanlinePass.uniforms.density.value = value;
  });
  scanlineFolder.add(guiParams, 'scanlineOpacity', 0, 1, 0.01).name('Opacity').onChange((value) => {
    postProcessing.scanlinePass.uniforms.opacity.value = value;
  });
  scanlineFolder.add(guiParams, 'scanlineScrollSpeed', 0, 2, 0.01).name('Scroll Speed').onChange((value) => {
    postProcessing.scanlinePass.uniforms.scrollSpeed.value = value;
  });

  const toneFolder = gui.addFolder('Tone Mapping');
  toneFolder.add(guiParams, 'exposure', 0, 3, 0.01).name('Exposure').onChange((value) => {
    renderer.toneMappingExposure = value;
  });
  toneFolder.add(guiParams, 'toneMapping', ['NoToneMapping', 'Linear', 'Reinhard', 'Cineon', 'ACESFilmic', 'AgX', 'Neutral']).name('Algorithm').onChange((value) => {
    const map = {
      NoToneMapping: THREE.NoToneMapping,
      Linear: THREE.LinearToneMapping,
      Reinhard: THREE.ReinhardToneMapping,
      Cineon: THREE.CineonToneMapping,
      ACESFilmic: THREE.ACESFilmicToneMapping,
      AgX: THREE.AgXToneMapping,
      Neutral: THREE.NeutralToneMapping,
    };
    renderer.toneMapping = map[value] ?? THREE.ACESFilmicToneMapping;
  });

  const ambientFolder = gui.addFolder('Ambient Light');
  ambientFolder.add(guiParams, 'ambientOverrideEnabled').name('Override Enabled');
  ambientFolder.add(guiParams, 'ambientIntensity', 0, 10, 0.01).name('Intensity');
  ambientFolder.addColor(guiParams, 'ambientColor').name('Color');

  const sceneFolder = gui.addFolder('Scene');
  sceneFolder.addColor(guiParams, 'backgroundColor').name('Background').onChange((value) => {
    scene.background = new THREE.Color(value);
    document.body.style.background = value;
  });
  sceneFolder.add(guiParams, 'whiteMode').name('White Mode').onChange((value) => {
    onWhiteModeChange(value);
  });
  sceneFolder.add(guiParams, 'lightingMode', lightingModes).name('Lighting Mode').onChange((value) => {
    onLightingModeChange(Math.max(lightingModes.indexOf(value), 0));
  });

  let guiVisible = false;

  function syncGuiDisplay() {
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  }

  function toggleGUI() {
    guiVisible = !guiVisible;
    if (guiVisible) gui.show();
    else gui.hide();
  }

  return {
    destroy: () => gui.destroy(),
    guiParams,
    syncGuiDisplay,
    toggleGUI,
  };
}
