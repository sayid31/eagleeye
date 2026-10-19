// Moved out of militaryFlights.js (militaryFlightsTracking).

import { tr3bTypeLabel } from './tr3bRegistry.js';
import { refreshTrackedReadout, trackedLabelModelFromText } from './trackedReadout.js';
import { clearTrackedSubjectContext, refreshTrackedSubjectContext } from './contextStore.js';
import { TRACKED_ICON_PX, aircraftIcon } from './aircraftIcons.js';
import { clearFocusTarget } from './focusDeemphasis.js';
import * as Cesium from 'cesium';
import { CLASS_SCALE_2D } from './aircraftClass.js';
import { screenProjectedRotation, stabilizeScreenRotation } from './iconOrientation.js';
import { applyTrackedCameraFrame } from './trackedCamera.js';
import { _formatAltitude, _toCleanText } from './militaryFlightsApi.js';
import { _contextSubjectMetadata, _emitAwarenessEvent, _publishTrackedSelection } from './militaryFlightsCockpit.js';
import { AMBER_TRANSPARENT, BILLBOARD_SCALE, TRACKED_ICON_COLOR } from './militaryFlightsConstants.js';
import { _resetTrackedDisplay, _trackedDisplayCached, _trackedDisplayCourse, _trackedDisplayPosition, _trackedVisualCached } from './militaryFlightsDisplay.js';
import { _releaseModel } from './militaryFlightsFleetModels.js';
import { _applyFleetBillboardPresentation, _iconKind, _modelOwnsVisual, _presentation } from './militaryFlightsInstances.js';
import { S } from './militaryFlightsState.js';
import { _releaseTrackedModel, _resetTrackedSelectionState } from './militaryFlightsTrackedModel.js';
import { _clearTrail, _startTrail } from './militaryFlightsTrail.js';

/**
 * Build the multi-line presentation text for the protected tracked host card.
 * Lines: callsign, type/registration, operator/altitude.
 * While the plane is in its missed-poll grace (coasting on dead reckoning
 * with sticky metadata) the first line carries a "· STALE" cue — the fleet's
 * 45%-alpha billboard fade doesn't apply to the tracked plane (its entity
 * owns the visual), so without this the readout would present last-known
 * altitude/speed as live.
 * @param {Object|null} info - Flight metadata from _flightData
 * @param {string} icao24 - ICAO hex identifier (fallback display name)
 * @returns {string} Newline-separated label text
 */
function _buildTrackedLabel(info, icao24) {
  const stale = (S._missingPolls.get(icao24) || S._backoff) ? ' · USANG' : '';
  const callsign = (_toCleanText(info?.callsign) || _toCleanText(info?.registration) || icao24) + stale;
  // Converted contacts report their class as TR-3B — that override is exactly
  // what the Easter egg replaces the real type with.
  const type = tr3bTypeLabel(icao24, _toCleanText(info?.type) || 'Tipe tidak diketahui');
  const registration = _toCleanText(info?.registration) || 'Reg tidak diketahui';
  const operator = _toCleanText(info?.operator) || 'Operator tidak diketahui';
  const altitude = _formatAltitude(info?.altitudeFt);
  const speedKt = info?.speedMps ? Math.round(info.speedMps * 1.944) : null;
  const tail = speedKt ? `${altitude} · ${speedKt} kt` : altitude;
  return [
    callsign,
    `${type} · ${registration}`,
    `${operator} · ${tail}`,
  ].join('\n');
}

/** Write the explicit tracked presentation model and refresh its host entry. */
export function _updateTrackedLabelModel(icao24) {
  if (!S._trackedEntity || icao24 !== S._trackedIcao) return;
  S._trackedEntity.gevLabelModel = trackedLabelModelFromText(
    _buildTrackedLabel(S._flightData.get(icao24), icao24),
    '#ffd166',
  );
  refreshTrackedReadout(S._trackedEntity);
  // The readout and the context slot describe the same contact — refresh them
  // together so voice never narrates a fix the card has already replaced.
  refreshTrackedSubjectContext(_contextSubjectMetadata(icao24));
}

/** Re-image the tracked entity's billboard from the current class/conversion. */
export function _syncTrackedBillboardImage() {
  if (!S._trackedIcao || !S._trackedEntity?.billboard) return;
  S._trackedEntity.billboard.image = aircraftIcon(
    _iconKind(S._trackedIcao, S._flightData.get(S._trackedIcao)?.klass),
    TRACKED_ICON_PX,
  );
}

/**
 * Re-render one contact after its TR-3B conversion (or the active IR style)
 * changed — delegates to the shared engine. See aircraftPresentation.js's
 * `refreshTr3bContact` for the full rationale.
 * @param {string} icao24 - ICAO 24-bit address.
 * @returns {boolean} True when the layer owns this contact.
 */
export function _refreshTr3bContact(icao24) {
  return _presentation.refreshTr3bContact(icao24);
}

/** Re-image every converted contact this layer owns (IR style flip) —
 *  delegates to the shared engine. */
export function _refreshTr3bForStyle() {
  _presentation.refreshTr3bForStyle();
}

/**
 * Stop tracking the current aircraft and clean up all tracking state.
 * Restores the original billboard, removes the tracked Entity, invalidates
 * the per-frame DR cache, and RELEASES the camera IN PLACE — no flyTo
 * (mirror of flights.js). Deselect used to fly an ~80 km pulled-back
 * overview; the owner field-ruled that wrong (2026-07-02: "it randomly zooms
 * way up and loses my context"). The camera stays at its current
 * position/orientation, immediately free to orbit/zoom. Applies to every
 * deselect path: click-empty-space, Escape, aged-out plane, layer disable,
 * and voice stopTracking.
 *
 * @param {boolean} [skipViewerUntrack=false] - ANOTHER layer just grabbed the
 *   follow-camera: tear down our own state but leave viewer.trackedEntity
 *   alone (the new owner controls it).
 * @param {object} [options] - Clear origin.
 * @param {boolean} [options.evicted=false] - The contact aged out of the feed
 *   rather than being deselected. Consumers that keep a readout on screen
 *   (the Cockpit Contact panel) hold last-known values for an eviction and
 *   only tear down on a deliberate clear.
 */
export function _clearTracking(skipViewerUntrack = false, {
  evicted = false,
  origin = 'programmatic',
} = {}) {
  S._trackedCameraFrameStop?.();
  S._trackedCameraFrameStop = null;
  if (!S._trackedIcao) {
    clearFocusTarget('militaryFlights');
    return;
  }
  const clearedIcao = S._trackedIcao;
  clearFocusTarget('militaryFlights', clearedIcao);

  // Restore the original billboard appearance. The rotation is re-seeded from
  // the tracked entity's last rendered rotation and a rotation pass is forced
  // (_lastCamPoseSig below): the fleet billboard otherwise reappears with the
  // STALE screen rotation it had when tracking began — up to a full
  // ROTATION_REFRESH_MS of a wrong (possibly reversed) nose on release.
  if (S._billboards.has(S._trackedIcao)) {
    const bb = S._billboards.get(S._trackedIcao);
    bb.show = true;
    bb.width = 20;
    bb.height = 20;
    const restoreRotation = S._lastTrackedRotation;
    // Ground-aware restore (a plane untracked while taxiing comes back at
    // ground scale; tint is full amber on the ground and in the air) —
    // delegates to the shared presentation engine (mirror of flights.js).
    _applyFleetBillboardPresentation(S._trackedIcao, bb);
    bb.rotation = restoreRotation;
  }
  S._lastCamPoseSig = ''; // force a fleet rotation pass on the next tick

  // Stop tracking and remove the entity. skipViewerUntrack: another layer just grabbed the
  // follow-camera, so tear down our state but DON'T clear viewer.trackedEntity (they own it now).
  // Releasing trackedEntity does NOT move the camera: Cesium resets the lookAt transform in
  // place, so the view stays where the follow left it and the user can immediately orbit/zoom.
  if (S._viewer && !skipViewerUntrack) {
    S._viewer.trackedEntity = undefined;
  }
  if (S._trackedEntity) {
    S._viewer.entities.remove(S._trackedEntity);
    S._trackedEntity = null;
  }
  _releaseTrackedModel();
  _resetTrackedSelectionState(); // the zoom band + load-failure budget belong to the selection we just dropped
  S._trackedIcao = null;
  _applyFleetBillboardPresentation(clearedIcao, S._billboards.get(clearedIcao));
  clearTrackedSubjectContext('military');
  _emitAwarenessEvent('gev:awareness-subject-cleared', {
    layerId: 'military',
    id: clearedIcao,
    origin,
    reason: evicted ? 'evicted' : 'deliberate',
  });
  // Invalidate the per-frame DR cache so a same-frame re-track cannot read
  // the previous aircraft's cached position.
  _resetTrackedDisplay();
  _clearTrail();
}

export function _applyPendingTrackingRestore() {
  const pending = S._pendingTrackingRestore;
  if (!pending || pending.generation !== S._trackingIntentGeneration) return false;
  if (!S._billboardCollection?.show || !S._billboards.has(pending.id)) return false;
  S._pendingTrackingRestore = null;
  _trackFlight(pending.id, { origin: pending.origin });
  return true;
}

export function _cancelPendingTrackingRestore() {
  S._trackingIntentGeneration += 1;
  S._pendingTrackingRestore = null;
}

/**
 * Begin tracking a specific aircraft. Clears any previous tracking, hides the
 * billboard, creates a new Entity with dead-reckoning CallbackProperties for
 * smooth continuous motion, and sets the viewer's trackedEntity so the camera
 * follows.
 * @param {string} icao24 - ICAO hex identifier of the aircraft to track
 */
export function _trackFlight(icao24, { origin = 'programmatic' } = {}) {
  _clearTracking(false, { origin }); // switching planes — the new follow-camera takes over

  const bb = S._billboards.get(icao24);
  const info = S._flightData.get(icao24);
  if (!bb || !info) return;

  S._trackedIcao = icao24;
  _resetTrackedSelectionState(); // fresh selection: enter at the ENTER ceiling, full load-retry budget
  S._cachedDRFrame = -1;
  S._lastTrackedRotation = bb.rotation || 0;
  // Drop any fleet 3D model for this aircraft — the tracked entity now owns its visual (its
  // own billboard + model graphic), and the fleet tick skips the tracked icao, so a leftover
  // fleet model would be orphaned + double-rendered.
  _releaseModel(icao24);

  // Hide the billboard -- the tracked entity replaces it visually
  bb.show = false;

  // Helper: smoothed, per-frame-cached tracked position (see _trackedDisplayPosition —
  // one computation shared by the position/rotation/trail-head callbacks, with
  // discontinuity reconciliation). Falls back to the last billboard position when the
  // aircraft has no fix.
  const getTrackedPosition = () => _trackedDisplayPosition(icao24) || bb.position;

  // Dead-reckoning position property evaluated every render frame.
  // isConstant = false so CesiumJS re-evaluates each frame.
  const positionProperty = new Cesium.CallbackProperty(() => {
    return getTrackedPosition();
  }, false);

  // World-space orientation for the 3D model: nose along the course heading (ENU, pitch/roll 0).
  // Create tracked entity: a 2D billboard when zoomed out, a 3D model when zoomed in past the
  // TRACKED altitude ceiling. That handoff is DEFAULT behaviour — it does NOT wait on the
  // DISPLAY-rail 3D toggle, which arms the FLEET. The plane the user zooms into always
  // resolves into an aircraft.
  //
  // The billboard stays SHOWN at all times and is hidden by going TRANSPARENT (alpha 0), not by
  // show=false. This is deliberate: viewer.trackedEntity derives the follow-camera framing from
  // the entity's bounding sphere, and a 3D model graphic reports a PENDING sphere until its glTF
  // finishes loading. If we hid the billboard outright, tracking a plane while already zoomed in
  // would stall the centering until the model loaded. A shown-but-transparent billboard always
  // supplies a ready sphere, so framing is instant; we only drop its alpha once the model GLB is
  // preloaded (_planeModelLoaded), so there's neither a billboard+model double-image nor a gap.
  // The tracked entity is a PURE BILLBOARD — no label or model graphic. The tracked plane's 3D
  // model is the standalone primitive driven by _updateTrackedModel(); keeping it off the entity is
  // what makes the follow-camera's bounding sphere always ready (see _trackedModel).
  S._trackedEntity = S._viewer.entities.add({
    position: positionProperty,
    // Keep Cesium's EntityView in the same ENU frame as the close-range
    // camera guard; AUTO may otherwise alternate with a velocity frame.
    trackingReferenceFrame: Cesium.TrackingReferenceFrame.ENU,
    billboard: {
      image: aircraftIcon(_iconKind(S._trackedIcao, S._flightData.get(S._trackedIcao)?.klass), TRACKED_ICON_PX),
      width: 28,
      height: 28,
      scale: BILLBOARD_SCALE * (CLASS_SCALE_2D[S._flightData.get(S._trackedIcao)?.klass] || 1),
      // Solid amber when the billboard is the visual (zoomed out, 3D off, or model still loading);
      // transparent once the STANDALONE tracked model is actually up (ready + shown).
      color: new Cesium.CallbackProperty(() => (
        _modelOwnsVisual(S._trackedIcao) ? AMBER_TRANSPARENT : TRACKED_ICON_COLOR
      ), false),
      sizeInMeters: false,
      scaleByDistance: new Cesium.NearFarScalar(1000, 3.0, 8000000, 0.5),
      alignedAxis: Cesium.Cartesian3.ZERO,
      // The tracked target must never vanish into tile geometry — tracking a
      // taxiing plane at street level would otherwise bury the amber icon inside
      // the runway skin exactly like the fleet ground icons (_groundDepthDistance);
      // its shared-host tracked card is top-composited separately.
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      // Screen-projected rotation, evaluated per frame: exact in tracked-orbit
      // mode where camera.heading lives in the entity's reference frame.
      rotation: new Cesium.CallbackProperty(() => {
        const tracked = S._flightData.get(S._trackedIcao);
        const pos = getTrackedPosition();
        if (!tracked || !pos || !S._viewer) return S._lastTrackedRotation;
        const projected = screenProjectedRotation(
          S._viewer.scene,
          pos,
          _trackedDisplayCourse(),
          S._lastTrackedRotation,
        );
        const rot = stabilizeScreenRotation(S._lastTrackedRotation, projected);
        if (rot !== null) S._lastTrackedRotation = rot;
        return S._lastTrackedRotation;
      }, false),
    },
  });
  S._trackedEntity.gevSelectionOrigin = origin;
  S._trackedEntity.gevTrackedId = `military:${icao24}`;
  S._trackedEntity.gevLabelModel = trackedLabelModelFromText(
    _buildTrackedLabel(info, icao24),
    '#ffd166',
  );

  // A billboard has a ~zero bounding sphere, so Cesium's default follow distance is
  // far too tight (the user had to scroll out to read the plane). Give the entity a
  // calibrated viewFrom — behind + above, distance scaled to altitude — for a readable
  // initial frame with surrounding context. (ENU: east=+X, north=+Y, up=+Z.)
  const altM = info?.altitudeFt ? info.altitudeFt * 0.3048 : 1500;
  const followRange = Math.min(Math.max(altM * 1.1 + 2500, 3000), 30000);
  S._trackedEntity.viewFrom = new Cesium.Cartesian3(0, -followRange * 0.8, followRange * 0.55);

  // Cancel any in-progress camera flight first — otherwise Cesium won't apply the tracked
  // entity's viewFrom on the first frame, so voice-initiated tracking (which often fires
  // mid-fly_to_location) would follow the plane WITHOUT centering it like a click does.
  // Cross-module HUD consumers (tracked-target readout) read the camera's settled position, not a
  // postRender recompute, so the label doesn't jitter against the now-stable plane (mirror of flights).
  S._trackedEntity.gevDisplayPosition = _trackedDisplayCached;
  // Separate accessor on purpose (mirror of flights.js): `gevDisplayPosition` keeps the
  // follow-camera anti-jitter contract; presentation that must weld to the aircraft you
  // can see reads `gevVisualPosition`.
  S._trackedEntity.gevVisualPosition = _trackedVisualCached;
  refreshTrackedReadout(S._trackedEntity);
  S._viewer.camera.cancelFlight();
  // Camera follows the tracked entity
  S._viewer.trackedEntity = S._trackedEntity;
  S._trackedCameraFrameStop = applyTrackedCameraFrame(
    S._viewer,
    S._trackedEntity,
    S._trackedEntity.viewFrom,
  ) || null;

  // Track-history trail (PRD F2): seed from local history + async backfill.
  // Ground traffic draws NO trail — if the plane takes off while tracked, the
  // ground→air transition in update() starts one.
  // Round 2 (owner): grounded contacts get trails too — a landed-but-taxiing
  // aircraft's history is retrievable on select. Trail positions are floored
  // at the surface (_trailFloorPosition), so ground legs drape, never dive.
  _startTrail(icao24);

  const callsign = _toCleanText(info.callsign) || _toCleanText(info.registration) || icao24;
  _publishTrackedSelection(icao24, origin);
  console.log(`[Data:Military] Tracking ${callsign} (${icao24})`);
}
