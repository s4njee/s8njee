import { resolveAssetUrl } from './asset-url.js';

// ── DOM UI ────────────────────────────────────────────────────────────────────
// Builds and manages all persistent DOM chrome for the Monolith scene.
// Everything here is imperative DOM construction (createElement + cssText)
// rather than React, because MonolithScene renders inside a Three.js Canvas
// and these elements live in the page body outside the canvas hierarchy.
//
// Elements created:
//   label       — bottom-centre model name, shown briefly after each load
//   musicBtn    — top-right music toggle (♪ symbol)
//   setNav      — bottom-centre row of set-switcher buttons (one per SET_DEFS entry)
//   modeNav     — top-left row of lighting-mode buttons (A / B)
//
// All elements are appended to document.body and removed in destroy().
// The label timeout ID is tracked locally (labelTimeout) and cleared in
// destroy() to match the cleanup contract.
//
// See root ToDo.md §2 for the planned localStorage set/model persistence.

export function createUI({
  setDefs,
  getWhiteMode,
  getCurrentSetIndex,
  getLightingMode,
  onSwitchSet,
  onSwitchLightingMode,
}) {
  // ── Model name label ──────────────────────────────────────────────────────

  const label = document.createElement('div');
  label.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%);color:#fff;font:14px/1 monospace;opacity:0;transition:opacity 0.3s;pointer-events:none;text-shadow:0 1px 4px #000';
  document.body.appendChild(label);

  // ── Music button ───────────────────────────────────────────────────────────

  const musicBtn = document.createElement('div');
  musicBtn.textContent = '♪';
  musicBtn.style.cssText = 'position:fixed;top:16px;right:48px;color:rgba(255,255,255,0.5);font-size:60px;cursor:pointer;z-index:100;user-select:none;transition:color 0.2s,text-shadow 0.2s';
  document.body.appendChild(musicBtn);

  const bgm = new Audio(resolveAssetUrl('/set3/bgm.mp3'));
  bgm.loop = true;

  let labelTimeout;
  let musicPlaying = false;

  musicBtn.addEventListener('mouseenter', () => {
    if (!musicPlaying) musicBtn.style.color = 'rgba(255,255,255,0.8)';
  });
  musicBtn.addEventListener('mouseleave', () => {
    if (!musicPlaying) musicBtn.style.color = 'rgba(255,255,255,0.5)';
  });
  musicBtn.addEventListener('click', () => {
    musicPlaying = !musicPlaying;
    if (musicPlaying) {
      bgm.play();
      musicBtn.style.color = '#fff';
      musicBtn.style.textShadow = '0 0 8px rgba(255,255,255,0.6)';
    } else {
      bgm.pause();
      musicBtn.style.color = 'rgba(255,255,255,0.5)';
      musicBtn.style.textShadow = 'none';
    }
  });

  // ── Shared button style helper ────────────────────────────────────────────────────

  const BTN_CSS = 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.3);color:#fff;font:14px/1 monospace;cursor:pointer;background:rgba(255,255,255,0.05);transition:all 0.2s;user-select:none';

  function styleButton(button, active) {
    const whiteMode = getWhiteMode();
    const colorTriplet = whiteMode ? '0,0,0' : '255,255,255';
    button.style.color = whiteMode ? '#000' : '#fff';
    button.style.background = `rgba(${colorTriplet},${active ? (whiteMode ? 0.15 : 0.25) : 0.05})`;
    button.style.borderColor = `rgba(${colorTriplet},${active ? 0.7 : 0.3})`;
  }

  // ── Set nav buttons ────────────────────────────────────────────────────────────
  // Hidden sets (def.hidden === true) get display:none so they don’t appear
  // in the nav bar but still exist in the buttons array for state tracking.

  const setNav = document.createElement('div');
  setNav.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:10';
  document.body.appendChild(setNav);

  const setButtons = [];
  setDefs.forEach((def, index) => {
    const button = document.createElement('div');
    button.textContent = def.buttonLabel;
    button.style.cssText = BTN_CSS;
    if (def.hidden) button.style.display = 'none';
    button.addEventListener('click', () => onSwitchSet(index));
    button.addEventListener('mouseenter', () => {
      if (index !== getCurrentSetIndex()) styleButton(button, false);
    });
    button.addEventListener('mouseleave', () => {
      if (index !== getCurrentSetIndex()) styleButton(button, false);
    });
    setNav.appendChild(button);
    setButtons.push(button);
  });

  // ── Lighting mode buttons (A / B) ──────────────────────────────────────────────────

  const modeNav = document.createElement('div');
  modeNav.style.cssText = 'position:fixed;top:16px;left:16px;display:flex;gap:8px;z-index:10';
  document.body.appendChild(modeNav);

  const modeButtons = [];
  ['A', 'B'].forEach((labelText, index) => {
    const button = document.createElement('div');
    button.textContent = labelText;
    button.style.cssText = BTN_CSS;
    button.addEventListener('click', () => onSwitchLightingMode(index));
    button.addEventListener('mouseenter', () => {
      if (index !== getLightingMode()) styleButton(button, false);
    });
    button.addEventListener('mouseleave', () => {
      if (index !== getLightingMode()) styleButton(button, false);
    });
    modeNav.appendChild(button);
    modeButtons.push(button);
  });

  // ── Update helpers and public API ───────────────────────────────────────────────────

  function updateLabel(name) {
    label.textContent = name;
    label.style.opacity = '1';
    clearTimeout(labelTimeout);
    labelTimeout = setTimeout(() => {
      label.style.opacity = '0';
    }, 1500);
  }

  function updateSetButtons() {
    setButtons.forEach((button, index) => styleButton(button, index === getCurrentSetIndex()));
  }

  function updateModeButtons() {
    modeButtons.forEach((button, index) => styleButton(button, index === getLightingMode()));
  }

  function applyWhiteMode() {
    const textColor = getWhiteMode() ? '#000' : '#fff';
    label.style.color = textColor;
    musicBtn.style.color = textColor;
    updateSetButtons();
    updateModeButtons();
  }

  updateSetButtons();
  updateModeButtons();

  return {
    applyWhiteMode,
    destroy: () => {
      bgm.pause();
      label.remove();
      musicBtn.remove();
      setNav.remove();
      modeNav.remove();
      clearTimeout(labelTimeout);
    },
    updateLabel,
    updateModeButtons,
    updateSetButtons,
  };
}
