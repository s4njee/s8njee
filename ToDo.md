# Monolith Visualization Roadmap

> Last reviewed: 2026-04-03 (audit: no new completions — all open items verified unfinished)

This file tracks the current Monolith implementation, marks what is already in place, and sorts the remaining work by value and implementation cost.

## Completed

These items are already present in the current Monolith codebase.

- `MonolithCanvas` is the top-level export (`MonolithCanvas.jsx` L665–675) — a thin `<Canvas>` wrapper that renders `<MonolithScene>` inside `<Suspense>`
- `MonolithScene` (`MonolithCanvas.jsx` L123–662, ~540 lines) is the main orchestration component that manages model loading, hotkeys, lighting modes, material overrides, overlays, and the effect snapshot pipeline
- `SET_DEFS` (in `monolith/set-defs.js`) drives model sets, hidden sets, default models, and lighting/style overrides
- Hidden set hotkeys are already configured through `SET_DEFS` (`7`, `8`, and `0`)
- Shared post-processing hotkeys are wired through the shared special-effects helpers (`createSharedEffectHotkeyListener`)
- White mode, x-ray mode, cinematic mode, databend mode, pixel mosaic, thermal vision, and hue cycle are all integrated
- Material normalization and x-ray shader handling are extracted into `monolith/materials.js`
- Animated lighting and particle-lighting modes are extracted into `monolith/lighting.js`
- Two lighting modes are defined: Scene (A) and Particles (B)
- Troika text overlays and logo overlays are extracted into `monolith/overlays.js`
- GUI controls are extracted into `monolith/gui.js`
- DOM navigation, labels, and music control are extracted into `monolith/ui.js`
- DRACO + GLTF loading and a session model cache (unbounded `Map` keyed by model path) are already in place
- `monolith/asset-url.js` handles standalone/root-compatible asset resolution via `resolveAssetUrl()`
- Shared post-processing is rendered through `SharedEffectStack` (returned by `MonolithScene`)

## Partially Completed

These areas already have structure, but the original goals are only partly met.

### Architecture

- The Monolith logic has been split into helpers:
  materials, lighting, overlays, GUI, and UI are each extracted into their own module, but `MonolithScene` is still ~500 lines of orchestration logic in a single function component. It manages 20+ refs, multiple effect toggles, model loading with caching, and hotkey handling.

  > **📋 TODO (code):** Consider extracting focused custom hooks from `MonolithScene` — e.g., `useModelLoader()`, `useHotkeyHandler()`, `useLightingMode()`. This would reduce the ref count in the main component and make each concern independently testable. This is a long-term item; the current structure works.

- Overlay behavior is partly data-driven:
  set logos are mapped by set index, but text visibility rules still use hardcoded set/model checks (`updateTextVisibility(stateRef.current.currentSetIndex, index)`).

- Material overrides are partly data-driven:
  they live in `SET_DEFS`, but still rely on inline predicate functions via `match(...)`.

  > **📋 TODO (code):** Replace `materialOverrides[].match(...)` predicates with declarative criteria objects (e.g., `{ nameContains: "glass", meshIndex: [2, 3] }`) so overrides are pure data and can be validated/tested without running the renderer.

- UI extraction is only partial:
  helper modules (`ui.js`, `gui.js`) exist, but the actual UI is still imperative DOM manipulated via `document.createElement`, `cssText`, and `window.setTimeout`. The progress bar, loading label, and error state (L510–553) are built this way.

  > **📋 TODO (code):** The `setTimeout` calls in `loadModel` (L297, L329) are fire-and-forget — they are not tracked or cleared on unmount. Track pending timeout IDs and clear them in the cleanup function (L614–630) to prevent stale DOM updates during hot reload or navigation.

### Performance / Lifecycle

- Model caching exists:
  loaded GLBs are stored in `modelCacheRef` (an unbounded `Map`), so revisiting a model within the same session reuses the parsed GLTF. However, there is no size limit — a user browsing many models will accumulate all of them in memory.

  > **📋 TODO (code):** Add an LRU eviction policy or a max-entries cap. A simple approach: track insertion order and `.delete()` the oldest entry when the map exceeds N entries (e.g., 10). Dispose of the evicted model's geometries and materials.

- ~~Model caching does not persist across sessions~~ — **DONE** (2026-03-23):
  Added `monolith/model-cache.js` using the Cache API (named cache: `monolith-models-v1`). The model loading flow was changed from `loader.load()` to `cachedFetch()` → `arrayBuffer()` → `loader.parse()`, which routes all GLB downloads through the persistent browser cache. Implementation details:
  - `cachedFetch(url)` — checks the Cache API first, falls back to network, caches the response clone
  - `prewarmCache(url)` — pre-fetches the next model without blocking
  - `clearModelCache()` — invalidates all cached models (bump `CACHE_NAME` version to mass-invalidate)
  - Error display extracted into `showLoadError()` helper, reused by both fetch and parse error paths
  - Lookup order: in-memory Map → Cache API → network

- Error handling exists:
  failed loads surface a red progress bar state with a "failed to load" label, but there is no retry button or richer recovery path.

- ~~Shanghai Bund HDRI mode (lighting mode C)~~ — **REMOVED** (2026-03-25):
  The HDR environment map (`/hdri/shanghai_bund_2k.hdr`), `RGBELoader`, `PMREMGenerator`, and all Shanghai Bund lighting code have been removed. The visualization now has two lighting modes: Scene (A) and Particles (B).

## Suggested Next Order

This is the recommended order for the next passes.

1. **Keyboard shortcut reference overlay**
   Why first: very visible, low risk, and the current hotkey surface is rich but undiscoverable. This is also on the Atom and Matrix roadmaps — consider building it once in the shared effects stack.

2. **Persist last-used set/model in `localStorage`**
   Why next: small surface area and immediately improves repeat visits. Store `{ setIndex, modelIndex }` under a single key.

3. ~~**Persistent model cache via Cache API**~~ — **DONE** (2026-03-23)
   Implemented in `monolith/model-cache.js` with `cachedFetch()` + `loader.parse()`. GLB responses are stored in the Cache API across sessions.

4. **Smarter model transitions**
   Why next: cached models currently still do a 200ms `setTimeout` fade (L297–302). Cached switches should feel instant; only network-loaded models should fade.

5. **Clean up pending `setTimeout` lifecycles** (see TODO note above)
   Why next: low-risk correctness improvement with a clear payoff during navigation/hot reload.

6. **Bound the session model cache** (see TODO note above)
   Why next: this is the cleanest memory-focused improvement that does not require a full architecture pass.

## Remaining Work By Theme

### P1: Strong Follow-Ups

- Make overlays fully data-driven from `SET_DEFS` (move text visibility rules out of hardcoded set/model checks)
- Make `materialOverrides` declarative instead of predicate-based (see TODO note above)
- Improve model-load failure UX with retry and clearer recovery
- Move more UI styling away from inline DOM `cssText` toward a component/style system

### P2: Advanced / Experimental

- Decompose `MonolithScene` (~540 lines) further into focused hooks/components
- Scope effect snapshot updates so they do not rerender the full scene subtree
- Move particle animation further toward GPU-driven behavior
- Add reactive DPR / display-quality adjustment

## Performance on Older / Low-End Machines

The current renderer always runs at full fidelity — every effect, all 5000 particles, max anisotropy, unbounded geometry. On older GPUs or integrated graphics this tanks the frame rate. The ideas below are sorted roughly by impact-to-effort ratio.

### Adaptive Quality / Auto-Detect

- **GPU tier detection at startup:**
  Use a lightweight probe (e.g., `detect-gpu` or a manual `renderer.capabilities` check) to classify the device into tiers (low / mid / high). Gate expensive features behind the tier so older machines get a playable baseline without manual tweaking.

- **Dynamic DPR scaling:**
  Currently DPR is fixed at mount (`Math.min(devicePixelRatio, 2)`). Instead, monitor frame time and drop the canvas resolution (e.g., from 2× → 1.5× → 1×) when frames consistently exceed 16ms. Restore when headroom returns. This is the single biggest lever for GPU-bound scenes.

- **FPS-adaptive effect stripping:**
  If the rolling average FPS drops below a threshold (e.g., 30), automatically disable the most expensive post-processing passes first (bloom → chromatic aberration → glitch), then reduce particle count, then lower shadow quality. Re-enable when FPS recovers. Expose a "quality" toggle (Low / Medium / High / Auto) in the GUI.

### Geometry & Draw Calls

- **Level of Detail (LOD):**
  Ship two or three decimated versions of each `.glb` (e.g., full / 50% / 25% triangle counts). Swap based on GPU tier or camera distance using `THREE.LOD`. This reduces vertex processing and memory bandwidth on weak GPUs without changing the visual at typical viewing distances.

- **Geometry instancing for repeated meshes:**
  If any sets share identical sub-meshes (weapons, accessories), use `InstancedMesh` to batch draw calls.

- **Frustum culling awareness:**
  Three.js frustum-culls by default, but only if bounding volumes are correct. After DRACO decompression, call `geometry.computeBoundingSphere()` / `computeBoundingBox()` to make sure culling actually kicks in. Verify with `renderer.info.render.calls` in the diagnostics overlay.

### Particles & Lighting

- **Tiered particle count:**
  Drop from 5000 → 1000 (or fewer) on low-tier devices. The `particleCount` is already a constant in `lighting.js` — make it a function of GPU tier.

- **Reduce glow light count:**
  6 dynamic `PointLight`s (one per nearest particle) are expensive on older hardware. On low tier, drop to 2–3 lights or replace with a single ambient approximation.

- **Skip color/light updates more aggressively:**
  Currently colors and glow lights update every 4 frames. On low-end, push this to every 8–12 frames, or freeze entirely when frame budget is tight.

### Post-Processing

- **Half-resolution effect passes:**
  Bloom and chromatic aberration can run at half the canvas resolution with minimal perceptual loss. Pass a smaller `renderTarget` size to the effect composer on low-tier devices.

- **Disable expensive effects by default on low tier:**
  X-ray, glitch, thermal vision, and pixel mosaic are visually rich but shader-heavy. Start with them disabled on detected low-end hardware; let the user opt in.

- **Simplify the x-ray shader:**
  The custom GLSL injects scanlines, noise, rim glow, and tear distortion per fragment. Provide a "lite" variant that skips noise sampling and tear distortion for low-end devices.

### Textures & Memory

- **Compressed textures (KTX2 / Basis):**
  DRACO compresses geometry but textures are still uncompressed in the GLB. Serving KTX2 (with Basis Universal) reduces VRAM usage and upload time significantly — especially important on 2–4 GB mobile/integrated GPUs.

- **Cap texture anisotropy on low-end:**
  `applyModelTextureFiltering` currently sets anisotropy to `getMaxAnisotropy()`. On low-tier devices, cap it at 4× or 2× to reduce texture sampling cost.

- **Mipmap generation:**
  Ensure all textures have mipmaps generated (`texture.generateMipmaps = true`). This reduces aliasing *and* improves cache performance when textures are viewed at less than full size.

### Loading & Perceived Performance

- **Progressive model display:**
  Show a low-poly silhouette or bounding-box placeholder immediately while the full model streams in. This matters most on slow networks + slow GPUs where both download and parse time are long.

- **Defer non-visible set prewarming:**
  `prewarmCache()` fetches the next model, but on low-end machines the parse cost can stall the current frame. Gate prewarming behind `requestIdleCallback` or skip it entirely when FPS is low.

- **Lazy-load post-processing:**
  Import the effect composer and individual passes only when first needed (e.g., user presses the bloom hotkey). This reduces initial JS parse/compile time on slower CPUs.

## Fresh Ideas

These are not from the original list, but they fit the current Monolith architecture well.

### UX / Browsing

- URL deep links:
  open directly to a specific set, model, lighting mode, or effect preset.
- Favorites:
  let users star a few models across sets and jump between them quickly.
- Camera bookmarks:
  front, low-angle, orbit-ready, and poster-composition presets.
- Photo mode:
  temporarily hide UI chrome and export a clean high-resolution still.

### Content / Presentation

- Per-model metadata cards:
  optional subtitle, franchise, notes, or artist/source callouts from `SET_DEFS`.
- Set intro cards:
  short transitional text when entering a new hidden or themed set.
- Music memory:
  persist the BGM on/off state across reloads via `localStorage`.

### Platform / Robustness

- Small diagnostics overlay:
  current set, model, lighting mode, cache size, and approximate FPS.
- Preload hints:
  optionally warm the next/previous model within the active set.
- Asset validation script:
  check mirrored public paths, missing files, and duplicate keys in `SET_DEFS`.

## Notes

- `MonolithCanvas` is the exported component. It is a thin `<Canvas>` + `<Suspense>` wrapper. `MonolithScene` contains all orchestration logic. Both live in `MonolithCanvas.jsx`.
- Monolith already has a good amount of helper extraction; favor incremental cleanup over a full rewrite.
- Keep `docs/monolith.md` aligned with actual hotkeys and the current imperative UI/cache behavior.
- When adding normal models to existing sets, prefer `SET_DEFS` and mirrored assets over new hardcoding in `MonolithCanvas.jsx`.
