// Moved out of flights.js (flightsTracking).

import { clearFocusTarget } from './focusDeemphasis.js';
import { clearTrackedSubjectContext, refreshTrackedSubjectContext } from './contextStore.js';
import { isMilitaryIcao, isMilitaryLayerActive } from './militaryRegistry.js';
import { isTr3b, tr3bTypeLabel } from './tr3bRegistry.js';
import { refreshTrackedReadout, trackedLabelModelFromText } from './trackedReadout.js';
import { TRACKED_ICON_PX, aircraftIcon } from './aircraftIcons.js';
import * as Cesium from 'cesium';
import { CLASS_SCALE_2D } from './aircraftClass.js';
import { screenProjectedRotation, stabilizeScreenRotation } from './iconOrientation.js';
import { applyTrackedCameraFrame } from './trackedCamera.js';
import flightsLayer from './flights.js';
import { _contactLabel, _routeIsPlausible } from './flightsApi.js';
import { _contextSubjectMetadata, _emitAwarenessEvent, _publishTrackedSelection } from './flightsCockpit.js';
import { CYAN_TRANSPARENT, _groundSnap } from './flightsConstants.js';
import { _resetTrackedDisplay, _trackedDisplayCached, _trackedDisplayCourse, _trackedDisplayPosition, _trackedVisualCached } from './flightsDisplay.js';
import { _fleetBillboardColor, _fleetBillboardScale, _releaseModel } from './flightsFleetModels.js';
import { _applyFleetBillboardPresentation, _iconKind, _modelOwnsVisual, _presentation, _requestRouteEnrichment, _requestTypeEnrichment } from './flightsInstances.js';
import { S, _displayCourse } from './flightsState.js';
import { _releaseTrackedModel, _resetTrackedSelectionState } from './flightsTrackedModel.js';
import { _clearTrail, _startTrail } from './flightsTrail.js';

/**
 * Stop tracking the currently followed aircraft.
 *
 * Restores the hidden billboard, removes the tracked Entity, resets lerp
 * state, and RELEASES the camera IN PLACE — no flyTo. Deselect used to fly
 * an ~80 km pulled-back overview; the owner field-ruled that wrong
 * (2026-07-02: "it randomly zooms way up and loses my context"). The camera
 * now simply stays at its current position/orientation, immediately free to
 * orbit/zoom. Applies to every deselect path: click-empty-space, Escape,
 * aged-out plane, layer disable, and voice stopTracking.
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
    clearFocusTarget('flights');
    return;
  }
  const clearedIcao = S._trackedIcao;
  clearFocusTarget('flights', clearedIcao);

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
    // Ground/military-aware restore (a plane untracked while taxiing must come
    // back muted-gray at ground scale, not white at full scale).
    bb.color = _fleetBillboardColor(S._trackedIcao);
    bb.scale = _fleetBillboardScale(S._trackedIcao, S._flightData.get(S._trackedIcao)?.klass);
    bb.rotation = S._lastTrackedRotation;
  }
  S._lastCamPoseSig = ''; // force a fleet rotation pass on the next tick

  // Stop tracking and remove the entity. skipViewerUntrack: when ANOTHER layer just grabbed the
  // follow-camera, we tear down our own state but must NOT clear viewer.trackedEntity (the new owner
  // controls it now — clearing it would yank the camera off their plane). Releasing trackedEntity
  // does NOT move the camera: Cesium resets the lookAt transform in place, so the view stays where
  // the follow left it and the user can immediately orbit/zoom.
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
  clearTrackedSubjectContext('flights');
  _emitAwarenessEvent('gev:awareness-subject-cleared', {
    layerId: 'flights',
    id: clearedIcao,
    origin,
    reason: evicted ? 'evicted' : 'deliberate',
  });
  // Invalidate the per-frame DR cache + reconciliation state so a same-frame re-track
  // cannot read the previous aircraft's cached/smoothed position.
  _resetTrackedDisplay();
  _clearTrail();
}

/**
 * Whether the Military layer suppresses this civil duplicate right now.
 *
 * The dedicated Military layer owns icon/track/click for known-military
 * contacts, so the OpenSky duplicate is dropped while that layer is on. Two
 * contacts are exempt, both for the same reason — this layer still owns them:
 *
 *   - the CURRENTLY tracked one, which hands off on untrack; and
 *   - a target this layer is holding on its deferred-restore latch.
 *
 * The second exemption is what makes a shared/local Follow of a mil-registry
 * hex restorable at all. The accepted-snapshot id set is built BEFORE this
 * suppression runs, so without it the target is provably present in a healthy
 * feed yet has no billboard, `trackById` fails, and the restore reports
 * "feed unavailable" about a feed that was perfectly fine.
 *
 * @param {string} icao24 - Normalized ICAO 24-bit address.
 * @returns {boolean} True when the civil duplicate must be dropped.
 */
export function _militaryLayerSuppresses(icao24) {
  if (!isMilitaryLayerActive()) return false;
  if (icao24 === S._trackedIcao) return false;
  if (icao24 === S._pendingTrackingRestore?.id) return false;
  return true;
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

/** Multi-line tracked presentation text: "CS · FL · kts" + "Airline · Type" +
 *  "ORIG → DEST". The route line is gated by
 *  routePlausible so a wrong-leg adsbdb route is hidden, not displayed.
 *  While the plane is in its missed-poll grace (coasting on dead reckoning
 *  with sticky metadata), the first line carries a "· STALE" cue — the fleet's
 *  45%-alpha billboard fade doesn't apply to the tracked plane (its entity
 *  owns the visual), so without this the readout would present last-known
 *  velocity/altitude as live. */
function _trackedLabelText(icao24) {
  const info = S._flightData.get(icao24);
  if (!info) return icao24;
  // A whitespace-only callsign ("   ") is truthy, so `(info.callsign || icao24)`
  // kept it, then .trim() emptied it → the callsign slot dropped out of the
  // readout. `_contactLabel` trims FIRST, then falls through registration to
  // the ICAO hex, so a callsign-less enriched contact heads its readout with
  // the tail number rather than raw hex.
  const cs = _contactLabel(icao24, info);
  const altFt = Math.round((info.altitude || 0) * 3.28084);
  const fl = altFt >= 18000 ? `FL${Math.round(altFt / 100)}` : `${altFt} ft`;
  const spd = info.velocity ? `${Math.round(info.velocity * 1.944)} kts` : '';
  const stale = (S._missingPolls.get(icao24) || S._backoff) ? 'USANG' : '';
  const lines = [[cs, fl, spd, stale].filter(Boolean).join(' · ')];
  // Converted contacts report their class as TR-3B and nothing else — the
  // operator/type identity is exactly what the Easter egg is replacing.
  const ident = isTr3b(icao24)
    ? tr3bTypeLabel(icao24)
    : [info.airline, info.typeName || info.typeCode].filter(Boolean).join(' · ');
  if (ident) lines.push(ident);
  if (info.route && _routeIsPlausible(icao24, info.route)) {
    lines.push(`${info.route.origin.code} → ${info.route.destination.code}`);
  }
  return lines.join('\n');
}

/** Write the explicit tracked presentation model and refresh its host entry. */
export function _updateTrackedLabelModel(icao24) {
  if (!S._trackedEntity || icao24 !== S._trackedIcao) return;
  S._trackedEntity.gevLabelModel = trackedLabelModelFromText(
    _trackedLabelText(icao24),
    '#39d0ff',
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

/** Re-render one contact after its TR-3B conversion (or the active IR style)
 *  changed — delegates to the shared engine. See aircraftPresentation.js's
 *  `refreshTr3bContact` for the full rationale.
 * @param {string} icao24 - ICAO 24-bit address.
 * @returns {boolean} True when the layer owns this contact. */
export function _refreshTr3bContact(icao24) {
  return _presentation.refreshTr3bContact(icao24);
}

/** Re-image every converted contact this layer owns (IR style flip) —
 *  delegates to the shared engine. */
export function _refreshTr3bForStyle() {
  _presentation.refreshTr3bForStyle();
}

/**
 * Begin tracking a specific aircraft by ICAO24 address.
 *
 * Clears any existing tracked flight, hides its billboard, and creates a
 * new Entity with:
 *  - A CallbackProperty position driven by dead-reckoning (_dr.deadReckon).
 *  - A CallbackProperty alignedAxis set to the surface normal at the
 *    dead-reckoned position (keeps the icon tangent to the earth).
 *  - A CallbackProperty rotation from the aircraft's true_track heading.
 *  - An explicit host presentation model with callsign, flight level, speed,
 *    identity, and plausible route text.
 *
 * The viewer's trackedEntity is set to this entity so the camera follows it.
 *
 * @param {string} icao24 - ICAO 24-bit transponder address to track.
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

  // Hide the billboard — the tracked entity replaces it visually
  bb.show = false;

  // Helper: smoothed, per-frame-cached tracked position (see _trackedDisplayPosition —
  // one computation shared by the position/alignedAxis/rotation/trail-head callbacks,
  // with discontinuity reconciliation). Falls back to the last billboard position when
  // the aircraft has no fix.
  const getTrackedPosition = () => _trackedDisplayPosition(icao24) || bb.position;

  // Dead-reckoning position property — smooth continuous motion between API updates.
  const positionProperty = new Cesium.CallbackProperty(() => {
    return getTrackedPosition();
  }, false);

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
  // The tracked entity is a PURE BILLBOARD — no label or model graphic. The 3D model for the
  // tracked plane is a standalone primitive driven by _updateTrackedModel(); keeping it off the
  // entity is what makes the follow-camera's bounding sphere always ready (see _trackedModel).
  // Keep Cesium's generated entity ID: re-init without destroy can temporarily
  // overlap collections, and an explicit ICAO ID would throw on that duplicate.
  S._trackedEntity = S._viewer.entities.add({
    position: positionProperty,
    // Force Cesium's built-in EntityView and our close-range camera guard to
    // use the same local frame. AUTO can select a velocity frame while the
    // model matrix uses aircraft orientation; alternating between those
    // frames makes the target oscillate forward/back on screen.
    trackingReferenceFrame: Cesium.TrackingReferenceFrame.ENU,
    billboard: {
      image: aircraftIcon(_iconKind(S._trackedIcao, S._flightData.get(S._trackedIcao)?.klass), TRACKED_ICON_PX),
      width: 28,
      height: 28,
      scale: CLASS_SCALE_2D[S._flightData.get(S._trackedIcao)?.klass] || 1,
      // Solid cyan when the billboard is the visual (zoomed out, 3D off, or model still loading);
      // transparent once the STANDALONE tracked model is actually up (ready + shown).
      color: new Cesium.CallbackProperty(() => (
        _modelOwnsVisual(S._trackedIcao) ? CYAN_TRANSPARENT : Cesium.Color.CYAN
      ), false),
      sizeInMeters: false,
      scaleByDistance: new Cesium.NearFarScalar(1000, 3.0, 8000000, 0.5),
      alignedAxis: Cesium.Cartesian3.ZERO,
      // The tracked target must never vanish into tile geometry — tracking a
      // taxiing plane at street level would otherwise bury the cyan icon inside
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
  S._trackedEntity.gevTrackedId = `flights:${icao24}`;
  S._trackedEntity.gevLabelModel = trackedLabelModelFromText(_trackedLabelText(icao24), '#39d0ff');

  // A billboard has a ~zero bounding sphere, so Cesium's default follow distance is
  // far too tight (the user had to scroll out to read the plane). Give the entity a
  // calibrated viewFrom — behind + above, distance scaled to altitude — for a readable
  // initial frame with surrounding context. (ENU: east=+X, north=+Y, up=+Z.)
  const followRange = Math.min(Math.max((info.altitude || 1500) * 1.1 + 2500, 3000), 30000);
  S._trackedEntity.viewFrom = new Cesium.Cartesian3(0, -followRange * 0.8, followRange * 0.55);

  // Cancel any in-progress camera flight first — otherwise Cesium won't apply the
  // tracked entity's viewFrom on the first frame, so voice-initiated tracking (which
  // often fires mid-fly_to_location) would follow the plane WITHOUT centering/framing it
  // the way a click (idle camera) does.
  // Expose the camera's already-settled position to cross-module HUD consumers (the tracked-target
  // readout) so they draw at the SAME spot the camera framed, without recomputing the dead-reckon in
  // postRender (which would jitter the label against the now-stable plane).
  S._trackedEntity.gevDisplayPosition = _trackedDisplayCached;
  // Separate accessor on purpose: `gevDisplayPosition` carries the follow-camera
  // anti-jitter contract and must keep returning the cached DR position. Presentation
  // that should weld to the AIRCRAFT YOU SEE reads `gevVisualPosition` instead.
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

  // Track-history trail (PRD F1): seed from local history + async backfill.
  // Ground traffic draws NO trail (a taxi path is noise, not a track) — if the
  // plane takes off while tracked, the on_ground→false transition in update()
  // starts one.
  _requestTypeEnrichment(icao24, true); // tracked plane — front of the enrichment queue
  _requestRouteEnrichment(icao24);
  // Round 2 (owner): grounded contacts get trails too — a landed-but-taxiing
  // aircraft's history is retrievable on select. Grounded flights positions
  // are already surface-clamped (the surfaceM chain), so seeds/appends drape.
  _startTrail(icao24);

  _publishTrackedSelection(icao24, origin);

  console.log(`[Data:Flights] Tracking ${_contactLabel(icao24, info)} (${icao24})`);
}

/**
 * Immediate military-suppression handoff sweep (pre-ship audit M2).
 *
 * The poll-time suppression branch in update() only reconciles every 30 s, so
 * toggling the Military layer showed duplicate icons (military ON: both layers
 * render the same aircraft ~3-4 km apart) or holes (military OFF: suppressed
 * aircraft absent) for up to a full poll. Fired synchronously by the registry
 * on the active-state TRANSITION:
 *
 *  - activated  → suppress known-military billboards NOW (mirror of the
 *    poll-time branch, tracked aircraft excluded — it hands off on untrack);
 *  - deactivated → the suppressed aircraft's state was deleted, so bring the
 *    next OpenSky poll forward instead of waiting out the interval (update()
 *    itself still honors _retryAt backoff).
 *
 * @param {boolean} active - New military-layer active state.
 * @returns {void}
 */
export function _onMilitaryActiveChange(active) {
  if (!S._viewer || !S._billboardCollection) return;
  if (active) {
    for (const [icao24, bb] of S._billboards) {
      if (!isMilitaryIcao(icao24) || icao24 === S._trackedIcao) continue;
      S._billboardCollection.remove(bb);
      S._billboards.delete(icao24);
      _releaseModel(icao24); // military-suppression: drop any 3D model too
      S._flightData.delete(icao24);
      S._positionHistory.delete(icao24);
      _displayCourse.delete(icao24);
      _groundSnap.forget(icao24);
      S._missingPolls.delete(icao24);
    }
    S._count = S._billboards.size;
  } else if (S._billboardCollection.show) {
    // Fire-and-forget refresh; only while the layer is actually enabled.
    void flightsLayer.update(S._viewer);
  }
}
