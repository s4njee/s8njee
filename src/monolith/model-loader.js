import { cachedFetch, hasCachedModel } from './model-cache.js';
import { resolveAssetUrl } from './asset-url.js';

// ── Model loader ────────────────────────────────────────────────────────────
// Owns the entire async model-loading pipeline that was previously inlined
// inside MonolithScene. MonolithScene now calls executeModelLoad() with a
// thin context object and this module handles:
//   - In-memory cache check → Cache API fetch → network fetch
//   - Streaming progress tracking with ReadableStream
//   - GLTF parsing via the GLTFLoader passed in ctx
//   - Material normalisation, texture filtering, material application
//   - Scheduling the model swap with a 200ms fade delay
//   - Timeout tracking so MonolithScene's cleanup can clear pending swaps
//
// See docs/agents/loadmodel.md for the full extraction plan.

// ── Timeout tracker ──────────────────────────────────────────────────────────
// Every setTimeout scheduled by the loader is tracked here so the component's
// useEffect cleanup can cancel pending swaps on unmount.

const pendingTimeouts = new Set();

function scheduleTrackedTimeout(callback, delay) {
  const id = window.setTimeout(() => {
    pendingTimeouts.delete(id);
    callback();
  }, delay);
  pendingTimeouts.add(id);
  return id;
}

export function clearPendingTimeouts() {
  for (const id of pendingTimeouts) {
    window.clearTimeout(id);
  }
  pendingTimeouts.clear();
}

// ── Progress bar helpers ─────────────────────────────────────────────────────
// These operate on the { bar, container } DOM structure created by the
// useEffect in MonolithScene. All progress functions are safe to call with
// a null/undefined progress ref.

function showLoadError(progress, modelName) {
  if (!progress) return;
  progress.container.style.opacity = '1';
  progress.bar.style.width = '100%';
  progress.bar.style.background = '#ff5c5c';
  progress.container.style.width = '320px';
  const label = progress.container.firstChild;
  if (label) {
    label.textContent = `failed to load ${modelName.toLowerCase()}`;
    label.style.color = 'rgba(255,92,92,0.9)';
  }
}

function resetLoadProgress(progress) {
  if (!progress) return;
  progress.container.style.transition = 'opacity 0.2s';
  progress.container.style.opacity = '1';
  progress.container.style.width = '200px';
  progress.bar.style.width = '0%';
  progress.bar.style.background = '#fff';
  const label = progress.container.firstChild;
  if (label) {
    label.textContent = 'loading';
    label.style.color = 'rgba(255,255,255,0.5)';
  }
}

function hideLoadProgress(progress, { immediate = false } = {}) {
  if (!progress) return;
  progress.container.style.transition = immediate ? 'opacity 0s' : 'opacity 0.4s';
  progress.container.style.opacity = '0';
}

function updateLoadProgress(progress, loadedBytes, totalBytes) {
  if (!progress) return;
  if (totalBytes && totalBytes > 0) {
    progress.bar.style.width = `${Math.round((loadedBytes / totalBytes) * 100)}%`;
    return;
  }
  // Some cached/proxied responses do not expose Content-Length. In that case,
  // still show visible progress instead of leaving the bar at 0%.
  const fallbackProgress = Math.min(90, 8 + Math.sqrt(loadedBytes / 65536) * 18);
  progress.bar.style.width = `${fallbackProgress}%`;
}

// ── Streaming reader ─────────────────────────────────────────────────────────

// Used when Content-Length is unavailable (e.g. Cloudflare compresses the
// response and strips the header). Asymptotically approaches 90% so the bar
// is always visibly moving during a long download.
function startSimulatedProgress(progress) {
  if (!progress) return () => {};
  let current = 5;
  progress.bar.style.width = `${current}%`;
  const id = setInterval(() => {
    current += (90 - current) * 0.05;
    progress.bar.style.width = `${Math.round(current)}%`;
  }, 150);
  return () => clearInterval(id);
}

async function readModelArrayBuffer(response, progress, trackProgress) {
  if (!trackProgress) {
    return response.arrayBuffer();
  }

  const totalBytes = Number.parseInt(response.headers.get('content-length') ?? '', 10);

  if (!response.body || !Number.isFinite(totalBytes)) {
    const cancelSimulated = startSimulatedProgress(progress);
    const buffer = await response.arrayBuffer();
    cancelSimulated();
    updateLoadProgress(progress, buffer.byteLength, Number.isFinite(totalBytes) ? totalBytes : 0);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    updateLoadProgress(progress, loadedBytes, totalBytes);
  }

  const buffer = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  updateLoadProgress(progress, loadedBytes, totalBytes);
  return buffer.buffer;
}

// ── Main load function ───────────────────────────────────────────────────────

/**
 * Executes the full model load pipeline: cache check → fetch → parse → swap.
 *
 * @param {Object} ctx — assembled by MonolithScene's thin loadModel wrapper.
 * @param {number}   ctx.index
 * @param {boolean}  ctx.showProgressIfUncached
 * @param {Object}   ctx.entry             — { key, name, path }
 * @param {Object}   ctx.def               — the SET_DEFS entry
 * @param {number}   ctx.setIndex          — current set index
 * @param {boolean}  ctx.xrayMode
 * @param {string}   ctx.cacheKey          — cache lookup key (entry.path)
 * @param {Map}      ctx.modelCache        — the in-memory session cache
 * @param {Object}   ctx.loader            — GLTFLoader instance
 * @param {Object|null} ctx.progress       — { bar, container } DOM nodes
 * @param {Object|null} ctx.materialManager
 * @param {() => number} ctx.getCurrentModelIndex
 * @param {Function} ctx.onSwapModel       — (model, name, animations) => void
 * @param {Function} ctx.onUpdateOverlays  — (setIndex, modelIndex) => void
 * @param {Function} ctx.onRevealScene
 * @param {HTMLElement} ctx.canvasDom      — gl.domElement
 */
export async function executeModelLoad(ctx) {
  const {
    index,
    showProgressIfUncached,
    entry,
    def,
    setIndex,
    xrayMode,
    cacheKey,
    modelCache,
    loader,
    progress,
    materialManager,
    getCurrentModelIndex,
    onSwapModel,
    onUpdateOverlays,
    onRevealScene,
    canvasDom,
  } = ctx;

  canvasDom.style.opacity = '0';
  onUpdateOverlays(setIndex, -1);

  // ── In-memory cache hit ──────────────────────────────────────────────────
  if (modelCache.has(cacheKey)) {
    hideLoadProgress(progress, { immediate: true });
    const cached = modelCache.get(cacheKey);
    materialManager?.applyModelMaterials(
      cached.model,
      def,
      setIndex,
      index,
      xrayMode,
    );
    scheduleTrackedTimeout(() => {
      if (getCurrentModelIndex() !== index) return;
      onSwapModel(cached.model, entry.name, cached.animations);
      onUpdateOverlays(setIndex, index);
      onRevealScene();
    }, 200);
    return;
  }

  // ── Cache API / network fetch ────────────────────────────────────────────
  const modelUrl = resolveAssetUrl(entry.path);
  const shouldTrackProgress = (
    showProgressIfUncached
    && !(await hasCachedModel(modelUrl))
  );

  if (shouldTrackProgress) {
    resetLoadProgress(progress);
  } else {
    hideLoadProgress(progress, { immediate: true });
  }

  cachedFetch(modelUrl)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} loading ${entry.path}`);
      }
      return readModelArrayBuffer(response, progress, shouldTrackProgress);
    })
    .then((buffer) => {
      loader.parse(
        buffer,
        // resourcePath — tells the parser where to resolve relative
        // references (textures, etc.) within the GLB
        resolveAssetUrl(entry.path.substring(0, entry.path.lastIndexOf('/') + 1)),
        (gltf) => {
          if (shouldTrackProgress) {
            hideLoadProgress(progress);
          }

          const model = gltf.scene;
          const animations = gltf.animations;

          materialManager?.normalizeModelTransform(model, def, index);
          materialManager?.applyModelTextureFiltering(model);
          materialManager?.applyModelMaterials(
            model,
            def,
            setIndex,
            index,
            xrayMode,
          );

          modelCache.set(cacheKey, { model, animations });
          scheduleTrackedTimeout(() => {
            if (getCurrentModelIndex() !== index) return;
            onSwapModel(model, entry.name, animations);
            onUpdateOverlays(setIndex, index);
            onRevealScene();
          }, 200);
        },
        (error) => {
          console.error('Failed to parse model', entry.path, error);
          canvasDom.style.opacity = '1';
          showLoadError(progress, entry.name);
        },
      );
    })
    .catch((error) => {
      console.error('Failed to load model', entry.path, error);
      canvasDom.style.opacity = '1';
      showLoadError(progress, entry.name);
    });
}
