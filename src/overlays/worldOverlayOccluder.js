/**
 * @module worldOverlayOccluder
 * @description UI-chrome exclusion inventory for the world overlay host:
 * tracks which on-screen chrome elements (panels, HUD corners, cockpit
 * windows) currently occupy screen space, and keeps a pool of
 * canvas-relative exclusion rectangles the placement solver in
 * `worldOverlay.js` treats as a soft (or, for below-host chrome, hard)
 * placement preference — never a paint mask (see `WORLD_OVERLAY_OCCLUDER_SELECTORS`
 * below for why).
 *
 * This module owns its OWN private closure state for everything genuinely
 * exclusive to occluder tracking (the ResizeObserver/MutationObserver pair,
 * the observed-element WeakSet, the refresh-throttle timer, and the
 * rectangle pool itself). It deliberately does NOT own `_solveDirty` /
 * `_occludersDirty` / `_resizeDirty` / `_layoutRevision` — those flags are
 * genuinely shared with canvas-resize handling and paint-frame prep that
 * stay in `worldOverlay.js`. The boundary is therefore a small
 * state-passing interface rather than a pure copy: `installUiOccluderObservers`
 * takes the host's dirty-flag setters (`onLayoutDirty`/`onOccludersDirty`)
 * and paint-work predicate (`hasPaintWork`) as callbacks instead of reaching
 * for them as globals, and `scanUiOccluders` returns whether it actually
 * refreshed so the host can update its own shared flags afterward.
 * `getUiOcclusionRects()` returns the live pooled array by reference — the
 * host captures it once at module load and reads it directly every frame,
 * so the existing allocation-free per-frame contract
 * (`_customPaintFrame.uiRects`) needs no change at any of its call sites.
 */

const OCCLUDER_PADDING_PX = 6;
const OCCLUDER_REFRESH_MS = 100;

/**
 * Unified UI exclusion inventory. Selectors may match multiple elements; the
 * service caches their rectangles and observes layout/visibility changes.
 *
 * These rectangles are a PLACEMENT policy, never a paint mask. Every element
 * listed here composites ABOVE the overlay host — map chrome sits at z90–z1000
 * and the cockpit HUD at z145, against this host's z5/z6 — so the browser
 * already keeps overlay pixels off it and no canvas needs clipping. What the
 * inventory buys is readability: a card placed under solid chrome is simply
 * lost, so the solver PREFERS placements clear of it. When nothing is clear the
 * entry still renders and the chrome covers it, exactly as it did before the
 * host existed.
 *
 * The list therefore holds only chrome dense enough to swallow a card. The
 * cockpit's thin translucent line art — rims, arcs, rails, tapes, toplines,
 * readouts — is deliberately ABSENT under the owner's AR-HUD ruling:
 * world-space overlay content renders beneath the cockpit's screen-space HUD,
 * which paints over it by z-order. Those elements are also enormous (the
 * altitude rim is keyhole-tall, the topline viewport-wide), and excluding them
 * suppressed essentially the entire cockpit view. Only the two solid,
 * backdrop-filled cockpit windows survive as exclusions.
 */
export const WORLD_OVERLAY_OCCLUDER_SELECTORS = Object.freeze([
  '#title-bar',
  '#style-indicator',
  '#top-center-actions',
  '#traffic-sync-chip',
  '#cctv-sync-chip',
  '#left-panel-stack',
  '#right-context-rail',
  '#pp-toggles',
  '#command-dock',
  '#gev-voice-control',
  '#cesium-credits',
  '.hud-top-left',
  '.hud-top-right',
  '.hud-bottom-left',
  '.hud-bottom-right',
  '.hud-top-bar',
  '.hud-bottom-bar',
  '#space-mission-panel',
  '#space-mission-panel-host',
  '#military-awareness-panel',
  // Cockpit: solid backdrop-filled windows only (both bounded to
  // `min(340px, 28vw)` wide and `min(42vh, 410px)` tall, both `hidden` until
  // toggled). Every other cockpit selector was removed — see the block comment.
  '#cockpit-context',
  '#cockpit-signal-stream',
]);

let _resizeObserver = null;
let _mutationObserver = null;
let _observedOccluderElements = new WeakSet();
let _occluderRefreshTimer = null;
let _windowResizeHandler = null;
let _occludersUpdatedAt = Number.NEGATIVE_INFINITY;
const _uiOcclusionRects = [];
const _uiOcclusionRectPool = [];

/** Live pooled exclusion-rectangle array, by reference (never reallocated). */
export function getUiOcclusionRects() {
  return _uiOcclusionRects;
}

/** Timestamp of the last completed scan, or `-Infinity` if none has run yet. */
export function getOccludersUpdatedAt() {
  return _occludersUpdatedAt;
}

/**
 * Only chrome the user can actually see may exclude anything. A collapsed or
 * hidden panel must contribute nothing, including when the reason it is
 * invisible lives on an ANCESTOR — a child of a `display:none` container keeps
 * its own computed `display`, so the local style test alone cannot see it.
 * `checkVisibility` resolves the whole chain; the local test is the fallback.
 */
function elementIsVisible(element) {
  if (!element || element.hidden) return false;
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({
      contentVisibilityAuto: true,
      // The spec renamed these; pass both spellings so the check keeps its
      // opacity/visibility coverage on either engine vintage. Unknown keys are
      // ignored, and every option defaults to false, so a missing alias would
      // silently weaken the test rather than throw.
      opacityProperty: true,
      visibilityProperty: true,
      checkOpacity: true,
      checkVisibilityCSS: true,
    }) !== false;
  }
  const style = globalThis.window?.getComputedStyle?.(element);
  if (!style) return true;
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
}

/**
 * Highest z-index the host paints at: the card canvas sits in `#world-overlay-root`
 * (z6) and the detection surface at z5. Chrome ABOVE this composites over host
 * paint; chrome at or below it is painted OVER by the host.
 */
const HOST_TOP_Z_INDEX = 6;

/**
 * Effective stacking level of an element relative to the page root.
 *
 * Paint order against the host is decided by the OUTERMOST positioned ancestor
 * carrying a z-index — that is the stacking context which actually competes with
 * `#world-overlay-root` — so the walk keeps overwriting as it climbs and returns
 * the last one found. An element with no positioned z-indexed ancestor stacks at
 * the root's own level, which is below the host.
 */
function elementStackLevel(element) {
  let level = 0;
  let node = element;
  while (node && node !== document.body) {
    const style = globalThis.window?.getComputedStyle?.(node);
    if (style && style.position !== 'static' && style.zIndex !== 'auto') {
      const numeric = Number(style.zIndex);
      if (Number.isFinite(numeric)) level = numeric;
    }
    node = node.parentElement;
  }
  return level;
}

/**
 * Does this chrome composite ABOVE the host?
 *
 * This is the justification for treating exclusion as a soft preference: chrome
 * that paints over the host hides an unplaceable card harmlessly. Chrome that
 * paints UNDER the host does not — a card kept there renders ON TOP of it, which
 * violates the absolute rule that labels never cover the UI. `#intel-hud` is z2,
 * i.e. below both host surfaces, so its corners and bars need a HARD veto.
 */
function occluderStacksAboveHost(element) {
  return elementStackLevel(element) > HOST_TOP_Z_INDEX;
}

/** Append one inflated, canvas-relative exclusion rectangle from the pool. */
function pushUiOcclusionRect(rect, canvasRect, hard = false) {
  const index = _uiOcclusionRects.length;
  const out = _uiOcclusionRectPool[index] || (_uiOcclusionRectPool[index] = {});
  // `hard` rects veto a placement outright; soft rects are only preferred against.
  out.hard = hard;
  out.x = rect.left - canvasRect.left - OCCLUDER_PADDING_PX;
  out.y = rect.top - canvasRect.top - OCCLUDER_PADDING_PX;
  out.w = rect.width + OCCLUDER_PADDING_PX * 2;
  out.h = rect.height + OCCLUDER_PADDING_PX * 2;
  _uiOcclusionRects.push(out);
}

/**
 * Re-scan the chrome inventory and repopulate `_uiOcclusionRects`, throttled
 * to `OCCLUDER_REFRESH_MS`. Returns whether it actually refreshed — the
 * caller (`worldOverlay.js`'s `refreshUiOccluders` wrapper) is responsible
 * for clearing its own `_occludersDirty` flag and bumping `_solveDirty`/
 * `_layoutRevision` when this returns `true`, since those stay host-owned.
 * @param {HTMLCanvasElement|null} canvas Host canvas the rectangles are relative to.
 * @param {number} timestamp Current frame timestamp (`performance.now()`-like).
 * @param {boolean} force Bypass the refresh throttle (first-ever scan).
 * @param {function():void} [requestRender] Called once the throttle timer fires,
 *   so a scan deferred by the throttle still eventually paints.
 */
export function scanUiOccluders(canvas, timestamp, force, requestRender) {
  if (!canvas) return false;
  const elapsed = timestamp - _occludersUpdatedAt;
  if (!force && elapsed < OCCLUDER_REFRESH_MS) {
    if (_occluderRefreshTimer == null && typeof setTimeout === 'function') {
      _occluderRefreshTimer = setTimeout(() => {
        _occluderRefreshTimer = null;
        requestRender?.();
      }, Math.max(0, OCCLUDER_REFRESH_MS - elapsed));
    }
    return false;
  }
  _occludersUpdatedAt = timestamp;
  _uiOcclusionRects.length = 0;
  const canvasRect = canvas.getBoundingClientRect?.() || { left: 0, top: 0 };
  const seen = new Set();
  for (const selector of WORLD_OVERLAY_OCCLUDER_SELECTORS) {
    const matches = document.querySelectorAll?.(selector)
      || [document.querySelector?.(selector)].filter(Boolean);
    for (const element of matches) {
      if (seen.has(element) || !elementIsVisible(element)) continue;
      seen.add(element);
      if (_resizeObserver && !_observedOccluderElements.has(element)) {
        _resizeObserver.observe(element);
        _mutationObserver?.observe?.(element, OCCLUDER_ATTRIBUTE_OBSERVATION);
        _observedOccluderElements.add(element);
      }
      const rect = element.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      pushUiOcclusionRect(rect, canvasRect, !occluderStacksAboveHost(element));
    }
  }
  // Each element keeps its OWN rectangle. The inventory used to be reduced to
  // transitive bounding UNIONS of overlapping rects, which is only a
  // requirement for even-odd canvas holes (overlapping holes toggle pixels back
  // on) — and the host no longer punches holes in anything. As placement
  // geometry the unions were actively wrong: a chain of pairwise-overlapping
  // panels collapsed into one enormous rectangle that swept unrelated world
  // space, jumped in size whenever a panel expanded, and in cockpit coalesced
  // to 94-98 % of the viewport. Per-rect exclusions hug the real chrome.
  return true;
}

/**
 * Occluder-element attribute observation is deliberately NOT `subtree`: the
 * inventory only reads each occluder's own border box and visibility, and a
 * descendant cannot change either without the element's ResizeObserver seeing
 * it. Subtree scope added nothing — but it delivered every ticking descendant
 * (the REC-dot blink, chip internals) as an invalidation, which held a parked
 * camera at ~12 requestRender/s for every live overlay source.
 */
const OCCLUDER_ATTRIBUTE_OBSERVATION = Object.freeze({
  attributes: true,
  attributeFilter: Object.freeze(['class', 'style', 'hidden']),
});

/**
 * True when a node either IS inventory chrome or CONTAINS some. Judged against
 * live nodes at record-delivery time, so "append, then set id" within one task
 * is still seen; removals judge the detached subtree, which selector APIs
 * still traverse.
 */
function nodeIsOrContainsOccluderChrome(node) {
  if (!node || typeof node.matches !== 'function') return false; // text/comment nodes
  for (const selector of WORLD_OVERLAY_OCCLUDER_SELECTORS) {
    if (node.matches(selector)) return true;
    if (typeof node.querySelector === 'function' && node.querySelector(selector)) return true;
  }
  return false;
}

function childListTouchesChrome(nodes) {
  if (!nodes) return false;
  for (let i = 0; i < nodes.length; i++) {
    if (nodeIsOrContainsOccluderChrome(nodes[i])) return true;
  }
  return false;
}

/**
 * Shared MutationObserver callback for both observation scopes. Body-level
 * childList records are DISCOVERY only — they matter solely when the churn
 * adds or removes inventory chrome, so a ticking clock's text swaps and other
 * non-chrome element churn are dropped here. Attribute records can only
 * originate from an occluder element itself (element-scoped observation), so
 * they always invalidate. A batch the runtime failed to deliver falls back to
 * the conservative pre-filter behavior.
 *
 * `hasPaintWork`/`onOccludersDirty` are the host's `overlayHasPaintWork`/
 * `markOccludersDirty` — passed in by `installUiOccluderObservers` rather than
 * imported, since both close over host-owned shared state.
 */
function handleChromeMutations(records, hasPaintWork, onOccludersDirty) {
  if (!hasPaintWork()) {
    // Dormant host: keep the pre-filter flag semantics without paying selector
    // checks — the first frame with real paint work force-refreshes anyway.
    onOccludersDirty();
    return;
  }
  if (!records || typeof records.length !== 'number') {
    onOccludersDirty();
    return;
  }
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    if (record.type !== 'childList'
      || childListTouchesChrome(record.addedNodes)
      || childListTouchesChrome(record.removedNodes)) {
      onOccludersDirty();
      return;
    }
  }
}

/**
 * Wire the resize/mutation observers that keep the occluder inventory fresh.
 * @param {HTMLElement|null} root Host root element (also observed for resize).
 * @param {{onLayoutDirty:function():void, hasPaintWork:function():boolean, onOccludersDirty:function():void}} callbacks
 *   `onLayoutDirty` is used for both the window resize listener and the
 *   per-element ResizeObserver, matching the pre-split behavior where both
 *   fed the same host-owned invalidation path.
 */
export function installUiOccluderObservers(root, { onLayoutDirty, hasPaintWork, onOccludersDirty } = {}) {
  _windowResizeHandler = onLayoutDirty;
  globalThis.window?.addEventListener?.('resize', _windowResizeHandler);
  if (typeof MutationObserver === 'function' && document.body) {
    _mutationObserver = new MutationObserver(
      (records) => handleChromeMutations(records, hasPaintWork, onOccludersDirty),
    );
    // Body observation is childList discovery only, filtered in the callback;
    // attribute churn is observed per occluder element, without subtree.
    _mutationObserver.observe(document.body, { subtree: true, childList: true });
  }
  if (typeof ResizeObserver === 'function') {
    _resizeObserver = new ResizeObserver(onLayoutDirty);
    if (root) {
      _resizeObserver.observe(root);
      _observedOccluderElements.add(root);
    }
    for (const selector of WORLD_OVERLAY_OCCLUDER_SELECTORS) {
      const matches = document.querySelectorAll?.(selector) || [];
      for (const element of matches) {
        if (_observedOccluderElements.has(element)) continue;
        _resizeObserver.observe(element);
        _mutationObserver?.observe?.(element, OCCLUDER_ATTRIBUTE_OBSERVATION);
        _observedOccluderElements.add(element);
      }
    }
  }
}

/** Tear down observers/timers and reset the rectangle pool. Idempotent. */
export function destroyUiOccluderObservers() {
  if (_windowResizeHandler && typeof window !== 'undefined') {
    window.removeEventListener('resize', _windowResizeHandler);
  }
  _windowResizeHandler = null;
  _resizeObserver?.disconnect?.();
  _resizeObserver = null;
  _observedOccluderElements = new WeakSet();
  _mutationObserver?.disconnect?.();
  _mutationObserver = null;
  if (_occluderRefreshTimer != null) clearTimeout(_occluderRefreshTimer);
  _occluderRefreshTimer = null;
  _uiOcclusionRects.length = 0;
  _uiOcclusionRectPool.length = 0;
  _occludersUpdatedAt = Number.NEGATIVE_INFINITY;
}
