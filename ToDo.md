# Monolith Visualization Roadmap

> Last reviewed: 2026-03-23

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
- Three lighting modes are defined: Scene (A), Particles (B), and Shanghai Bund (C) — the Shanghai Bund mode uses an HDR environment map (`/hdri/shanghai_bund_2k.hdr`) for reflections and scene lighting based on the Shanghai waterfront skyline
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
  materials, lighting, overlays, GUI, and UI are each extracted into their own module, but `MonolithScene` is still ~540 lines of orchestration logic in a single function component. It manages 20+ refs, multiple effect toggles, model loading with caching, hotkey handling, and HDRI loading.

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
  failed loads surface a red progress bar state with a "failed to load" label (L340–354), but there is no retry button or richer recovery path.

- Shanghai Bund HDRI support exists:
  the HDR environment load is triggered eagerly in the `useEffect` setup (L532–550) rather than lazily on first use of lighting mode C.

  > **📋 TODO (code):** Defer HDRI loading until the user first switches to Shanghai Bund mode (lighting mode C). The `RGBELoader.load()` call can be moved into `switchLightingMode()` with a one-time guard. This saves ~2 MB on initial load for users who never use mode C.

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
- Lazy-load the Shanghai Bund HDRI on first use of lighting mode C (see TODO note above)
- Improve model-load failure UX with retry and clearer recovery
- Move more UI styling away from inline DOM `cssText` toward a component/style system

### P2: Advanced / Experimental

- Decompose `MonolithScene` (~540 lines) further into focused hooks/components
- Scope effect snapshot updates so they do not rerender the full scene subtree
- Move particle animation further toward GPU-driven behavior
- Add reactive DPR / display-quality adjustment

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

- `MonolithCanvas` (L665–675) is the exported component. It is a thin `<Canvas>` + `<Suspense>` wrapper. `MonolithScene` (L123–662) contains all orchestration logic. Both live in `MonolithCanvas.jsx`.
- Monolith already has a good amount of helper extraction; favor incremental cleanup over a full rewrite.
- Keep `docs/monolith.md` aligned with actual hotkeys and the current imperative UI/HDRI/cache behavior.
- When adding normal models to existing sets, prefer `SET_DEFS` and mirrored assets over new hardcoding in `MonolithCanvas.jsx`.
