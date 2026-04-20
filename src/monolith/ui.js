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

  // ── Web Audio analyser for beat-reactive lighting ─────────────────────────
  // Uses the Web Audio API to decode and play the track directly, bypassing
  // createMediaElementSource CORS restrictions. The AnalyserNode taps the
  // audio graph between the source and destination so frequency data is
  // always available regardless of asset origin.
  let audioCtx = null;
  let analyser = null;
  let analyserData = null;
  let audioBuffer = null;
  let sourceNode = null;
  let audioStartTime = 0;
  let audioPauseOffset = 0;
  let bassEnergyEMA = 0;
  let beatEnvelope = 0;
  let previousBassBins = null;

  function resetBeatAnalysis() {
    bassEnergyEMA = 0;
    beatEnvelope = 0;
    previousBassBins = null;
  }

  async function ensureAudioContext() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    analyser.connect(audioCtx.destination);
    analyserData = new Uint8Array(analyser.frequencyBinCount);

    // Fetch and decode the audio file once
    const response = await fetch(resolveAssetUrl('/set3/bgm.mp3'));
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  }

  function startAudioPlayback() {
    if (!audioCtx || !audioBuffer) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    resetBeatAnalysis();
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.loop = true;
    sourceNode.connect(analyser);
    sourceNode.start(0, audioPauseOffset % audioBuffer.duration);
    audioStartTime = audioCtx.currentTime - audioPauseOffset;
  }

  function stopAudioPlayback() {
    if (!sourceNode) return;
    audioPauseOffset = audioCtx.currentTime - audioStartTime;
    sourceNode.stop();
    sourceNode.disconnect();
    sourceNode = null;
    resetBeatAnalysis();
  }

  let labelTimeout;
  let musicPlaying = false;

  musicBtn.addEventListener('mouseenter', () => {
    if (!musicPlaying) musicBtn.style.color = 'rgba(255,255,255,0.8)';
  });
  musicBtn.addEventListener('mouseleave', () => {
    if (!musicPlaying) musicBtn.style.color = 'rgba(255,255,255,0.5)';
  });
  musicBtn.addEventListener('click', async () => {
    musicPlaying = !musicPlaying;
    if (musicPlaying) {
      await ensureAudioContext();
      startAudioPlayback();
      musicBtn.style.color = '#fff';
      musicBtn.style.textShadow = '0 0 8px rgba(255,255,255,0.6)';
    } else {
      stopAudioPlayback();
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
      stopAudioPlayback();
      label.remove();
      musicBtn.remove();
      setNav.remove();
      modeNav.remove();
      clearTimeout(labelTimeout);
      if (audioCtx) audioCtx.close();
    },
    /**
     * Returns a 0–1 pulse derived from low-frequency transients.
     * Returns 0 when music is not playing or analyser is not ready.
     */
    getBeatEnergy: () => {
      if (!musicPlaying || !analyser || !analyserData) return 0;
      analyser.getByteFrequencyData(analyserData);

      // Detect bass onsets instead of raw level so sustained notes do not
      // flatten the whole scene into a constant wash of light.
      const bassEnd = Math.min(24, analyserData.length);
      let weightedSum = 0;
      let weightTotal = 0;
      let flux = 0;

      for (let i = 0; i < bassEnd; i++) {
        const value = analyserData[i] / 255;
        const weight = 1 - ((i / bassEnd) * 0.45);
        weightedSum += value * weight;
        weightTotal += weight;

        if (previousBassBins) {
          flux += Math.max(0, value - previousBassBins[i]);
        }
      }

      if (!previousBassBins || previousBassBins.length !== bassEnd) {
        previousBassBins = new Float32Array(bassEnd);
        for (let i = 0; i < bassEnd; i++) {
          previousBassBins[i] = analyserData[i] / 255;
        }
        bassEnergyEMA = weightedSum / Math.max(weightTotal, 1);
        return 0;
      }

      const bassEnergy = weightedSum / Math.max(weightTotal, 1);
      bassEnergyEMA = (bassEnergyEMA * 0.94) + (bassEnergy * 0.06);

      const transient = Math.max(0, bassEnergy - (bassEnergyEMA * 1.08));
      const fluxPulse = flux / bassEnd;
      const rawPulse = Math.min(1, (transient * 7.5) + (fluxPulse * 6.5));

      beatEnvelope = Math.max(rawPulse, beatEnvelope * 0.78);

      for (let i = 0; i < bassEnd; i++) {
        previousBassBins[i] = analyserData[i] / 255;
      }

      return Math.pow(Math.min(1, beatEnvelope), 0.9);
    },
    updateLabel,
    updateModeButtons,
    updateSetButtons,
  };
}
