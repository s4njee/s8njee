import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { resolveAssetUrl } from './asset-url.js';

// ── Overlays ───────────────────────────────────────────────────────────────
// Creates and manages all scene overlay elements for Monolith.
// Two categories of overlay exist:
//
//   3D text (Troika)  — in-world labels rendered by troika-three-text, added
//                        directly to the Three.js scene. These respect the
//                        camera perspective and white-mode color inversion.
//
//   DOM / logo          — a mix of HTML <img> elements (the Star Wars SVG
//                        overlay) and Three.js PlaneGeometry meshes with
//                        transparent textures (franchise logo quads).
//
// updateTextVisibility() is the main entry point called after every model
// switch. It uses hardcoded set/model index comparisons — see the TODO in
// the Monolith roadmap for the planned data-driven replacement.

export function createOverlays(scene) {
  const disposables = [];

  // ── Troika text factory ────────────────────────────────────────────────────

  function createText(opts) {
    const text = new Text();
    text.text = opts.text;
    text.font = opts.font;
    text.fontSize = opts.fontSize;
    text.color = 0xffffff;
    text.anchorX = opts.anchorX || 'left';
    text.anchorY = opts.anchorY || 'bottom';
    text.position.set(...opts.position);
    text.material.transparent = true;
    text.material.opacity = opts.opacity ?? 0.85;
    if (opts.letterSpacing) text.letterSpacing = opts.letterSpacing;
    if (opts.lineHeight) text.lineHeight = opts.lineHeight;
    if (opts.textAlign) text.textAlign = opts.textAlign;
    text.visible = false;
    text.sync();
    scene.add(text);
    disposables.push(() => {
      scene.remove(text);
      text.dispose();
    });
    return text;
  }

  // ── Logo mesh factory ─────────────────────────────────────────────────────
  // Renders a PNG/SVG texture on a transparent PlaneGeometry mesh in the
  // Three.js scene. `aspect` is width/height of the source image.
  function create3DLogo(texturePath, aspect, height, position, extraOpts = {}) {
    const texture = new THREE.TextureLoader().load(resolveAssetUrl(texturePath));
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      ...extraOpts,
    });
    const geometry = new THREE.PlaneGeometry(height * aspect, height);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.visible = false;
    scene.add(mesh);
    disposables.push(() => {
      scene.remove(mesh);
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    });
    return mesh;
  }

  // ── Troika text overlays per set/model ──────────────────────────────────────

  const mahoragaText = createText({
    text: 'EIGHT-HANDLED SWORD\nDIVERGENT SILA\nDIVINE GENERAL\nMAHORAGA',
    font: resolveAssetUrl('/fonts/anton.ttf'),
    fontSize: 0.35,
    lineHeight: 1.3,
    anchorX: 'center',
    textAlign: 'center',
    anchorY: 'middle',
    position: [-3.5, 1.5, 0],
    opacity: 0.8,
  });
  const evaTitle = createText({
    text: 'EVANGELION UNIT-01',
    font: resolveAssetUrl('/fonts/evangelion.ttf'),
    fontSize: 0.4,
    letterSpacing: 0.08,
    position: [-6.5, 1.2, 0],
  });
  const evaSubtitle = createText({
    text: 'MULTIPURPOSE HUMANOID DECISIVE WEAPON, ARTIFICIAL HUMAN',
    font: resolveAssetUrl('/fonts/evangelion.ttf'),
    fontSize: 0.13,
    letterSpacing: 0.04,
    anchorY: 'top',
    position: [-6.5, 1.15, 0],
    opacity: 0.6,
  });
  const evaJpText = createText({
    text: '汎用ヒト型決戦兵器 人造人間エヴァンゲリオン初号機',
    font: resolveAssetUrl('/fonts/evangelion.ttf'),
    fontSize: 0.13,
    letterSpacing: 0.02,
    anchorY: 'top',
    position: [-6.5, 1.0, 0],
    opacity: 0.6,
  });
  const eva02Title = createText({
    text: 'EVANGELION UNIT-02',
    font: resolveAssetUrl('/fonts/evangelion.ttf'),
    fontSize: 0.4,
    letterSpacing: 0.08,
    anchorX: 'right',
    position: [6.5, 1.2, 0],
  });
  const eva02Subtitle = createText({
    text: 'MULTIPURPOSE HUMANOID DECISIVE WEAPON, ARTIFICIAL HUMAN',
    font: resolveAssetUrl('/fonts/evangelion.ttf'),
    fontSize: 0.13,
    letterSpacing: 0.04,
    anchorX: 'right',
    anchorY: 'top',
    position: [6.5, 1.15, 0],
    opacity: 0.6,
  });
  const eva02JpText = createText({
    text: '汎用ヒト型決戦兵器 人造人間エヴァンゲリオン弐号機',
    font: resolveAssetUrl('/fonts/evangelion.ttf'),
    fontSize: 0.13,
    letterSpacing: 0.02,
    anchorX: 'right',
    anchorY: 'top',
    position: [6.5, 1.0, 0],
    opacity: 0.6,
  });

  const allSceneTexts = [evaTitle, evaSubtitle, evaJpText, eva02Title, eva02Subtitle, eva02JpText, mahoragaText];

  // ── DOM and 3D logo overlays per set ──────────────────────────────────────
  // csmLogoMesh is not in setLogos because it can appear in two different sets
  // (set 0 model 5, and set 4 model 1). setLogos entries are 1:1 with set index.

  const swLogo = document.createElement('img');
  swLogo.src = resolveAssetUrl('/set4/starwars_logo_yellow.svg');
  swLogo.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-55%);width:50vw;opacity:0.12;pointer-events:none;z-index:0;display:none';
  document.body.insertBefore(swLogo, document.body.firstChild);
  disposables.push(() => swLogo.remove());

  const fateLogoMesh = create3DLogo('/set1/fate.png', 594 / 290, 2.0, [4.5, 0.5, -3], { alphaTest: 0.01 });
  const csmLogoMesh = create3DLogo('/set1/chainsawman.png', 1600 / 900, 3.0, [-4.5, 0.5, -3], { alphaTest: 0.01 });
  const evaLogoMesh = create3DLogo('/set2/evangelion_logo.png', 960 / 427, 3.0, [-4.5, 7.0, -3], { alphaTest: 0.01 });
  const opLogoMesh = create3DLogo('/set6/onepiece_logo.png', 1600 / 740, 3.0, [-4.5, 7.0, -3]);
  const rimuruLogoMesh = create3DLogo('/set8/rimuru_logo.png', 900 / 615, 3.0, [-3.5, 7.0, -3], { alphaTest: 0.01 });
  const setLogos = { 0: fateLogoMesh, 1: evaLogoMesh, 5: opLogoMesh, 6: rimuruLogoMesh };

  // ── Visibility control ─────────────────────────────────────────────────────────

  function hideAllOverlays() {
    mahoragaText.visible = false;
    allSceneTexts.forEach((text) => { text.visible = false; });
    Object.values(setLogos).forEach((mesh) => { mesh.visible = false; });
    csmLogoMesh.visible = false;
  }

  function updateTextVisibility(currentSetIndex, modelIndex) {
    const show = modelIndex >= 0;
    mahoragaText.visible = show && currentSetIndex === 4 && modelIndex === 0;

    for (const [idx, mesh] of Object.entries(setLogos)) {
      mesh.visible = show && currentSetIndex === Number(idx);
    }

    csmLogoMesh.visible = show && (
      (currentSetIndex === 0 && modelIndex === 5)
      || (currentSetIndex === 4 && modelIndex === 1)
    );
    if (csmLogoMesh.visible) fateLogoMesh.visible = false;

    const isEva01 = currentSetIndex === 2 && (modelIndex === 0 || modelIndex === 3);
    const isEva02 = currentSetIndex === 2 && (modelIndex === 1 || modelIndex === 4);

    evaTitle.visible = isEva01;
    evaSubtitle.visible = isEva01;
    evaJpText.visible = isEva01;
    eva02Title.visible = isEva02;
    eva02Subtitle.visible = isEva02;
    eva02JpText.visible = isEva02;
  }

  function applyWhiteMode(whiteMode) {
    const textColorHex = whiteMode ? 0x000000 : 0xffffff;
    allSceneTexts.forEach((text) => {
      text.color = textColorHex;
      text.sync();
    });
  }

  function setStarWarsLogoVisible(visible) {
    swLogo.style.display = visible ? 'block' : 'none';
  }

  return {
    applyWhiteMode,
    destroy: () => {
      disposables.forEach((dispose) => dispose());
    },
    hideAllOverlays,
    setStarWarsLogoVisible,
    updateTextVisibility,
  };
}
