// Moved out of flights.js (flightsDisplay).

import * as Cesium from 'cesium';
import { trackedModelScaleForPixelCap } from './trackedCamera.js';
import { CLASS_SCALE_2D } from './aircraftClass.js';
import { clearFocusTarget, nearFarScalarValueAtDistance, publishFocusTargetFromCachedPosition } from './focusDeemphasis.js';
import { modelAnchorWorld, modelVisualAnchor } from './modelVisualAnchor.js';
import { courseSlewCapDps, limitCourseStep } from './motionModel.js';
import { COURSE_MAX_DPS, COURSE_SLEW_DT_MAX_SEC, DR_CORRECTION_MS, LANDED_ALT_MAX_M, LANDED_SPEED_MAX_MPS, TRACKED_BILLBOARD_SCALE_BY_DISTANCE, TRACKED_MODEL_MAX_PX, TRACKED_MODEL_MIN_PX } from './flightsConstants.js';
import { _floorGroundedDisplayPosition } from './flightsDisplayFloor.js';
import { _modelSpec } from './flightsFleetModels.js';
import { _dr, _modelOwnsVisual } from './flightsInstances.js';
import { S, _displayCourse, _drCorrection, _drPrevDisplay, _drPrevRaw, _scratchDrRaw, _scratchTrailClip, _trackedPosHolder, _trackedTrailPos, _trackedVisualPos } from './flightsState.js';

/**
 * True when the aircraft's latest metadata reads "on or about the runway"
 * (low + slow) — see the landed fast-cull rationale above. Both gates must
 * hold, so a plane missing either datum keeps the normal grace.
 * @param {string} icao24 - ICAO 24-bit transponder address.
 * @returns {boolean}
 */
export function _likelyLanded(icao24) {
  const info = S._flightData.get(icao24);
  if (!info) return false;
  // Round 7 (owner: "fewer planes than OpenSky's own map" + "parked planes
  // never heal"): the fast cull only applies to contacts that were AIRBORNE
  // this session — its original target, the post-LANDING ghost. OpenSky's
  // ground coverage flaps constantly, so fast-culling every grounded contact
  // put parked planes in an evict/re-enter churn: each re-entry was a
  // brand-new contact with cold floor state (geoid-height first poll), so
  // the apron looked half-empty AND perpetually sunken. First-seen-grounded
  // contacts now ride the normal MISSING_POLL_LIMIT grace and keep their
  // identity (and warmed floors) across feed flaps.
  if (info.wasAirborne !== true) return false;
  // Was airborne, then grounded, then VANISHED from the poll — landed ghost.
  if (info.onGround) return true;
  return Number.isFinite(info.altitude) && info.altitude < LANDED_ALT_MAX_M
    && Number.isFinite(info.velocity) && info.velocity < LANDED_SPEED_MAX_MPS;
}

// _deadReckon / _extrapolateFix / _isTrackWarmingUp moved to deadReckoning.js
// (shared with militaryFlights.js) — see the `_dr` instance above. Call sites
// below use `_dr.deadReckon(...)` / `_dr.isTrackWarmingUp()` / `_dr.last.*`.

/** Resolve the selected aircraft's actual rendered square extent this frame. */
function _trackedFocusSizePx(icao24, position) {
  const camera = S._viewer?.camera;
  const scene = S._viewer?.scene;
  if (!camera?.positionWC || !position || !scene) return 28;
  const rangeM = Cesium.Cartesian3.distance(camera.positionWC, position);
  if (_modelOwnsVisual(icao24)) {
    const spec = _modelSpec(S._flightData.get(icao24)?.klass);
    const scale = trackedModelScaleForPixelCap({
      baseScale: spec.scale,
      nativeRadiusM: spec.nativeRadiusM,
      rangeM,
      viewportHeightPx: scene.canvas.clientHeight,
      fovyRad: camera.frustum.fovy,
      maximumPixelSize: TRACKED_MODEL_MAX_PX,
    });
    const focalLengthPx = scene.canvas.clientHeight / (2 * Math.tan(camera.frustum.fovy / 2));
    const projectedDiameterPx = (2 * spec.nativeRadiusM * scale * focalLengthPx) / rangeM;
    return Math.max(TRACKED_MODEL_MIN_PX, Math.min(TRACKED_MODEL_MAX_PX, projectedDiameterPx));
  }

  const billboard = S._trackedEntity?.billboard;
  const time = S._viewer.clock.currentTime;
  const width = billboard?.width?.getValue(time) ?? 28;
  const height = billboard?.height?.getValue(time) ?? 28;
  const scale = billboard?.scale?.getValue(time)
    ?? (CLASS_SCALE_2D[S._flightData.get(icao24)?.klass] || 1);
  const scaleByDistance = billboard?.scaleByDistance?.getValue(time)
    ?? TRACKED_BILLBOARD_SCALE_BY_DISTANCE;
  const distanceScale = nearFarScalarValueAtDistance(scaleByDistance, rangeM);
  return Math.max(width, height) * scale * distanceScale;
}

/**
 * Per-frame-cached, discontinuity-smoothed tracked DISPLAY position. Cached by Cesium
 * frame number so the position / rotation / trail-head callbacks share ONE computation
 * (and one reconciliation-state update) per frame. Returns a stable module holder, or
 * null when the aircraft has no fix.
 * @param {string} icao24
 * @returns {Cesium.Cartesian3|null}
 */
export function _trackedDisplayPosition(icao24) {
  const frame = S._viewer?.scene?.frameState?.frameNumber ?? -1;
  if (frame === S._cachedDRFrame && icao24 === S._drReconcileIcao) return S._cachedDRPosition;

  // Does the reconciliation state belong to THIS aircraft? (Capture before overwriting
  // _drReconcileIcao, so a track switch doesn't inherit the old plane's _drPrevRaw.)
  const sameTrack = S._drReconcileValid && S._drReconcileIcao === icao24;
  const raw = _dr.deadReckon(icao24, _scratchDrRaw);
  S._cachedDRCourse = _dr.last.courseDeg;
  S._cachedDRSpeedMps = _dr.last.speedMps;
  S._cachedDRHold = _dr.last.courseHold;
  S._cachedDRFrame = frame;
  S._drReconcileIcao = icao24;
  if (!raw) {
    S._cachedDRPosition = null;
    S._drReconcileValid = false;
    clearFocusTarget('flights', icao24);
    return null;
  }

  const nowMs = Date.now();
  const info = S._flightData.get(icao24);
  if (sameTrack) {
    const dtSec = Math.max(0.001, (nowMs - S._drPrevMs) / 1000);
    const speed = (info && info.velocity) || 0;
    // Plausible single-frame motion (m): real velocity × frame Δt, ×4 slack + 25 m base.
    const plausible = speed * dtSec * 4 + 25;
    if (Cesium.Cartesian3.distance(raw, _drPrevRaw) > plausible) {
      // Discontinuity — re-anchor so the DISPLAYED position stays continuous, then decay.
      Cesium.Cartesian3.subtract(_drPrevDisplay, raw, _drCorrection);
      S._drCorrectionStartMs = nowMs;
    }
  } else {
    Cesium.Cartesian3.fromElements(0, 0, 0, _drCorrection);
    S._drCorrectionStartMs = nowMs - DR_CORRECTION_MS; // fully decayed
  }

  const elapsed = nowMs - S._drCorrectionStartMs;
  const factor = elapsed >= DR_CORRECTION_MS ? 0 : 1 - elapsed / DR_CORRECTION_MS;
  let display = Cesium.Cartesian3.multiplyByScalar(_drCorrection, factor, _trackedPosHolder);
  Cesium.Cartesian3.add(raw, display, display);
  // Same display floor the fleet pass applies — otherwise selecting a correctly
  // floored grounded billboard swapped it for an unfloored tracked entity and
  // dropped the cyan target back under the mesh. Applied HERE, at the single
  // point every VISUAL consumer's per-frame position is computed, so the
  // readout anchor, detection bracket, trail head and follow-camera all read
  // the one floored value (the anti-jitter contract forbids recomputing per
  // consumer). NOT the single point for DATA: `_describeFlight` deliberately
  // reports sensor truth — see the note there. Skipped while a tracked 3D model
  // owns the visual: it rides groundSnap's one-shot sample and moving its input
  // would force a re-sample (T7).
  display = _floorGroundedDisplayPosition(icao24, info, display, _modelOwnsVisual(icao24), nowMs);

  Cesium.Cartesian3.clone(raw, _drPrevRaw);
  Cesium.Cartesian3.clone(display, _drPrevDisplay);
  S._drPrevMs = nowMs;
  S._drReconcileValid = true;
  S._cachedDRPosition = display;
  const focusSizePx = _trackedFocusSizePx(icao24, S._cachedDRPosition);
  // Publish only the exact per-frame display cache the tracked entity/camera
  // consumes. Re-running DR from a later frame phase recreates the historical
  // target-vs-camera jitter bug.
  publishFocusTargetFromCachedPosition({
    ownerLayer: 'flights',
    id: icao24,
    scene: S._viewer?.scene,
    camera: S._viewer?.camera,
    displayPosition: S._cachedDRPosition,
    widthPx: focusSizePx,
    heightPx: focusSizePx,
  });
  return display;
}

/** The tracked plane's current display position WITHOUT recomputing — the exact value the
 *  follow-camera already settled on this frame (in the Viewer _onTick). getDetectableObjects + the
 *  readout run in postRender at a LATER frameNumber, so calling _trackedDisplayPosition there would
 *  re-run the dead-reckon on a fresh sample and double-advance the reconciliation → the label jitters
 *  against the now-stable plane (the model's jitter fix, resurfacing in the labels). Returns null when
 *  there's no valid fix for the tracked aircraft, so callers fall back to the billboard position. */
export function _trackedDisplayCached() {
  return (S._drReconcileValid && S._drReconcileIcao === S._trackedIcao) ? S._cachedDRPosition : null;
}

/**
 * The position the tracked aircraft is VISUALLY at this frame — the translation its
 * 3D model is actually rendering with when the model owns the visual, otherwise the
 * cached dead-reckoned position the billboard uses.
 *
 * This exists because a grounded plane's model rides a one-shot ground snap while its
 * billboard deliberately stays at the reported (buried) altitude — a ~100 m vertical
 * split at an inland airport. Anything anchored to the display position while the model
 * is what you can see drifts below the aircraft and only converges as the coarse floor
 * cell warms ("the buoy"), sometimes never.
 *
 * It reads `modelMatrix`, which `_updateTrackedModel` already wrote this frame — no
 * sampling, no `_modelDisplayPosition` call from postRender, and no new dead reckoning,
 * so the follow-camera anti-jitter contract on `gevDisplayPosition` is untouched.
 */
export function _trackedVisualCached() {
  if (S._trackedIcao && _modelOwnsVisual(S._trackedIcao)) {
    const spec = _modelSpec(S._flightData.get(S._trackedIcao)?.klass);
    return modelVisualAnchor(
      S._trackedModel.modelMatrix,
      spec.visualCenterNative,
      Number.isFinite(S._trackedModel.computedScale) ? S._trackedModel.computedScale : spec.scale,
      _trackedVisualPos,
    );
  }
  return _trackedDisplayCached();
}

/** Trail endpoint for the rendered tracked owner. Brackets/readouts stay on
 * the visual centre; only the trail moves to the model's lower-centre hardpoint. */
/** The tracked model's rendered bounding radius (m), or 0 when no model of this
 *  contact is drawing. Carries Cesium's effective `computedScale`, which may be
 *  above `scale` to satisfy minimumPixelSize — the trail head has to be judged
 *  against the size the operator SEES, not the nominal one. */
/** World-space origin of the tracked model, or null when no model of this
 *  contact is drawing. This is the centre the rendered bounding sphere is
 *  measured from, so the trail clip and the envelope agree on one frame. */
export function _trackedModelCenterWorld() {
  if (!S._trackedIcao || !S._trackedModel || !_modelOwnsVisual(S._trackedIcao)) return null;
  return Cesium.Matrix4.getTranslation(S._trackedModel.modelMatrix, _scratchTrailClip);
}

export function _trackedModelEnvelopeM() {
  if (!S._trackedIcao || !S._trackedModel || !_modelOwnsVisual(S._trackedIcao)) return 0;
  const spec = _modelSpec(S._flightData.get(S._trackedIcao)?.klass);
  const scale = Number.isFinite(S._trackedModel.computedScale)
    ? S._trackedModel.computedScale
    : spec.scale;
  return spec.nativeRadiusM * scale;
}

export function _trackedTrailCached() {
  if (S._trackedIcao && _modelOwnsVisual(S._trackedIcao)) {
    const spec = _modelSpec(S._flightData.get(S._trackedIcao)?.klass);
    // Through the model's OWN render chain (modelVisualAnchor's hand-rolled
    // half-correction put this offset on the lateral axis — see
    // modelAnchorWorld).
    return modelAnchorWorld(S._trackedModel, spec.trailAnchorNative, _trackedTrailPos);
  }
  return _trackedDisplayCached();
}

/** Smoothed world course for the tracked aircraft this frame. Reads the
 *  frame-cached course (set by _trackedDisplayPosition — the follow-camera's
 *  own computation), NEVER re-runs _dr.deadReckon. Safe to call more than once
 *  per frame: the second call sees dt≈0 and the limiter is a no-op.
 *
 *  The smoothed value lives in the SHARED per-icao _displayCourse entry (see
 *  its declaration): on click the limiter continues from whatever nose the
 *  fleet pass was displaying, and on untrack the fleet pass continues from
 *  whatever nose this path last wrote — the tracked and fleet consumers of
 *  the same aircraft can never disagree across the handoff. */
export function _trackedDisplayCourse() {
  const info = S._flightData.get(S._trackedIcao);
  const fallback = (info && info.true_track) || 0;
  const cacheValid = S._drReconcileValid && S._drReconcileIcao === S._trackedIcao && S._cachedDRCourse != null;
  const raw = cacheValid ? S._cachedDRCourse : fallback;
  const nowMs = Date.now();
  const dt = S._trackedCourseMs
    ? Math.min(COURSE_SLEW_DT_MAX_SEC, (nowMs - S._trackedCourseMs) / 1000)
    : 0;
  S._trackedCourseMs = nowMs;
  const prev = _displayCourse.get(S._trackedIcao);
  // Hover hold: at near-zero displayed speed both the chord and the reported
  // track are noise — keep the last stable nose direction instead of chasing.
  if (cacheValid && S._cachedDRHold && prev != null) return prev;
  const cap = courseSlewCapDps(cacheValid ? S._cachedDRSpeedMps : ((info && info.velocity) ?? NaN), COURSE_MAX_DPS);
  const course = limitCourseStep(prev, raw, cap, dt);
  _displayCourse.set(S._trackedIcao, course);
  return course;
}

/** Reset reconciliation + per-frame cache when tracking stops or switches
 *  target. Deliberately does NOT touch _displayCourse: the smoothed course
 *  entry belongs to the AIRCRAFT (not to the tracked session) and must
 *  survive the handoff back to the fleet pass. */
export function _resetTrackedDisplay() {
  S._drReconcileValid = false;
  S._drReconcileIcao = null;
  S._cachedDRFrame = -1;
  S._cachedDRPosition = null;
  S._cachedDRCourse = null;
  S._cachedDRSpeedMps = null;
  S._cachedDRHold = false;
  S._trackedCourseMs = 0;
}
