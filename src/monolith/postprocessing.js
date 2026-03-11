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

  composer.addPass(new OutputPass());

  let glitchElapsed = 0;
  let glitchActive = false;
  let postProcessingActive = false;
  let bloomRingActive = false;
  let chromaticAberrationStartTime = 0;
  let chromaticAberrationWasEnabled = false;

  function refreshPostProcessingPasses(currentFx) {
    const guiParams = getGuiParams();
    postProcessingActive = currentFx === 1;
    bloomPass.enabled = postProcessingActive && guiParams.bloomEnabled;
    hueSatPass.enabled = postProcessingActive && guiParams.hueSatEnabled;
    barrelBlurPass.enabled = postProcessingActive && guiParams.barrelBlurEnabled;
    chromaticAberrationPass.enabled = guiParams.chromaticAberrationEnabled;
    scanlinePass.enabled = postProcessingActive && guiParams.scanlineEnabled;
    bloomRingActive = bloomPass.enabled;

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

  function setSize(width, height) {
    composer.setSize(width, height);
  }

  function hasActivePostProcessing() {
    return bloomPass.enabled || scanlinePass.enabled || hueSatPass.enabled || barrelBlurPass.enabled || chromaticAberrationPass.enabled || glitchPass.enabled;
  }

  return {
    barrelBlurPass,
    bloomPass,
    chromaticAberrationPass,
    composer,
    glitchPass,
    hueSatPass,
    modelLayer: MODEL_LAYER,
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
