import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export function createPostProcessing({ renderer, scene, camera, getGuiParams, getElapsedTime }) {
  const MODEL_LAYER = 1;
  const CHROMATIC_OSCILLATION_SPEED = 3.2;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const modelLayerTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
  const modelMaskTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
  const maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const savedClearColor = new THREE.Color();

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.5,
    0.15,
    0.77,
  );
  bloomPass.enabled = false;
  composer.addPass(bloomPass);

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
        float angle = hue;
        float s = sin(angle);
        float c = cos(angle);
        vec3 weights = vec3(0.2126, 0.7152, 0.0722);
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
        float luma = dot(color.rgb, weights);
        color.rgb = mix(vec3(luma), color.rgb, 1.0 + saturation);
        gl_FragColor = color;
      }
    `,
  };

  const BarrelBlurShader = {
    uniforms: {
      tDiffuse: { value: null },
      amount: { value: 0.12 },
      offset: { value: new THREE.Vector2(0.0, 0.0) },
      samples: { value: 10.0 },
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
      uniform float amount;
      uniform vec2 offset;
      uniform float samples;
      varying vec2 vUv;

      vec2 barrelDistort(vec2 uv, float distortion) {
        vec2 centered = uv - 0.5 - offset;
        float radius = dot(centered, centered);
        return uv + centered * radius * distortion;
      }

      void main() {
        vec4 color = vec4(0.0);
        float totalWeight = 0.0;

        for (float i = 0.0; i < 10.0; i += 1.0) {
          float t = samples <= 1.0 ? 0.0 : i / (samples - 1.0);
          float distortion = mix(0.0, amount, t);
          vec2 uv = clamp(barrelDistort(vUv, distortion), 0.0, 1.0);
          float weight = 1.0 - t * 0.6;
          color += texture2D(tDiffuse, uv) * weight;
          totalWeight += weight;
        }

        gl_FragColor = color / totalWeight;
      }
    `,
  };

  const ChromaticAberrationShader = {
    uniforms: {
      tDiffuse: { value: null },
      offset: { value: new THREE.Vector2(0.004, 0.004) },
      radialModulation: { value: 0.0 },
      modulationOffset: { value: 0.15 },
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
      uniform vec2 offset;
      uniform float radialModulation;
      uniform float modulationOffset;
      varying vec2 vUv;

      void main() {
        vec2 centered = vUv - 0.5;
        float radius = length(centered);
        float radialFactor = radialModulation > 0.5
          ? max(radius - modulationOffset, 0.0)
          : 1.0;
        vec2 aberrationOffset = offset * radialFactor;

        float r = texture2D(tDiffuse, clamp(vUv + aberrationOffset, 0.0, 1.0)).r;
        float g = texture2D(tDiffuse, vUv).g;
        float b = texture2D(tDiffuse, clamp(vUv - aberrationOffset, 0.0, 1.0)).b;
        float a = texture2D(tDiffuse, vUv).a;

        gl_FragColor = vec4(r, g, b, a);
      }
    `,
  };

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
        float blockY = floor(uv.y * (10.0 + seed * 20.0)) / 10.0;
        float blockX = floor(uv.x / columns) * columns;
        float noise = rand(vec2(blockY, seed + time));
        float glitchLine = step(1.0 - amount * 0.3, noise);
        uv.x += glitchLine * (rand(vec2(blockY, time)) - 0.5) * amount * 0.15;

        float shift = amount * 0.015 * (rand(vec2(time, seed)) - 0.5);
        vec4 cr = texture2D(tDiffuse, vec2(uv.x + shift, uv.y));
        vec4 cg = texture2D(tDiffuse, uv);
        vec4 cb = texture2D(tDiffuse, vec2(uv.x - shift, uv.y));
        vec4 color = vec4(cr.r, cg.g, cb.b, cg.a);

        float flicker = rand(vec2(time * 100.0, uv.y * 50.0));
        color.rgb *= 1.0 - amount * 0.08 * step(0.97, flicker);
        gl_FragColor = color;
      }
    `,
  };

  const DatabendShader = {
    uniforms: {
      tDiffuse: { value: null },
      time: { value: 0.0 },
      intensity: { value: 0.7 },
      threshold: { value: 0.5 },
      sliceCount: { value: 44.0 },
      colorDrift: { value: 0.006 },
      staticAmount: { value: 0.09 },
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
      uniform float intensity;
      uniform float threshold;
      uniform float sliceCount;
      uniform float colorDrift;
      uniform float staticAmount;
      varying vec2 vUv;

      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float luma(vec3 color) {
        return dot(color, vec3(0.2126, 0.7152, 0.0722));
      }

      void main() {
        vec2 uv = vUv;
        float bandY = uv.y * sliceCount;
        float slice = floor(bandY);
        float bandBlend = smoothstep(0.15, 0.85, fract(bandY));
        float timeCoarse = floor(time * 5.0);
        float timeFine = floor(time * 8.0);
        float coarseShift = rand(vec2(floor(uv.y * 18.0), timeCoarse)) - 0.5;
        float fineShift = rand(vec2(slice, timeFine)) - 0.5;
        float sliceShift = mix(coarseShift, fineShift, 0.35 + 0.25 * bandBlend) * 0.14 * intensity;
        uv.x = fract(uv.x + sliceShift);

        float bendNoise = rand(vec2(floor(uv.x * 24.0), slice + floor(time * 4.0))) - 0.5;
        uv.y += bendNoise * 0.022 * intensity;
        uv = clamp(uv, 0.001, 0.999);

        vec4 base = texture2D(tDiffuse, uv);
        float brightness = luma(base.rgb);
        float sortMask = smoothstep(threshold, 1.0, brightness);
        float smearNoise = rand(vec2(slice * 1.73, floor(time * 6.0)));
        float smear = sortMask * intensity * (0.012 + 0.022 * smearNoise);

        vec2 sortUv = clamp(vec2(fract(uv.x + smear), uv.y), 0.001, 0.999);
        vec4 sorted = texture2D(tDiffuse, sortUv);

        float blockNoise = rand(vec2(floor(uv.x * 14.0) + slice, floor(time * 7.0)));
        vec2 blockUv = uv;
        if (blockNoise > 0.915) {
          blockUv.x = fract(blockUv.x + (blockNoise - 0.5) * 0.14 * intensity);
          blockUv.y = clamp(blockUv.y + (rand(vec2(slice * 0.37, floor(time * 9.0))) - 0.5) * 0.032 * intensity, 0.001, 0.999);
        }
        vec4 blocky = texture2D(tDiffuse, blockUv);

        float channelJitter = (rand(vec2(slice + 4.0, floor(time * 6.0))) - 0.5) * colorDrift * intensity * 5.5;
        float red = texture2D(tDiffuse, clamp(uv + vec2(channelJitter, 0.0), 0.001, 0.999)).r;
        float green = sorted.g;
        float blue = texture2D(tDiffuse, clamp(uv - vec2(channelJitter * 1.5, 0.0), 0.001, 0.999)).b;

        vec3 databent = vec3(red, green, blue);
        databent = mix(databent, sorted.rgb, sortMask * 0.34);
        databent = mix(databent, blocky.rgb, 0.2 * intensity);

        float posterize = 9.0 + floor(intensity * 4.0);
        databent = floor(databent * posterize) / posterize;

        float scanFlicker = 1.0 - 0.035 * intensity * step(0.965, rand(vec2(slice, floor(time * 14.0))));
        databent *= scanFlicker;

        float staticNoise = rand(vec2(floor(vUv.x * 420.0) + floor(time * 48.0), floor(vUv.y * 320.0)));
        float staticFlicker = rand(vec2(floor(vUv.y * 180.0), floor(time * 36.0))) - 0.5;
        vec3 staticLayer = vec3(0.84 + staticNoise * 0.32 + staticFlicker * 0.18);
        vec3 tvMix = mix(base.rgb, databent, 0.74);
        tvMix = mix(tvMix, tvMix * staticLayer, staticAmount);

        gl_FragColor = vec4(tvMix, base.a);
      }
    `,
  };

  const CrosshatchShader = {
    uniforms: {
      tDiffuse: { value: null },
      tModel: { value: modelLayerTarget.texture },
      tModelMask: { value: modelMaskTarget.texture },
      time: { value: 0.0 },
      resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      hatchScale: { value: 1.15 },
      hatchStrength: { value: 0.72 },
      ditherStrength: { value: 0.22 },
      inkColor: { value: new THREE.Color(0x111111) },
      paperColor: { value: new THREE.Color(0xf3ead9) },
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
      uniform sampler2D tModel;
      uniform sampler2D tModelMask;
      uniform vec2 resolution;
      uniform float time;
      uniform float hatchScale;
      uniform float hatchStrength;
      uniform float ditherStrength;
      uniform vec3 inkColor;
      uniform vec3 paperColor;
      varying vec2 vUv;

      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float luma(vec3 color) {
        return dot(color, vec3(0.2126, 0.7152, 0.0722));
      }

      float linePattern(vec2 p, float angle, float spacing, float thickness) {
        vec2 dir = vec2(cos(angle), sin(angle));
        float coord = dot(p, dir);
        float cell = abs(fract(coord / spacing) - 0.5);
        return 1.0 - smoothstep(thickness, thickness + 0.08, cell);
      }

      void main() {
        vec4 src = texture2D(tDiffuse, vUv);
        vec4 model = texture2D(tModel, vUv);
        float modelMask = texture2D(tModelMask, vUv).r;
        if (modelMask <= 0.001) {
          gl_FragColor = src;
          return;
        }

        vec2 pixel = vUv * resolution / 7.0;
        vec2 wobble = vec2(
          sin((vUv.y * 10.0) + time * 0.45),
          cos((vUv.x * 8.0) - time * 0.35)
        ) * 0.18;
        vec2 hatchUv = pixel * hatchScale + wobble;

        float brightness = luma(model.rgb);
        float dark = 1.0 - brightness;

        float hatchA = linePattern(hatchUv, 0.785398, 1.4, 0.18);
        float hatchB = linePattern(hatchUv + 0.7, -0.785398, 1.6, 0.18);
        float hatchC = linePattern(hatchUv * 1.08 + 1.3, 0.0, 1.9, 0.16);
        float hatchD = linePattern(hatchUv * 0.95 - 0.9, 1.570796, 2.1, 0.16);

        float layer1 = hatchA * smoothstep(0.2, 0.95, dark);
        float layer2 = hatchB * smoothstep(0.38, 1.0, dark);
        float layer3 = hatchC * smoothstep(0.58, 1.0, dark);
        float layer4 = hatchD * smoothstep(0.76, 1.0, dark);

        float hatchMask = clamp(layer1 + layer2 * 0.85 + layer3 * 0.65 + layer4 * 0.45, 0.0, 1.0);

        vec2 bayerUv = floor(vUv * resolution * 0.5);
        float dither = rand(mod(bayerUv, 4.0));
        float ditherMask = smoothstep(0.28, 0.88, dark + (dither - 0.5) * ditherStrength);

        vec3 toned = mix(model.rgb, paperColor * (0.9 + 0.1 * brightness), 0.55);
        vec3 hatched = mix(toned, inkColor, hatchMask * hatchStrength);
        vec3 dithered = mix(hatched, inkColor * 0.85, ditherMask * 0.18 * hatchStrength);

        float edge = smoothstep(0.12, 0.8, dark);
        dithered = mix(dithered, model.rgb, 0.16 - edge * 0.06);

        gl_FragColor = vec4(mix(src.rgb, dithered, modelMask), src.a);
      }
    `,
  };

  const scanlinePass = new ShaderPass(ScanlineShader);
  scanlinePass.enabled = false;
  composer.addPass(scanlinePass);

  const hueSatPass = new ShaderPass(HueSaturationShader);
  hueSatPass.enabled = false;
  composer.addPass(hueSatPass);

  const barrelBlurPass = new ShaderPass(BarrelBlurShader);
  barrelBlurPass.enabled = false;
  composer.addPass(barrelBlurPass);

  const chromaticAberrationPass = new ShaderPass(ChromaticAberrationShader);
  chromaticAberrationPass.enabled = false;
  composer.addPass(chromaticAberrationPass);

  const glitchPass = new ShaderPass(GlitchShader);
  glitchPass.enabled = false;
  composer.addPass(glitchPass);

  const databendPass = new ShaderPass(DatabendShader);
  databendPass.enabled = false;
  composer.addPass(databendPass);

  const crosshatchPass = new ShaderPass(CrosshatchShader);
  crosshatchPass.enabled = false;
  composer.addPass(crosshatchPass);

  composer.addPass(new OutputPass());

  let glitchElapsed = 0;
  let glitchActive = false;
  let postProcessingActive = false;
  let bloomRingActive = false;
  let chromaticAberrationStartTime = 0;
  let chromaticAberrationWasEnabled = false;

  function refreshPostProcessingPasses(currentFx) {
    const guiParams = getGuiParams();
    const cinematicFxActive = currentFx === 1;
    const databendFxActive = currentFx === 2;
    const crosshatchFxActive = currentFx === 3;
    postProcessingActive = cinematicFxActive || databendFxActive || crosshatchFxActive;

    bloomPass.enabled = cinematicFxActive && guiParams.bloomEnabled;
    hueSatPass.enabled = cinematicFxActive && guiParams.hueSatEnabled;
    barrelBlurPass.enabled = cinematicFxActive && guiParams.barrelBlurEnabled;
    chromaticAberrationPass.enabled = guiParams.chromaticAberrationEnabled;
    scanlinePass.enabled = cinematicFxActive && guiParams.scanlineEnabled;
    databendPass.enabled = databendFxActive;
    crosshatchPass.enabled = crosshatchFxActive;
    bloomRingActive = bloomPass.enabled;

    if (!databendFxActive) {
      databendPass.uniforms.intensity.value = 0.7;
    }

    if (guiParams.chromaticAberrationEnabled && !chromaticAberrationWasEnabled) {
      chromaticAberrationStartTime = getElapsedTime();
    }
    chromaticAberrationWasEnabled = guiParams.chromaticAberrationEnabled;
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
    if (!crosshatchPass.enabled) return;

    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousBackground = scene.background;
    const previousClearAlpha = renderer.getClearAlpha();
    const previousLayerMask = camera.layers.mask;
    const previousOverrideMaterial = scene.overrideMaterial;

    renderer.getClearColor(savedClearColor);
    scene.background = null;
    renderer.setRenderTarget(modelLayerTarget);
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    camera.layers.set(MODEL_LAYER);
    renderer.render(scene, camera);

    scene.overrideMaterial = maskMaterial;
    renderer.setRenderTarget(modelMaskTarget);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);

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
    crosshatchPass.uniforms.resolution.value.set(width, height);
  }

  function hasActivePostProcessing() {
    return bloomPass.enabled || scanlinePass.enabled || hueSatPass.enabled || barrelBlurPass.enabled || chromaticAberrationPass.enabled || glitchPass.enabled || databendPass.enabled || crosshatchPass.enabled;
  }

  return {
    barrelBlurPass,
    bloomPass,
    chromaticAberrationPass,
    composer,
    crosshatchPass,
    databendPass,
    glitchPass,
    hueSatPass,
    modelLayer: MODEL_LAYER,
    renderIsolatedModelLayer,
    scanlinePass,
    hasActivePostProcessing,
    refreshPostProcessingPasses,
    setSize,
    triggerGlitch,
    updateAnimatedUniforms,
    updateGlitch,
    getBloomRingActive: () => bloomRingActive,
  };
}
