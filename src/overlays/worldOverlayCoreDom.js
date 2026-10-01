// Moved out of worldOverlay.js (worldOverlayCoreDom).

import { scanUiOccluders } from './worldOverlayOccluder.js';
import { registryDomainList, registrySourceList } from './worldOverlaySourceRegistry.js';
import { LABEL_ARBITER_TIMING } from '../data/labelArbiter.js';
import { ACCESSIBILITY_LIST_ID, ACCESSIBILITY_ROOT_ID, ACCESSIBILITY_STATUS_ID, CANVAS_ID, DETECTION_SURFACE_ID, ROOT_ID, _viewport } from './worldOverlayCoreConstants.js';
import { invalidateHost, nowMs, sourceActive } from './worldOverlayCoreHelpers.js';
import { S, _accessibleActivatorByKey, _customPaintLaneList, _hitRects } from './worldOverlayCoreState.js';

export function ensureOverlayDom() {
  S._root = document.getElementById(ROOT_ID);
  if (!S._root) {
    S._root = document.createElement('div');
    S._root.id = ROOT_ID;
    S._root.setAttribute('aria-hidden', 'true');
    const parent = S._viewer.container?.parentElement || document.body;
    if (S._viewer.container?.nextSibling) parent.insertBefore(S._root, S._viewer.container.nextSibling);
    else parent.appendChild(S._root);
  }
  S._canvas = S._root.querySelector?.(`#${CANVAS_ID}`) || document.getElementById(CANVAS_ID);
  if (!S._canvas) {
    S._canvas = document.createElement('canvas');
    S._canvas.id = CANVAS_ID;
    S._root.appendChild(S._canvas);
  }
  // The detection surface is parented to the Cesium container, NOT to
  // `#world-overlay-root`. Detection paints with `mix-blend-mode: screen`,
  // which only reaches the WebGL scene while no ancestor between the surface
  // and the Cesium canvas forms a stacking context (an isolated blending
  // group). `#cesiumContainer` is `position:absolute; z-index:auto` and does
  // not; `#world-overlay-root` is `z-index:6` and does — parenting here made
  // the browser silently discard the blend while the CSS string stayed
  // `'screen'`. Paint order is expressed purely by z-index: this surface is
  // z5, the shared card canvas inside the root is z6.
  const detectionParent = S._viewer?.container || document.body;
  S._detectionSurface = detectionParent.querySelector?.(`#${DETECTION_SURFACE_ID}`)
    || document.getElementById(DETECTION_SURFACE_ID);
  if (!S._detectionSurface) {
    S._detectionSurface = document.createElement('canvas');
    S._detectionSurface.id = DETECTION_SURFACE_ID;
  }
  if (S._detectionSurface.parentElement !== detectionParent) {
    detectionParent.appendChild(S._detectionSurface);
  }
  S._root.setAttribute('aria-hidden', 'true');
  S._canvas.setAttribute('aria-hidden', 'true');
  S._detectionSurface.setAttribute('aria-hidden', 'true');
  S._accessibilityRoot = document.getElementById(ACCESSIBILITY_ROOT_ID);
  if (!S._accessibilityRoot) {
    S._accessibilityRoot = document.createElement('div');
    S._accessibilityRoot.id = ACCESSIBILITY_ROOT_ID;
    S._accessibilityRoot.className = 'world-overlay-accessibility';
    S._accessibilityRoot.setAttribute('role', 'region');
    S._accessibilityRoot.setAttribute('aria-label', 'Visible map targets');
    document.body.appendChild(S._accessibilityRoot);
  }
  S._accessibilityList = document.getElementById(ACCESSIBILITY_LIST_ID);
  if (!S._accessibilityList) {
    S._accessibilityList = document.createElement('div');
    S._accessibilityList.id = ACCESSIBILITY_LIST_ID;
    S._accessibilityRoot.appendChild(S._accessibilityList);
  }
  S._accessibilityStatus = document.getElementById(ACCESSIBILITY_STATUS_ID);
  if (!S._accessibilityStatus) {
    S._accessibilityStatus = document.createElement('div');
    S._accessibilityStatus.id = ACCESSIBILITY_STATUS_ID;
    S._accessibilityStatus.setAttribute('role', 'status');
    S._accessibilityStatus.setAttribute('aria-live', 'polite');
    S._accessibilityStatus.setAttribute('aria-atomic', 'true');
    S._accessibilityRoot.appendChild(S._accessibilityStatus);
  }
  S._ctx = S._canvas.getContext('2d', { alpha: true, desynchronized: true });
  S._detectionCtx = S._detectionSurface.getContext('2d', { alpha: true, desynchronized: true });
}

function sizeCanvasSurface(canvas, ctx, width, height, dpr) {
  if (!canvas) return false;
  const backingWidth = Math.round(width * dpr);
  const backingHeight = Math.round(height * dpr);
  const changed = canvas.width !== backingWidth || canvas.height !== backingHeight;
  if (changed) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx?.setTransform?.(dpr, 0, 0, dpr, 0, 0);
  return changed;
}

/**
 * Size the backing store to the live CSS box and DPR. A dormant host never
 * calls this, so a zero-source overlay keeps a 0x0 canvas instead of a
 * full-viewport buffer; `drawWorldOverlay` sizes lazily on the first frame
 * that actually has paint work.
 */
export function ensureCanvasSize() {
  if (!S._canvas || !S._viewer?.canvas) return false;
  const width = Math.max(0, Math.round(Number(S._viewer.canvas.clientWidth) || 0));
  const height = Math.max(0, Math.round(Number(S._viewer.canvas.clientHeight) || 0));
  const dpr = Math.max(1, Number(globalThis.window?.devicePixelRatio) || 1);
  const changed = S._canvas.width !== Math.round(width * dpr)
    || S._canvas.height !== Math.round(height * dpr)
    || S._detectionSurface?.width !== Math.round(width * dpr)
    || S._detectionSurface?.height !== Math.round(height * dpr)
    || S._canvasWidth !== width || S._canvasHeight !== height || S._canvasDpr !== dpr;
  S._resizeDirty = false;
  if (!changed) return false;
  sizeCanvasSurface(S._detectionSurface, S._detectionCtx, width, height, dpr);
  sizeCanvasSurface(S._canvas, S._ctx, width, height, dpr);
  S._canvasWidth = width;
  S._canvasHeight = height;
  _viewport.width = width;
  _viewport.height = height;
  S._canvasDpr = dpr;
  S._occludersDirty = true;
  S._solveDirty = true;
  S._canvasNeedsClear = true;
  // Resizing a canvas clears its backing store by definition.
  S._detectionSurfaceNeedsClear = false;
  S._layoutRevision++;
  return true;
}

/**
 * Re-scan the UI-chrome exclusion inventory via `worldOverlayOccluder.js`
 * and, when it actually refreshed, bump the shared solve/layout flags that
 * stay host-owned (they're also written by `ensureCanvasSize` and read by
 * `drawWorldOverlay`/`prepareCustomPaintFrame` — see that module's header
 * for why the split falls where it does).
 */
export function refreshUiOccluders(timestamp, force = false) {
  if (!S._occludersDirty) return false;
  const refreshed = scanUiOccluders(S._canvas, timestamp, force, () => S._viewer?.scene?.requestRender?.());
  if (!refreshed) return false;
  S._occludersDirty = false;
  S._solveDirty = true;
  S._layoutRevision++;
  return true;
}

export function markLayoutDirty() {
  S._resizeDirty = true;
  S._occludersDirty = true;
  if (!overlayHasPaintWork()) return;
  invalidateHost({ solve: true, layout: true });
}

export function markOccludersDirty() {
  S._occludersDirty = true;
  if (!overlayHasPaintWork()) return;
  invalidateHost({ solve: true });
}

function clearCanvasSurface(canvas, ctx) {
  if (!ctx || !canvas || !(canvas.width > 0) || !(canvas.height > 0)) return;
  ctx.setTransform?.(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform?.(S._canvasDpr, 0, 0, S._canvasDpr, 0, 0);
}

/** Clear either or both host-owned surfaces through the single frame path. */
export function clearCanvas(clearMain = true, clearDetection = true) {
  if (clearMain) {
    clearCanvasSurface(S._canvas, S._ctx);
    S._canvasNeedsClear = false;
  }
  if (clearDetection) {
    clearCanvasSurface(S._detectionSurface, S._detectionCtx);
    S._detectionSurfaceNeedsClear = false;
  }
}

function activeEntryCount() {
  let count = 0;
  for (let i = 0; i < registrySourceList.length; i++) {
    const source = registrySourceList[i];
    if (sourceActive(source)) count += source.entries.size;
  }
  return count;
}

export function activeCustomPaintLaneCount(target = null) {
  let count = 0;
  for (let i = 0; i < _customPaintLaneList.length; i++) {
    const record = _customPaintLaneList[i];
    if (record.active && (target === null || record.target === target)) count++;
  }
  return count;
}

export function activeFadeCount(timestamp) {
  let count = 0;
  for (let d = 0; d < registryDomainList.length; d++) {
    const arbiter = registryDomainList[d].arbiter;
    const stateCount = arbiter.activeStateCount();
    for (let i = 0; i < stateCount; i++) {
      const state = arbiter.activeStateAt(i);
      if (state.selected) {
        if (timestamp - state.enterStartedAt < LABEL_ARBITER_TIMING.fadeInMs) count++;
      } else if (timestamp - state.exitStartedAt < LABEL_ARBITER_TIMING.fadeOutMs) {
        count++;
      }
    }
  }
  return count;
}

export function overlayHasPaintWork(timestamp = nowMs()) {
  if (activeCustomPaintLaneCount() > 0) return true;
  if (activeEntryCount() > 0) return true;
  if (!S._solveDirty) return activeFadeCount(timestamp) > 0;
  for (let d = 0; d < registryDomainList.length; d++) {
    if (registryDomainList[d].arbiter.states.size > 0) return true;
  }
  return false;
}

/** Keep a stable, bounded accessible mirror of currently painted actions. */
export function syncAccessibleActions() {
  if (!S._accessibilityList) return;
  _accessibleActivatorByKey.clear();
  const items = [];
  for (let i = S._hitRectCount - 1; i >= 0; i--) {
    const rect = _hitRects[i];
    const entry = rect.entry;
    if (!entry?.accessibilityLabel || typeof entry.activate !== 'function') continue;
    if (_accessibleActivatorByKey.has(rect.key)) continue;
    _accessibleActivatorByKey.set(rect.key, entry.activate);
    items.push({
      key: rect.key,
      label: entry.accessibilityLabel,
      selected: entry.selected === true,
    });
  }
  const signature = items
    .map((item) => `${item.key}\u0000${item.label}\u0000${item.selected ? '1' : '0'}`)
    .join('\u0001');
  if (signature === S._accessibilitySignature) return;
  S._accessibilitySignature = signature;
  if (typeof S._accessibilityList.replaceChildren === 'function') {
    S._accessibilityList.replaceChildren();
  } else {
    while (S._accessibilityList.firstChild) S._accessibilityList.removeChild(S._accessibilityList.firstChild);
  }
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = item.label;
    button.setAttribute('aria-label', item.label);
    button.setAttribute('aria-pressed', String(item.selected));
    button.dataset.overlayActionKey = item.key;
    button.addEventListener?.('click', () => {
      const activate = _accessibleActivatorByKey.get(item.key);
      if (!activate) return;
      const accepted = activate();
      if (accepted !== false && S._accessibilityStatus) {
        S._accessibilityStatus.textContent = `Focusing ${item.label}`;
      }
    });
    S._accessibilityList.appendChild(button);
  }
}
