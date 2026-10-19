// Moved out of satellites.js (satellitesDense).

import { horizonOccluder } from './iconOrientation.js';
import * as Cesium from 'cesium';
import { twoline2satrec } from 'satellite.js';
import { focusNowMs } from './focusDeemphasis.js';
import { getRenderGovernorDiagnostics, holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { DENSE_CREATE_CHUNK, DENSE_GROUP_PATH, DENSE_REFRESH_FRAMES, POINT_STYLES, POSITION_UPDATE_MS, RING_ROTATION_MS } from './satellitesConstants.js';
import { _updateOrbitPathRotations, parseTLE, propagatePosition } from './satellitesOrbit.js';
import { S, _scratchOnScreenBS, _trackedFrameCartesian } from './satellitesState.js';
import { _notifyRowControls, _updatePointFocus } from './satellitesStyle.js';
import { _applyPendingTrackingRestore, _clearTracking, _getTrackedFramePosition } from './satellitesTracking.js';

/**
 * Propagate all CORE satellite positions and update point primitives.
 * (~840 sats ≈ 1.6 ms/pass — fine at the 1s/200ms cadence.) Dense extras are
 * excluded: they refresh on the round-robin budget in _propagateDenseChunk.
 *
 * Piggybacks the on-screen visibility scan (horizon occluder + frustum cull,
 * same two-line pattern `flights.js`'s `_sweepAmbientEnrichment` uses) onto
 * this existing 1 Hz cadence rather than adding a new per-frame scan —
 * measured at ~0.3ms for 840 points, roughly doubling this pass's cost but
 * still cheap at 1 Hz. The result is cached in `_anyPointOnScreen` for
 * `_preRenderTick()`'s `syncSatellitesRenderHold()` to read every frame at
 * near-zero cost.
 */
function _propagateAll() {
  const now = new Date();
  let updated = 0;

  const camera = S._viewer?.camera;
  // No camera to test against (a render-free test seam) — fail toward
  // continuous rather than silently freezing a scene we can't evaluate.
  const occluder = camera ? horizonOccluder(camera) : null;
  const cull = camera
    ? camera.frustum.computeCullingVolume(camera.positionWC, camera.directionWC, camera.upWC)
    : null;
  let anyOnScreen = !camera;

  for (const [noradId, sat] of S._catalog) {
    if (sat.group === 'dense') continue;
    const pos = propagatePosition(sat.satrec, now);
    if (!pos) continue;

    const cartesian = Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, pos.altitude);
    const point = S._points.get(noradId);
    if (point) {
      point.position = cartesian;
      updated++;
      if (!anyOnScreen && point.show !== false && occluder?.isPointVisible(cartesian)) {
        Cesium.Cartesian3.clone(cartesian, _scratchOnScreenBS.center);
        if (cull.computeVisibility(_scratchOnScreenBS) !== Cesium.Intersect.OUTSIDE) {
          anyOnScreen = true;
        }
      }
    }
  }

  S._anyPointOnScreen = anyOnScreen;
  return updated;
}

/**
 * Re-propagate a small per-frame slice of the dense extras (round-robin).
 * Budget: the full dense set completes one pass every ~DENSE_REFRESH_FRAMES
 * frames (~5s at 60fps ≈ 1/5 of the core cadence), so per-frame cost stays
 * ~35 propagations (~0.1 ms) even with 10K+ Starlink sats — spreading the
 * work per frame avoids the once-per-second spike a tick-sized chunk
 * (~2K props ≈ 4ms) would cause.
 */
function _propagateDenseChunk() {
  if (S._denseIds.length === 0) return;
  const perFrame = Math.max(1, Math.ceil(S._denseIds.length / DENSE_REFRESH_FRAMES));
  const now = new Date();
  for (let i = 0; i < perFrame; i++) {
    if (S._denseCursor >= S._denseIds.length) S._denseCursor = 0;
    const noradId = S._denseIds[S._denseCursor++];
    if (noradId === S._trackedNorad) continue; // per-frame tracked path owns it
    const sat = S._catalog.get(noradId);
    const point = S._points.get(noradId);
    if (!sat || !point) continue;
    const pos = propagatePosition(sat.satrec, now);
    if (pos) {
      point.position = Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, pos.altitude);
    }
  }
}

/**
 * Load the dense catalog extras (Starlink) as points-only satellites.
 * Chunked so ~10K twoline2satrec builds + initial propagations never block a
 * frame; a token guards against mode flips / catalog rebuilds mid-load.
 */
export async function _loadDenseCatalog({ signal = null } = {}) {
  if (!S._viewer || !S._pointCollection) return { status: 'source-unavailable', reason: 'layer-unavailable' };
  S._denseLoadController?.abort();
  const resourceController = new AbortController();
  S._denseLoadController = resourceController;
  const loadSignal = signal
    ? AbortSignal.any([signal, resourceController.signal])
    : resourceController.signal;
  const token = ++S._denseLoadToken;
  S._denseStatus = 'loading';
  S._denseError = null;
  _notifyRowControls();
  try {
    loadSignal.throwIfAborted();
    const res = await fetch(`/api/celestrak/${DENSE_GROUP_PATH}`, { signal: loadSignal });
    if (!res.ok) {
      console.warn(`[Data:Satellites] Dense group '${DENSE_GROUP_PATH}' fetch failed (${res.status})`);
      _denseLoadFailed(token, `feed tidak tersedia (${res.status})`);
      return { status: 'source-unavailable', reason: `feed unavailable (${res.status})` };
    }
    const text = await res.text();
    loadSignal.throwIfAborted();
    if (token !== S._denseLoadToken || S._params.catalog !== 'dense') {
      return { status: 'superseded', reason: 'dense-load-superseded' };
    }

    const entries = parseTLE(text);
    const style = POINT_STYLES.dense;
    const now = new Date();
    let added = 0;

    for (let start = 0; start < entries.length; start += DENSE_CREATE_CHUNK) {
      loadSignal.throwIfAborted();
      if (token !== S._denseLoadToken || S._params.catalog !== 'dense' || !S._pointCollection) {
        return { status: 'superseded', reason: 'dense-load-superseded' };
      }
      const end = Math.min(start + DENSE_CREATE_CHUNK, entries.length);
      for (let i = start; i < end; i++) {
        const entry = entries[i];
        const satrec = twoline2satrec(entry.line1, entry.line2);
        if (!satrec || satrec.error !== 0) continue;
        const noradId = Number(satrec.satnum);
        if (S._catalog.has(noradId)) continue; // core catalog keeps priority
        const pos = propagatePosition(satrec, now);
        if (!pos) continue;

        S._catalog.set(noradId, { name: entry.name, satrec, group: 'dense' });
        const point = S._pointCollection.add({
          position: Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, pos.altitude),
          pixelSize: style.pixelSize,
          color: style.color,
          outlineColor: style.outlineColor,
          outlineWidth: style.outlineWidth,
          scaleByDistance: new Cesium.NearFarScalar(1e6, 1.5, 2e7, 0.6),
          id: noradId,
        });
        S._points.set(noradId, point);
        S._denseIds.push(noradId);
        added++;
      }
      // Yield to the event loop between chunks.
      await new Promise(resolve => setTimeout(resolve, 0));
      loadSignal.throwIfAborted();
    }

    // A 200 that yields nothing usable is still a failed load — an empty body,
    // an HTML error page the proxy passed through, or a feed of TLEs the core
    // catalog already owns. Treating it as success is the same lie as treating
    // a 502 as success, just through a different door.
    if (added === 0) {
      console.warn(`[Data:Satellites] Dense group '${DENSE_GROUP_PATH}' returned no usable satellites`);
      _denseLoadFailed(token, 'feed tidak mengembalikan satelit');
      return { status: 'source-unavailable', reason: 'feed returned no satellites' };
    }

    S._count = S._points.size;
    S._catalogRevision++;
    S._denseStatus = 'ready';
    console.log(`[Data:Satellites] Dense catalog: +${added} ${DENSE_GROUP_PATH} (points only)`);
    // The panel would otherwise keep the pre-load count and legend until the
    // next natural refresh — up to the 5-minute catalog interval.
    _notifyRowControls();
    _applyPendingTrackingRestore();
    return { status: 'ready', added };
  } catch (e) {
    if (loadSignal.aborted || e?.name === 'AbortError') {
      return { status: 'cancelled', reason: String(loadSignal.reason || 'aborted') };
    }
    console.warn('[Data:Satellites] Dense catalog load failed:', e);
    _denseLoadFailed(token, 'feed tidak terjangkau');
    return { status: 'source-unavailable', reason: 'feed unreachable' };
  } finally {
    if (S._denseLoadController === resourceController) S._denseLoadController = null;
  }
}

/**
 * Settle a failed dense load: drop any partial chunk, return the layer to the
 * core catalog, and leave the reason on the chip. Reverting the param is the
 * point — a chip that reads ACTIVE over an empty sky is a lie.
 * @param {number} token The load token that failed.
 * @param {string} reason Short operator-facing cause.
 */
function _denseLoadFailed(token, reason) {
  // A newer load (or a mode flip) already owns the state — say nothing.
  if (token !== S._denseLoadToken) return;
  S._params.catalog = 'core';
  _removeDenseCatalog();
  S._denseStatus = 'failed';
  S._denseError = reason;
  _notifyRowControls();
}

/** Remove all dense extras (catalog entries, points, tracking if needed). */
export function _removeDenseCatalog() {
  S._denseLoadController?.abort();
  S._denseLoadController = null;
  S._denseLoadToken++; // cancel any in-flight dense load
  if (S._trackedNorad !== null && S._catalog.get(S._trackedNorad)?.group === 'dense') {
    _clearTracking();
  }
  for (const noradId of S._denseIds) {
    const point = S._points.get(noradId);
    if (point && S._pointCollection) S._pointCollection.remove(point);
    S._points.delete(noradId);
    S._catalog.delete(noradId);
  }
  S._denseIds = [];
  S._denseCursor = 0;
  S._count = S._points.size;
  S._catalogRevision++;
}

/**
 * Shared scene.preRender tick (single definition for init + enable):
 * - core fleet propagation at 200ms-tracked / 1s-idle cadence,
 * - dense extras on a per-frame round-robin budget,
 * - tracked satellite's point primitive per frame (WS-D2),
 * - orbit ring GMST re-alignment every ~1s (WS-D1).
 */
export function _preRenderTick() {
  if (!S._enabled) return;
  const now = focusNowMs(Date.now());

  const interval = S._trackedNorad ? 200 : POSITION_UPDATE_MS;
  // Space Missions keeps this layer enabled for TLE lookup while deliberately
  // hiding its standalone fleet. Do not rebuild hidden point buffers on the
  // one-second propagation cadence: that GPU upload presented as a periodic
  // whole-globe pulse even though the camera remained stationary.
  if (S._params.showPoints && now - S._lastPropagation >= interval) {
    _propagateAll();
    S._lastPropagation = now;
  }

  if (S._params.showPoints) _propagateDenseChunk();

  // Keep the tracked dot on the per-frame epoch shared with label + camera —
  // runs after _propagateAll so the per-frame sample wins over the 200ms one.
  if (S._trackedNorad !== null) {
    const pos = _getTrackedFramePosition();
    const point = S._points.get(S._trackedNorad);
    if (pos && point) {
      point.position = _trackedFrameCartesian; // primitive setter clones
    }
  }

  _updatePointFocus(now);

  // Hidden standalone orbit primitives do not need GMST matrix writes while
  // Space Missions draws the selected mission orbit itself.
  if (S._params.showOrbits && now - S._lastRingRotation >= RING_ROTATION_MS) {
    _updateOrbitPathRotations(new Date(now));
    S._lastRingRotation = now;
  }

  syncSatellitesRenderHold();
}

/**
 * Whether Satellites genuinely has per-frame work right now. Orbital motion
 * is never "not moving" (unlike a parked traffic dot or an AIS billboard
 * between polls), so the gate here is "is anything moving **on screen**",
 * not "is anything moving" — always true. `anyPointOnScreen` is the cached
 * result of the horizon+frustum scan piggybacked onto `_propagateAll()`'s
 * existing 1 Hz cadence (see there); it defaults true — fail toward
 * continuous, never toward a silently-stale scene — until the first scan
 * completes.
 * @param {{showPoints?: boolean, anyPointOnScreen?: boolean}} [snapshot] Explicit state, for tests.
 * @returns {boolean}
 */
export function satellitesNeedContinuousRender({
  showPoints = S._params.showPoints,
  anyPointOnScreen = S._anyPointOnScreen,
} = {}) {
  return Boolean(showPoints) && Boolean(anyPointOnScreen);
}

/**
 * Idle-mode fallback for `_preRenderTick()`. `scene.preRender` only fires
 * when Cesium's own `shouldRender` check is true — camera motion, a pending
 * `requestRender()`, or an existing hold. Once this layer's own hold is
 * released and the camera parks, nothing forces a render, so `preRender`
 * (and the on-screen scan inside `_propagateAll()`) stops firing entirely —
 * an orbiting satellite drifting into frustum over a static camera would
 * never be noticed and this layer would never re-acquire its hold. This
 * wall-clock interval — independent of the render loop, like radio.js's
 * `_horizonTimer` solving the identical problem for its horizon scan —
 * re-runs the exact same tick on a cadence so the scan (and, in turn, the
 * hold) stays live even while idle. Skipped while continuous mode is
 * already forcing `preRender` every frame for any reason (this layer's own
 * hold, or another owner's, e.g. `main.js`'s tracked-entity hold) — running
 * it there too would just be redundant, throttle-absorbed work.
 * @returns {void}
 */
export function _watchdogTick() {
  if (!S._enabled) return;
  if (getRenderGovernorDiagnostics().mode === 'continuous') return;
  _preRenderTick();
}

/**
 * Take or drop the continuous-render hold to match current need. Idempotent
 * (the governor is identity-keyed). Called at the end of every
 * `_preRenderTick()` — whether driven by `scene.preRender` or by the
 * `_watchdogTick()` fallback above — not held for the layer's whole enabled
 * lifetime — see `satellitesNeedContinuousRender()`.
 *
 * Known, harmless overlap: while a specific satellite is tracked,
 * `main.js`'s independent `'tracked-entity'` hold already keeps the scene
 * continuous regardless of this hold's state — do not "fix" that overlap.
 * @returns {void}
 */
export function syncSatellitesRenderHold() {
  if (S._enabled && satellitesNeedContinuousRender()) holdContinuousRender('satellites');
  else releaseContinuousRender('satellites');
}
