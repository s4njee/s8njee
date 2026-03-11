import * as THREE from 'three';

export function createLightingRig({ scene, currentSetDef, getCurrentModelIndex, getMonolith, guiParams }) {
  const ambient = new THREE.AmbientLight(0xffffff, 0);
  scene.add(ambient);

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
  const particleMat = new THREE.PointsMaterial({
    size: 0.18,
    sizeAttenuation: true,
    map: particleTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexColors: true,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.visible = false;
  scene.add(particles);

  const glowLights = [];
  const glowCount = 6;
  const GLOW_RADIUS = 25;
  for (let i = 0; i < glowCount; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 8);
    light.position.set(0, -10, 0);
    scene.add(light);
    glowLights.push(light);
  }

  const ringGeometry = new THREE.TorusGeometry(3, 0.05, 8, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.visible = false;
  scene.add(ringMesh);

  const ringLight = new THREE.PointLight(0xffffff, 3, 10);
  const ringLight2 = new THREE.PointLight(0xffffff, 3, 10);
  scene.add(ringLight);
  scene.add(ringLight2);

  const streetLight1 = new THREE.PointLight(0xffeedd, 0, 15);
  streetLight1.position.set(-1.5, 6, 0);
  scene.add(streetLight1);

  const streetLight2 = new THREE.PointLight(0xffeedd, 0, 15);
  streetLight2.position.set(1.5, 6, 0);
  scene.add(streetLight2);

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

  const warmLight = new THREE.DirectionalLight(0xff8844, 0);
  warmLight.position.set(-3, 3, 2);
  scene.add(warmLight);

  const coolLight = new THREE.DirectionalLight(0x4488ff, 0);
  coolLight.position.set(3, 3, 2);
  scene.add(coolLight);

  const heroSpotLight = new THREE.SpotLight(0xfff2d6, 0, 45, Math.PI / 5, 0.45, 1.4);
  heroSpotLight.position.set(4, 10, 8);
  heroSpotLight.target.position.set(0, 2.5, 0);
  scene.add(heroSpotLight);
  scene.add(heroSpotLight.target);

  const RING_TOP = 8;
  const RING_BOTTOM = -3;
  const RING_RANGE = RING_TOP - RING_BOTTOM;
  const RING_SPEED = 0.0004;

  let lightFrame = 0;
  const tempColor = new THREE.Color();

  function resetAllLights() {
    ringLight.intensity = 0;
    ringLight2.intensity = 0;
    dirRingLight.intensity = 0;
    dirRingLight2.intensity = 0;
    warmLight.intensity = 0;
    coolLight.intensity = 0;
    streetLight1.intensity = 0;
    streetLight2.intensity = 0;
    heroSpotLight.intensity = 0;
  }

  function clearParticleGlow() {
    glowLights.forEach((light) => {
      light.intensity = 0;
    });
  }

  function getLightingStyle() {
    const def = currentSetDef();
    const modelIndex = getCurrentModelIndex();
    if (def.lightingOverrides?.[modelIndex]) return def.lightingOverrides[modelIndex];
    return def.lightingStyle;
  }

  function applyAmbientOverrides() {
    if (!guiParams.ambientOverrideEnabled) return;
    ambient.color.set(guiParams.ambientColor);
    ambient.intensity = guiParams.ambientIntensity;
  }

  function updateParticleLighting() {
    resetAllLights();
    ambient.color.set(0xffffff);
    ambient.intensity = 0.08;

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

    const t = Date.now() * 0.005;
    const hueType = currentSetDef().particleHue;
    let baseHue;

    if (lightFrame % 4 === 0) {
      const colors = particles.geometry.attributes.color.array;
      for (let i = 0; i < particleCount; i++) {
        const flicker = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 3 + i * 7.13));
        if (hueType === 'warm') {
          baseHue = 0.04 + Math.sin(t) * 0.02 + Math.sin(t * 2.3) * 0.01 + Math.sin(t * 5.7) * 0.01;
          tempColor.setHSL(baseHue + Math.sin(i * 3.77 + t) * 0.03, 1.0, 0.35 + flicker * 0.4);
        } else if (hueType === 'rainbow') {
          baseHue = (t * 0.1) % 1.0;
          tempColor.setHSL((baseHue + i / particleCount + Math.sin(i * 0.5 + t) * 0.1) % 1.0, 1.0, 0.35 + flicker * 0.4);
        } else {
          baseHue = 0;
          tempColor.setHSL(0, 0, 0.6 + flicker * 0.35);
        }
        colors[i * 3] = tempColor.r;
        colors[i * 3 + 1] = tempColor.g;
        colors[i * 3 + 2] = tempColor.b;
      }
      particles.geometry.attributes.color.needsUpdate = true;
    }
    if (baseHue === undefined) {
      baseHue = hueType === 'warm' ? 0.04 : hueType === 'rainbow' ? (t * 0.1) % 1.0 : 0;
    }

    if (lightFrame % 4 === 0) {
      const monolith = getMonolith();
      const mx = monolith.position.x;
      const my = monolith.position.y;
      const mz = monolith.position.z;
      const nearest = [];
      const pos2 = particles.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        const dx = pos2[i * 3] - mx;
        const dy = pos2[i * 3 + 1] - my;
        const dz = pos2[i * 3 + 2] - mz;
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
          const particle = nearest[i];
          light.position.set(particle.x, particle.y, particle.z);
          light.intensity = (1 - Math.sqrt(particle.distSq) / GLOW_RADIUS) * 6;
          light.color.setHSL(baseHue, hueType ? (hueType === 'warm' || hueType === 'rainbow' ? 1.0 : 0) : 0, 0.5);
        } else {
          light.intensity = 0;
        }
      }
    }
    lightFrame++;
  }

  function updateSceneLighting() {
    const style = getLightingStyle();
    ambient.color.set(0xffffff);
    resetAllLights();
    const monolith = getMonolith();
    heroSpotLight.target.position.copy(monolith.position);
    heroSpotLight.target.updateMatrixWorld();
    heroSpotLight.position.set(
      monolith.position.x + 4,
      monolith.position.y + 10,
      monolith.position.z + 8,
    );

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
        const splitAngle = Date.now() * 0.0003;
        warmLight.color.set(0xff8844);
        coolLight.color.set(0x4488ff);
        warmLight.position.set(Math.cos(splitAngle) * 4, 3, Math.sin(splitAngle) * 4);
        coolLight.position.set(Math.cos(splitAngle + Math.PI) * 4, 3, Math.sin(splitAngle + Math.PI) * 4);
        ambient.intensity = 0.3;
        warmLight.intensity = 1.5;
        coolLight.intensity = 1.5;
        break;
      }

      case 'dualRingBright': {
        ambient.intensity = 0.4;
        const now = Date.now() * RING_SPEED;
        const p1 = now % 1.0;
        const p2 = (now + 0.5) % 1.0;
        dirRingLight.position.set(0, RING_TOP - p1 * RING_RANGE, 2);
        dirRingLight.intensity = 6 * Math.min(Math.min(p1, 1 - p1) * 5, 1);
        dirRingLight2.position.set(0, RING_TOP - p2 * RING_RANGE, -2);
        dirRingLight2.intensity = 6 * Math.min(Math.min(p2, 1 - p2) * 5, 1);
        break;
      }

      case 'dualRing': {
        ambient.intensity = 0.2;
        const now = Date.now() * RING_SPEED;
        const p1 = now % 1.0;
        const p2 = (now + 0.5) % 1.0;
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
        const speed = 0.00012;
        const far = 20;
        const near = -15;
        const range = far - near;
        const progress = Date.now() * speed;
        const p1 = progress % 1.0;
        const p2 = (progress + 0.5) % 1.0;
        const z1 = far - p1 * range;
        const z2 = far - p2 * range;
        const falloff1 = Math.exp(-z1 * z1 / 25);
        const falloff2 = Math.exp(-z2 * z2 / 25);
        streetLight1.position.set(-1.5, 6, z1);
        streetLight2.position.set(1.5, 6, z2);
        streetLight1.intensity = 20 * falloff1;
        streetLight2.intensity = 20 * falloff2;
        break;
      }

      case 'streetlight': {
        ambient.intensity = 0.5;
        const speed = 0.0008;
        const far = 15;
        const near = -10;
        const range = far - near;
        const progress = Date.now() * speed;
        const p1 = progress % 1.0;
        const p2 = (progress + 0.5) % 1.0;
        const z1 = far - p1 * range;
        const z2 = far - p2 * range;
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
        const p1 = now % 1.0;
        const p2 = (now + 0.5) % 1.0;
        ringLight.position.set(0, RING_TOP - p1 * RING_RANGE, 0);
        ringLight.intensity = 5 * Math.min(Math.min(p1, 1 - p1) * 5, 1);
        ringLight2.position.set(0, RING_TOP - p2 * RING_RANGE, 0);
        ringLight2.intensity = 5 * Math.min(Math.min(p2, 1 - p2) * 5, 1);
      }
    }

    heroSpotLight.intensity = style === 'ambientOnly' ? 8 : 5.5;

    applyAmbientOverrides();
  }

  function animateBloomRing() {
    const ringSpeed = 0.0004;
    const now = Date.now() * ringSpeed;

    const p1 = now % 1.0;
    const p2 = (now + 0.5) % 1.0;
    dirRingLight.position.set(0, RING_TOP - p1 * RING_RANGE, 2);
    dirRingLight.intensity = 1.5 * Math.min(Math.min(p1, 1 - p1) * 5, 1);
    dirRingLight2.position.set(0, RING_TOP - p2 * RING_RANGE, -2);
    dirRingLight2.intensity = 1.5 * Math.min(Math.min(p2, 1 - p2) * 5, 1);

    const lowTop = 3;
    const lowBottom = -2;
    const lowRange = lowTop - lowBottom;
    const p3 = (now * 0.8) % 1.0;
    const p4 = (now * 0.8 + 0.5) % 1.0;
    streetLight1.position.set(-1.5, lowTop - p3 * lowRange, 2);
    streetLight1.intensity = 1.5 * Math.min(Math.min(p3, 1 - p3) * 5, 1);
    streetLight2.position.set(1.5, lowTop - p4 * lowRange, -2);
    streetLight2.intensity = 1.5 * Math.min(Math.min(p4, 1 - p4) * 5, 1);
  }

  return {
    animateBloomRing,
    clearParticleGlow,
    particles,
    updateParticleLighting,
    updateSceneLighting,
  };
}
