// Moved out of militaryFlights.js (militaryFlightsFleetTick).

import { advanceProjectedSpriteFocus, focusNowMs, getFocusTarget, nearFarScalarValueAtDistance } from './focusDeemphasis.js';
import { cameraPoseSignature, horizonOccluder, screenProjectedRotation } from './iconOrientation.js';
import { isTr3b } from './tr3bRegistry.js';
import * as Cesium from 'cesium';
import { applyAircraftBillboardTreatment, applyAircraftModelTreatment } from './aircraftRecession.js';
import { TRACKED_ICON_PX, aircraftIcon } from './aircraftIcons.js';
import { courseSlewCapDps, displayedKinematics, limitCourseStep } from './motionModel.js';
import { _toCleanText } from './militaryFlightsApi.js';
import { _refreshCockpitNearContacts } from './militaryFlightsCockpit.js';
import { COURSE_MAX_DPS, COURSE_SLEW_DT_MAX_SEC, FLEET_DR_INTERVAL_MS, MIL_ICON_COLOR, ROTATION_REFRESH_MS } from './militaryFlightsConstants.js';
import { _drainIrReloadQueue, _driveFleetModelHandoff, _ensureModel, _fleetBillboardScale, _modelAddDistM, _modelCap, _modelColor, _modelKeepDistM, _modelRegimeActive, _releaseModel, _releaseModels } from './militaryFlightsFleetModels.js';
import { _dr, _iconKind, _presentation } from './militaryFlightsInstances.js';
import { S, _billboardLimbScale, _displayCourse, _modelPending, _models, _scratchCarto, _scratchFleetPos, _scratchModelBS } from './militaryFlightsState.js';

/**
 * Per-preRender fleet pass at ~12Hz: dead-reckons every untracked billboard,
 * horizon-culls billboards beyond the limb (no far-side depth with the globe
 * hidden), and refreshes screen-projected icon rotations whenever the camera
 * pose changed (plus a 1s drift catch-up while idle). Driven by
 * scene.preRender — NOT camera.changed, whose granularity is globally
 * degraded by other layers mutating camera.percentageChanged.
 * @returns {void}
 */
export function _fleetTick() {
  if (!S._viewer || !S._billboardCollection || !S._billboardCollection.show) return;
  const scene = S._viewer.scene;
  const camera = S._viewer.camera;
  const nowMs = focusNowMs(Date.now());

  // (The tracked trail head is now the per-frame _trailHeadEntity segment — no 1 Hz
  // primitive rebuild here. The body rebuilds only when a real fix arrives.)

  if ((nowMs - S._lastFleetTickMs) < FLEET_DR_INTERVAL_MS) return;
  const tickDtSec = S._lastFleetTickMs
    ? Math.min(COURSE_SLEW_DT_MAX_SEC, (nowMs - S._lastFleetTickMs) / 1000)
    : 0.08;
  S._lastFleetTickMs = nowMs;

  _drainIrReloadQueue(); // bounded per-tick slice of any pending boost-flip reload
  if (S._cockpitContactMode) _refreshCockpitNearContacts();
  const poseSig = cameraPoseSignature(camera);
  // Only nearby Cockpit silhouettes need projected course; far dots remain
  // rotation-free through the per-contact gate below.
  const doRotations = (poseSig !== S._lastCamPoseSig || (nowMs - S._lastRotPassMs) >= ROTATION_REFRESH_MS);
  if (doRotations) {
    S._lastCamPoseSig = poseSig;
    S._lastRotPassMs = nowMs;
  }

  const occluder = horizonOccluder(camera);
  const focusTarget = getFocusTarget();

  // 3D model regime: only when enabled AND the camera is zoomed in past the altitude ceiling.
  // Drop all models the moment we leave it (toggled off / zoomed out) so billboards resume.
  const useModels = _modelRegimeActive();
  // Drop live models AND invalidate in-flight loads on leaving the regime (else a load that
  // resolves after zoom-out could briefly add a model outside the 3D-model regime).
  if (!useModels && (_models.size || _modelPending.size)) _releaseModels();

  // 3D-model eligibility: by DISTANCE (mode's add/keep band) with ON-SCREEN PRIORITY under the cap —
  // mirror of flights.js. FOUR visible-first passes: (1) KEEP on-screen modeled; (2) ADD on-screen
  // new in add radius; (3) KEEP off-screen modeled; (4) ADD off-screen new with leftover slots. KEEP
  // is split by frustum so an off-screen retained model can't starve an on-screen plane (review finding).
  let modelEligible = null;
  if (useModels) {
    const cap = _modelCap();
    const camPos = camera.positionWC;
    const addM = _modelAddDistM();
    const addDistSq = addM * addM;
    const keepM = _modelKeepDistM();
    const keepDistSq = keepM * keepM;
    const cull = camera.frustum.computeCullingVolume(camPos, camera.directionWC, camera.upWC);
    const cand = [];
    for (const [icao, bb] of S._billboards) {
      if (icao === S._trackedIcao) continue;
      // A converted TR-3B renders as a billboard and can never take a model, so
      // it must not occupy a CAP SLOT either (mirror of flights.js) — excluded
      // at selection time, not just at the handoff below.
      if (isTr3b(icao)) continue;
      // Ground planes compete for model slots like everyone else (owner decision
      // 2026-07-03, mirror of flights.js — no air/ground distinction; grounded
      // placement is handled by the one-shot ground snap in _modelDisplayPosition).
      const d2 = Cesium.Cartesian3.distanceSquared(camPos, bb.position);
      if (d2 > keepDistSq) continue; // beyond keep radius → never eligible
      Cesium.Cartesian3.clone(bb.position, _scratchModelBS.center);
      cand.push([icao, d2, cull.computeVisibility(_scratchModelBS) !== Cesium.Intersect.OUTSIDE]);
    }
    cand.sort((a, b) => a[1] - b[1]);
    if (cand.length > cap && (nowMs - S._lastModelCapWarnMs) > 5000) {
      console.warn(`[Data:Military] ${cand.length} planes in 3D range; capped at ${cap} (${S._models3dMode}). On-screen prioritized.`);
      S._lastModelCapWarnMs = nowMs;
    }
    modelEligible = new Set();
    for (const [icao, , inF] of cand) { if (modelEligible.size >= cap) break; if (inF && _models.has(icao)) modelEligible.add(icao); } // 1. KEEP on-screen
    for (const [icao, d2, inF] of cand) { if (modelEligible.size >= cap) break; if (inF && d2 <= addDistSq && !modelEligible.has(icao)) modelEligible.add(icao); } // 2. ADD on-screen
    for (const [icao, , inF] of cand) { if (modelEligible.size >= cap) break; if (!inF && _models.has(icao)) modelEligible.add(icao); } // 3. KEEP off-screen (can't starve visible)
    for (const [icao, d2, inF] of cand) { if (modelEligible.size >= cap) break; if (!inF && d2 <= addDistSq && !modelEligible.has(icao)) modelEligible.add(icao); } // 4. ADD off-screen leftover
    const toRelease = [];
    for (const icao of _models.keys()) {
      if (icao !== S._trackedIcao && !modelEligible.has(icao)) toRelease.push(icao);
    }
    for (const icao of toRelease) _releaseModel(icao);
  }

  for (const [icao24, bb] of S._billboards) {
    if (icao24 === S._trackedIcao) continue; // tracked entity owns its own motion

    const dr = _dr.deadReckon(icao24, _scratchFleetPos);
    // Gate the write — assigning Billboard.position dirties the whole
    // collection's vertex buffer, so skip sub-meter moves.
    if (dr && Cesium.Cartesian3.distanceSquared(dr, bb.position) > 1.0) {
      bb.position = dr;
    }

    // Round 6: occlusion-test a LIFTED point for contacts at/below the
    // ellipsoid (mirror of flights.js — sub-ellipsoid points near the limb
    // read "beyond the horizon" and would hide low contacts awaiting floors).
    const beyondHorizon = !occluder.isPointVisible(S._flightData.get(icao24)?.cullPosition || bb.position);
    // A billboard flipping INTO view (horizon reveal while the camera idles)
    // gets its rotation refreshed THIS tick even without a pose change —
    // otherwise it reappears wearing its stale (often creation-north) nose for
    // up to ROTATION_REFRESH_MS. (Model-handed-off planes also read show=false
    // here; harmless — the model branch below `continue`s past the rotation.)
    const revealed = !beyondHorizon && !bb.show;
    if (bb.show === beyondHorizon) bb.show = !beyondHorizon;
    if (beyondHorizon) {
      // Also hide any 3D model — otherwise a model that crossed the limb would keep
      // rendering through the hidden globe at its last matrix.
      const m = _models.get(icao24);
      if (m && m.show) m.show = false;
      continue;
    }

    const info = S._flightData.get(icao24);

    // One sprite-owned write site composes freshness × focus × limb haze and
    // base class/ground scale × limb taper. The locked NearFarScalar remains
    // untouched and multiplicative; there is no cull or zero-alpha path.
    const cameraDistanceM = Cesium.Cartesian3.distance(camera.positionWC, bb.position);
    const distanceScale = nearFarScalarValueAtDistance(bb.scaleByDistance, cameraDistanceM);
    const focus = advanceProjectedSpriteFocus(
      bb,
      bb.position,
      scene,
      camera,
      nowMs,
      focusTarget,
      undefined,
      (bb.width || 20) * (bb.scale || 1) * distanceScale * 0.5,
      (bb.height || 20) * (bb.scale || 1) * distanceScale * 0.5,
    );
    const isCockpitNear = S._cockpitContactMode && S._cockpitNearContacts.has(icao24);
    const treatment = applyAircraftBillboardTreatment({
      billboard: bb,
      baseScale: S._cockpitContactMode && !isCockpitNear ? 1 : _fleetBillboardScale(icao24, info?.klass),
      baseAlpha: S._missingPolls.get(icao24) ? 0.45 : 1,
      baseColor: MIL_ICON_COLOR,
      focusFactor: focus.factor,
      cameraDistanceM,
      cameraHeightM: camera.positionCartographic?.height,
    });
    _billboardLimbScale.set(bb, treatment.factors.scale);
    // Two-tier glyph raster — mirror of flights.js: swap 64/192 px rasters on
    // the billboard's ACTUAL on-screen size (post-treatment bb.scale, so
    // focus/limb recession counts) with hysteresis (atlas has no mips).
    if (!S._cockpitContactMode || isCockpitNear) {
      const glyphDevPx = (bb.width || 20) * (bb.scale || 1)
        * distanceScale * (globalThis.devicePixelRatio || 1);
      const wantLarge = bb._gevIconLarge ? glyphDevPx > 56 : glyphDevPx > 76;
      if (wantLarge !== !!bb._gevIconLarge) {
        bb._gevIconLarge = wantLarge;
        bb.image = aircraftIcon(_iconKind(icao24, S._flightData.get(icao24)?.klass), wantLarge ? TRACKED_ICON_PX : undefined);
      }
    }

    // Smoothed display course: the path direction _dr.deadReckon just reported
    // for THIS aircraft (nothing else calls _dr.deadReckon in between), rate-
    // limited so segment-boundary course steps glide instead of snapping.
    // The slew cap eases toward COURSE_MIN_DPS at low speed, and a hovering
    // aircraft (hold flag) keeps its previous nose direction outright.
    const rawCourse = _dr.last.courseDeg != null ? _dr.last.courseDeg : ((info && info.track) || 0);
    const prevCourse = _displayCourse.get(icao24);
    const course = (_dr.last.courseHold && prevCourse != null)
      ? prevCourse
      : limitCourseStep(
        prevCourse, rawCourse,
        courseSlewCapDps(_dr.last.speedMps != null ? _dr.last.speedMps : ((info && info.speedMps) ?? NaN), COURSE_MAX_DPS),
        tickDtSec,
      );
    _displayCourse.set(icao24, course);

    // 3D model takes over from the billboard for in-view planes (modelEligible). GAP-PROOF: the
    // billboard stays shown until the model is actually READY to render, so a plane is never both
    // iconless AND modelless (the "planes vanish when 3D turns on" bug). Position the model every
    // tick regardless so it's framed the instant it becomes ready.
    // Converted TR-3Bs stay 2D on purpose (mirror of flights.js): the Easter
    // egg IS the triangle and there is no GLB for it, so the model handoff is
    // suppressed. The billboard keeps rendering, so the contact still satisfies
    // the getNearby/getDetectableObjects visibility guards.
    if (useModels && dr && modelEligible.has(icao24) && !isTr3b(icao24)) {
      _ensureModel(icao24);
      const model = _models.get(icao24);
      const ownsVisual = _driveFleetModelHandoff(
        icao24,
        model,
        bb,
        dr,
        course,
        () => {
          applyAircraftModelTreatment({
            model,
            // IR boost must survive the per-tick treatment write; boosted
            // models also skip the recession fade (mirror of flights.js —
            // billboards keep their normal fade, hot MODELS stay full-strength).
            baseColor: _presentation.irBoost ? Cesium.Color.WHITE : _modelColor(icao24),
            alpha: _presentation.irBoost ? 1 : treatment.alpha,
          });
        },
      );
      if (ownsVisual) continue; // skip billboard rotation
    }

    if ((!S._cockpitContactMode || isCockpitNear) && (doRotations || revealed)) {
      const rot = screenProjectedRotation(scene, bb.position, course, bb.rotation);
      if (rot !== null && Math.abs(rot - bb.rotation) > 0.002) {
        bb.rotation = rot;
      }
    }
  }
}

/**
 * Build a public descriptor for one aircraft using its best current position
 * (dead-reckoned when history exists, billboard position otherwise).
 * @param {string} icao24 - ICAO hex identifier of the aircraft.
 * @returns {{icao24: string, callsign: string|null, position: Cesium.Cartesian3, latitude: number, longitude: number, altitudeM: number, velocityMps: number|null, track: number|null}|null}
 *   Descriptor with a cloned position, or null if the aircraft is unknown.
 */
export function _describeFlight(icao24) {
  const info = S._flightData.get(icao24);
  const bb = S._billboards.get(icao24);
  const basePos = _dr.deadReckon(icao24) || (bb ? bb.position : null);
  if (!basePos) return null;
  const displayed = displayedKinematics({
    derivedSpeedMps: _dr.last.speedMps,
    derivedTrackDeg: _dr.last.courseDeg,
    reportedSpeedMps: info?.speedMps,
    reportedTrackDeg: info?.track,
  });
  const carto = Cesium.Cartographic.fromCartesian(basePos, Cesium.Ellipsoid.WGS84, _scratchCarto);
  if (!carto) return null;
  return {
    icao24,
    callsign: _toCleanText(info?.callsign) || null,
    // Additive: the label chain's middle link, trimmed like `callsign`, so
    // getTrackedSubject and the voice narration can read it straight off the
    // descriptor instead of reaching back into `_flightData`.
    registration: _toCleanText(info?.registration) || null,
    position: Cesium.Cartesian3.clone(basePos),
    latitude: Cesium.Math.toDegrees(carto.latitude),
    longitude: Cesium.Math.toDegrees(carto.longitude),
    // Keep the cockpit readout on the reported aviation altitude. Render
    // terrain height is a separate visual datum and may be below zero.
    altitudeM: Number.isFinite(info?.altitudeM) ? info.altitudeM : carto.height,
    renderAltitudeM: Number.isFinite(info?.renderAltitudeM) ? info.renderAltitudeM : carto.height,
    onGround: info?.onGround === true,
    velocityMps: displayed.speedMps,
    track: displayed.trackDeg,
    stale: Boolean(S._missingPolls.get(icao24) || S._backoff),
  };
}
