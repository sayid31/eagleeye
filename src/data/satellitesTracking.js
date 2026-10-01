// Moved out of satellites.js (satellitesTracking).

import { clearFocusTarget, publishFocusTargetFromCachedPosition } from './focusDeemphasis.js';
import { clearTrackedSubjectContext, getContextStore, refreshTrackedSubjectContext, selectTrackedSubjectContext } from './contextStore.js';
import * as Cesium from 'cesium';
import { satelliteClassLabel } from './satelliteClass.js';
import { refreshTrackedReadout } from './trackedReadout.js';
import { CONTEXT_REFRESH_INTERVAL_MS, HIGH_ORBIT_ALTITUDE_M, ISS_NORAD, TRACK_VIEW_FROM_HIGH_SCALE, TRACK_VIEW_FROM_LEO } from './satellitesConstants.js';
import { _dockedCompanionNames, _refreshDockedCompanions, _syncIssOverlay } from './satellitesIss.js';
import { _hideOrbitPath, _showOrbitPath, propagatePosition } from './satellitesOrbit.js';
import { S, _trackedFrameCartesian } from './satellitesState.js';
import { _pointStyleFor } from './satellitesStyle.js';

export function _normalizeTrackedNorad(candidate) {
  const numeric = Number(candidate);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.trunc(numeric);
  return rounded > 0 ? rounded : null;
}

function _emitAwarenessEvent(type, detail) {
  if (typeof window === 'undefined' || !window.dispatchEvent || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export function _applyPendingTrackingRestore() {
  const pending = S._pendingTrackingRestore;
  if (!pending || pending.generation !== S._trackingIntentGeneration || !S._enabled) return false;
  if (!S._viewer || !S._catalog.has(pending.id) || !S._points.has(pending.id)) return false;
  S._pendingTrackingRestore = null;
  _trackSatellite(pending.id, { origin: pending.origin });
  return S._trackedNorad === pending.id;
}

export function _cancelPendingTrackingRestore() {
  S._trackingIntentGeneration += 1;
  S._pendingTrackingRestore = null;
}

/**
 * Stop tracking the currently followed satellite.
 * @param {boolean} [skipViewerUntrack=false] - When ANOTHER layer just grabbed
 *   the follow-camera (viewer.trackedEntityChanged), tear down our own state
 *   but do NOT clear viewer.trackedEntity — the new owner controls it now,
 *   and clearing it would yank the camera off their target (mirror of flights).
 */
export function _clearTracking(skipViewerUntrack = false, { origin = 'programmatic' } = {}) {
  // Untracking dissolves the cluster: every companion returns to its own
  // ambient label on the next collection.
  S._dockedCompanions = new Set();
  S._lastDockedScanMs = Number.NEGATIVE_INFINITY;
  if (!S._trackedNorad) {
    clearFocusTarget('satellites');
    _syncIssOverlay();
    return;
  }
  const clearedNorad = S._trackedNorad;
  clearFocusTarget('satellites', S._trackedNorad);

  const lastPos = S._points.get(S._trackedNorad);

  // Re-show the primitive (hidden while the tracked entity rendered the dot)
  // and restore the original group palette from the shared style table (WS-D3)
  if (lastPos) {
    const style = _pointStyleFor(S._trackedNorad, S._catalog.get(S._trackedNorad)?.group);
    lastPos.show = true;
    lastPos.pixelSize = style.pixelSize;
    lastPos.color = style.color;
    lastPos.outlineColor = style.outlineColor;
    lastPos.outlineWidth = style.outlineWidth;
    lastPos.disableDepthTestDistance = 0;
  }

  // Invalidate the per-frame tracked-position cache (WS-D2)
  S._trackedFrameNumber = -1;
  S._trackedFrameGeo = null;

  // Remove tracked entity and orbit path (unless ISS — keep its path)
  if (S._trackedNorad !== ISS_NORAD) {
    _hideOrbitPath(S._trackedNorad);
  }
  if (S._viewer && !skipViewerUntrack) S._viewer.trackedEntity = undefined;
  if (S._trackedEntity) {
    S._viewer.entities.remove(S._trackedEntity);
    S._trackedEntity = null;
  }
  S._trackedNorad = null;
  _syncIssOverlay();
  clearTrackedSubjectContext('satellites');
  S._contextRefreshedAtMs = 0;
  _emitAwarenessEvent('gev:awareness-subject-cleared', {
    layerId: 'satellites', id: clearedNorad, origin,
  });
}

/**
 * Get the tracked satellite's geodetic position, propagated at most once per
 * rendered frame (WS-D2). All tracked-satellite consumers (entity position
 * callback → camera, host model, point primitive, getTrackedInfo) share this
 * single `new Date()` epoch per frame, so they can never diverge by the old
 * 200ms throttle. The matching ECEF position is left in
 * `_trackedFrameCartesian`. SGP4 for one satellite per frame is cheap.
 * @returns {{ longitude: number, latitude: number, altitude: number }|null}
 */
export function _getTrackedFramePosition() {
  if (S._trackedNorad === null) return null;
  const sat = S._catalog.get(S._trackedNorad);
  if (!sat) return null;

  const frameNumber = S._viewer?.scene?.frameState?.frameNumber ?? -1;
  if (frameNumber === -1 || frameNumber !== S._trackedFrameNumber || S._trackedFrameGeo === null) {
    const pos = propagatePosition(
      sat.satrec,
      S._trackedFrameNowForTest ? new Date(S._trackedFrameNowForTest()) : new Date(),
    );
    if (!pos) return S._trackedFrameGeo; // propagation hiccup — keep last good sample
    S._trackedFrameGeo = pos;
    Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, pos.altitude, undefined, _trackedFrameCartesian);
    S._trackedFrameNumber = frameNumber;
    // Throttled inside; membership changes are rare, so resync the ISS ambient
    // gate only when the cluster actually changed.
    const clusterChanged = _refreshDockedCompanions(
      S._trackedFrameNowForTest ? S._trackedFrameNowForTest() : Date.now(),
    );
    _updateTrackedSatelliteLabelModel();
    // The card and the context slot describe the same satellite — keep them
    // together so voice never narrates a fix the card has already replaced.
    _refreshTrackedSubjectContext();
    if (clusterChanged) _syncIssOverlay();
    const name = sat.name?.trim() || `SAT-${S._trackedNorad}`;
    const altitudeText = `${Math.round(pos.altitude / 1000)} km · NORAD ${S._trackedNorad}`;
    const labelWidthPx = Math.max(name.length, altitudeText.length) * 7.8 + 20;
    const labelHeightPx = 2 * 13 + 12;
    const trackedPointDiameterPx = 14 + 4; // point plus its 2 px outline on both sides
    // Exact SGP4 frame cache only: dot, host readout, camera, and focus rectangle all
    // share one epoch, avoiding a second propagation phase and its old jitter.
    publishFocusTargetFromCachedPosition({
      ownerLayer: 'satellites',
      id: S._trackedNorad,
      scene: S._viewer?.scene,
      camera: S._viewer?.camera,
      displayPosition: _trackedFrameCartesian,
      widthPx: Math.max(trackedPointDiameterPx, Math.min(260, labelWidthPx)),
      // Union of the 14 px point and the two-line label shifted 18 px upward.
      heightPx: trackedPointDiameterPx + 18 + labelHeightPx,
    });
  }
  return S._trackedFrameGeo;
}

/** Cached ECEF display point only; never propagates a fresh SGP4 sample. */
export function _trackedDisplayCached() {
  return S._trackedFrameGeo ? _trackedFrameCartesian : null;
}

/**
 * Describe the tracked satellite for the shared context slot the voice tools
 * read. Values come from the live per-frame propagation, not a selection-time
 * snapshot, so a long follow never narrates a position the satellite has left.
 * @param {number} noradId Catalog identity.
 * @param {{latitude: number, longitude: number, altitude: number}|null} [position]
 *   Explicit position; defaults to the current per-frame propagation.
 * @returns {object|null} Context metadata, or null when the satellite is gone.
 */
function _contextSubjectMetadata(noradId, position = null) {
  const sat = S._catalog.get(noradId);
  if (!sat) return null;
  const pos = position || _getTrackedFramePosition();
  if (!pos) return null;
  const name = sat.name?.trim() || `SAT-${noradId}`;
  const altitudeKm = Number.isFinite(pos.altitude) ? Math.round(pos.altitude / 1000) : null;
  return {
    id: String(noradId),
    layerId: 'satellites',
    layerName: 'Satellites',
    source: 'CelesTrak',
    label: name,
    latitude: pos.latitude,
    longitude: pos.longitude,
    // Flat text only: the voice payload compacts properties through a string
    // cleaner that drops nested objects.
    properties: {
      name,
      operator: '',
      noradId: String(noradId),
      class: satelliteClassLabel(sat.group, { isIss: noradId === ISS_NORAD }),
      altitude: altitudeKm === null ? '' : `${altitudeKm.toLocaleString('en-US')} km`,
    },
  };
}

/**
 * Reconcile the published subject with a freshly rebuilt catalog.
 *
 * A rebuild (dense↔core toggle, TLE refresh) clears and repopulates the
 * catalog, so the tracked satellite's entry is a NEW object with a new satrec.
 * A surviving subject is simply re-resolved against it. A subject that is GONE
 * must release the slot: the per-frame refresh cannot do this itself, because
 * `_getTrackedFramePosition` returns early once the satellite has no catalog
 * entry — so without this the record would linger and voice would narrate a
 * satellite the catalog no longer carries, frozen at its last position.
 *
 * Releasing is gated on PROOF. The subject is preserved unless it is absent
 * from a catalog that is both complete (`accepted`, no failed CelesTrak group)
 * and applicable (dense settled, when dense is the requested catalog). A
 * partial refresh, a failed dense load, or an empty catalog is unproven
 * absence, and unproven absence is not absence — the same honesty rule the
 * tracking-restore path already applies.
 * @returns {Promise<void>} Resolves once the applicable catalog has settled.
 */
export async function _reconcileTrackedSubjectContext() {
  const subjectAtStart = S._trackedNorad;
  if (subjectAtStart === null) return;
  // Dense extras land AFTER the core rebuild resolves. Deciding before they
  // settle called a dense subject missing and deleted its record; the record
  // then stayed gone, because a refresh can update an existing record but
  // cannot recreate one.
  const denseSettlement = S._params.catalog === 'dense' ? S._denseLoadPromise : null;
  if (denseSettlement) {
    try {
      await denseSettlement;
    } catch {
      // A failed dense load proves nothing about the subject; fall through and
      // let the outcome check below preserve it.
    }
  }
  // The operator may have moved on while we waited.
  if (S._trackedNorad !== subjectAtStart) return;

  const metadata = _contextSubjectMetadata(subjectAtStart);
  if (metadata) {
    const store = getContextStore();
    const key = String(subjectAtStart);
    if (store.entities.has(key)) {
      refreshTrackedSubjectContext(metadata);
    } else if (!store.selectedEntityId) {
      // The record was dropped while the subject was briefly unresolvable.
      // Restore it — but only into an EMPTY slot: a satellite reappearing must
      // never yank the subject away from something the operator selected since.
      selectTrackedSubjectContext(metadata);
    }
    S._contextRefreshedAtMs = Date.now();
    return;
  }

  // Absence only counts when EVERY catalog that could carry the subject
  // actually loaded. Unproven absence is not absence — the same honesty rule
  // the tracking-restore path applies.
  //
  // Deliberately NOT scoped to the group the subject was last seen in:
  // CelesTrak reclassifies satellites between groups, so a subject missing
  // from its old group may simply have moved to one that failed this refresh.
  // Believing the old group alone would drop it. Any failed or empty group is
  // therefore a reason to wait — and `accepted` already means every group
  // returned entries.
  if (S._catalog.size === 0) return;
  if (S._lastTrackingRefreshOutcome?.status !== 'accepted') return;
  // Dense is a potential carrier too whenever it was REQUESTED — and the
  // request is read from `denseSettlement`, captured before the await, not
  // from `_params.catalog` now. A failed dense load reverts the mode to 'core'
  // as part of settling (an ACTIVE chip over an empty sky would be a lie), so
  // by the time we get here the intent that made dense a carrier has been
  // erased. Re-reading it would skip this guard on exactly the runs that need
  // it and delete a subject the dense catalog might have carried.
  if (denseSettlement && S._denseStatus !== 'ready') return;
  clearTrackedSubjectContext('satellites');
  S._contextRefreshedAtMs = 0;
}

/**
 * Keep the shared context slot current with the tracked satellite, on the
 * propagation beat rather than the frame clock.
 * @returns {void}
 */
function _refreshTrackedSubjectContext() {
  if (S._trackedNorad === null) return;
  const now = Date.now();
  if (now - S._contextRefreshedAtMs < CONTEXT_REFRESH_INTERVAL_MS) return;
  S._contextRefreshedAtMs = now;
  refreshTrackedSubjectContext(_contextSubjectMetadata(S._trackedNorad));
}

function _updateTrackedSatelliteLabelModel(fallbackAltitudeM = null) {
  if (!S._trackedEntity || S._trackedNorad === null) return;
  const sat = S._catalog.get(S._trackedNorad);
  const title = sat?.name?.trim() || `SAT-${S._trackedNorad}`;
  const altitudeM = S._trackedFrameGeo?.altitude ?? fallbackAltitudeM;
  const detail = `${Number.isFinite(altitudeM) ? Math.round(altitudeM / 1000) : '?'} km · NORAD ${S._trackedNorad}`;
  // Class leads the detail block: it is what tells the operator WHAT they are
  // looking at, and it stays readable under the IR styles that flatten the
  // dot colors to a single channel (the card is painted above post-FX).
  const details = [satelliteClassLabel(sat?.group, { isIss: S._trackedNorad === ISS_NORAD }), detail];
  // Docked companions are consolidated onto the tracked card as SECONDARY info
  // instead of competing with it as separate ambient labels. Identities are
  // preserved: the catalog is untouched and every companion returns to its own
  // label the moment the cluster is no longer tracked.
  const companions = _dockedCompanionNames();
  if (companions.length > 0) {
    const extra = companions.length - 1;
    details.push(`DOCKED · ${companions[0]}${extra > 0 ? ` · +${extra}` : ''}`);
  }
  const current = S._trackedEntity.gevLabelModel;
  // Compare the WHOLE detail array: comparing only `details[0]` swallowed any
  // change confined to the companions line, so the card would never republish.
  const unchanged = current?.title === title
    && current?.details?.length === details.length
    && details.every((line, index) => current.details[index] === line);
  if (unchanged) return;
  S._trackedEntity.gevLabelModel = { title, details, accent: '#ffd84d' };
  refreshTrackedReadout(S._trackedEntity);
}

export function _trackSatellite(noradId, { origin = 'programmatic' } = {}) {
  _clearTracking(false, { origin });

  const point = S._points.get(noradId);
  const sat = S._catalog.get(noradId);
  if (!point || !sat) return;

  S._trackedNorad = noradId;
  S._trackedFrameNumber = -1;
  S._trackedFrameGeo = null;
  _syncIssOverlay();

  // Hide the primitive — the tracked ENTITY renders the dot below. The
  // entity must own a point graphic so the Viewer's tracking camera can
  // resolve a bounding sphere and engage viewFrom (a label-only entity
  // left the camera stranded; this mirrors the proven flights pattern).
  point.show = false;

  // Show orbital path
  _showOrbitPath(noradId, Cesium.Color.YELLOW);

  // Tracked entity position propagates per evaluation through the per-frame
  // cache (WS-D2) — dot, host readout, and camera share one SGP4 epoch per frame.
  // Falls back to the point primitive's 1s-throttled position if SGP4 fails.
  const positionProperty = new Cesium.CallbackProperty(() => {
    const pos = _getTrackedFramePosition();
    return pos ? _trackedFrameCartesian : point.position;
  }, false);

  const name = sat.name.trim();

  // Comfortable tracking landing: ~726 km back for LEO (user-validated
  // "slightly zoomed out" framing — no stutter, label reads cleanly), scaled
  // up for MEO/GEO so the camera doesn't land on top of a high-orbit dot.
  const initialPos = propagatePosition(sat.satrec, new Date());
  const viewScale = initialPos && initialPos.altitude > HIGH_ORBIT_ALTITUDE_M
    ? TRACK_VIEW_FROM_HIGH_SCALE
    : 1;
  const viewFrom = Cesium.Cartesian3.multiplyByScalar(
    TRACK_VIEW_FROM_LEO, viewScale, new Cesium.Cartesian3()
  );

  S._trackedEntity = S._viewer.entities.add({
    position: positionProperty,
    viewFrom,
    point: {
      pixelSize: 14,
      color: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  S._trackedEntity.gevSelectionOrigin = origin;
  S._trackedEntity.gevTrackedId = `satellites:${noradId}`;
  S._trackedEntity.gevDisplayPosition = _trackedDisplayCached;
  _updateTrackedSatelliteLabelModel(initialPos?.altitude ?? null);

  _emitAwarenessEvent('gev:awareness-subject-selected', {
    layerId: 'satellites',
    id: noradId,
    label: name,
    position: Cesium.Cartesian3.clone(point.position),
    origin,
  });
  selectTrackedSubjectContext(_contextSubjectMetadata(noradId, initialPos));
  S._contextRefreshedAtMs = Date.now();

  S._viewer.trackedEntity = S._trackedEntity;
  console.log(`[Data:Satellites] Tracking ${name} (NORAD ${noradId})`);
}
