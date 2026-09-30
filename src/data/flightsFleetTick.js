// Moved out of flights.js (flightsFleetTick).

import { advanceProjectedSpriteFocus, focusNowMs, getFocusTarget, nearFarScalarValueAtDistance } from './focusDeemphasis.js';
import { cameraPoseSignature, horizonOccluder, screenProjectedRotation } from './iconOrientation.js';
import { isTr3b, tr3bTypeLabel } from './tr3bRegistry.js';
import * as Cesium from 'cesium';
import { isMilitaryIcao } from './militaryRegistry.js';
import { applyAircraftBillboardTreatment, applyAircraftModelTreatment } from './aircraftRecession.js';
import { TRACKED_ICON_PX, aircraftIcon } from './aircraftIcons.js';
import { courseSlewCapDps, displayedKinematics, limitCourseStep } from './motionModel.js';
import { _routeIsPlausible, _toCleanText } from './flightsApi.js';
import { _refreshCockpitNearContacts } from './flightsCockpit.js';
import { COCKPIT_CIVILIAN_COLOR, COURSE_MAX_DPS, COURSE_SLEW_DT_MAX_SEC, FLEET_DR_INTERVAL_MS, MIL_TINT, ROTATION_REFRESH_MS } from './flightsConstants.js';
import { _floorGroundedDisplayPosition } from './flightsDisplayFloor.js';
import { _drainIrReloadQueue, _ensureModel, _fleetBillboardColor, _fleetBillboardScale, _modelAddDistM, _modelCap, _modelColor, _modelKeepDistM, _modelRegimeActive, _releaseModel, _releaseModels } from './flightsFleetModels.js';
import { _dr, _driveFleetModelHandoff, _iconKind, _modelOwnsVisual, _presentation } from './flightsInstances.js';
import { S, _billboardLimbScale, _displayCourse, _modelPending, _models, _scratchCarto, _scratchFleetPos, _scratchModelBS } from './flightsState.js';

export function _fleetTick() {
  if (!S._viewer || !S._billboardCollection || !S._billboardCollection.show) return;
  const scene = S._viewer.scene;
  const camera = S._viewer.camera;
  const nowMs = focusNowMs(Date.now());

  // (The tracked trail head is now the per-frame _trailHeadEntity segment — no 1 Hz
  // primitive rebuild needed here anymore.)

  if ((nowMs - S._lastFleetTickMs) < FLEET_DR_INTERVAL_MS) return;
  const tickDtSec = S._lastFleetTickMs
    ? Math.min(COURSE_SLEW_DT_MAX_SEC, (nowMs - S._lastFleetTickMs) / 1000)
    : 0.08;
  S._lastFleetTickMs = nowMs;

  _drainIrReloadQueue(); // bounded per-tick slice of any pending boost-flip reload
  if (S._cockpitContactMode) _refreshCockpitNearContacts();
  const poseSig = cameraPoseSignature(camera);
  // Only the nearby Cockpit silhouettes need projected course; far dots are
  // rotation-free. The per-contact gate below keeps the pip path cheap.
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

  // 3D-model eligibility: by DISTANCE (the mode's add/keep band), with ON-SCREEN PRIORITY under the
  // cap. FOUR passes, visible-first, so the slots are spent on what you can see: (1) KEEP on-screen
  // already-modeled (hysteresis for visible planes); (2) ADD on-screen new inside the add radius,
  // nearest first; (3) KEEP off-screen already-modeled; (4) ADD off-screen new with leftover slots
  // (so a plane just off the cone still models — the "planes right next to me aren't 3D" complaint).
  // Crucially KEEP is SPLIT by frustum: an off-screen retained model (pass 3) can never starve an
  // on-screen plane that wants one (passes 1–2) — a single KEEP-everything pass could fill the cap
  // with off-screen retained models. Pure-distance let off-screen planes eat the cap; pure-frustum
  // filtering dropped near off-screen planes entirely. This does both right.
  let modelEligible = null;
  if (useModels) {
    const cap = _modelCap();
    const camPos = camera.positionWC;
    const addM = _modelAddDistM();
    const addDistSq = addM * addM;
    const keepM = _modelKeepDistM();
    const keepDistSq = keepM * keepM;
    const cull = camera.frustum.computeCullingVolume(camPos, camera.directionWC, camera.upWC);
    // Candidates = planes within the KEEP radius, nearest first, each tagged with on-screen-ness.
    const cand = [];
    for (const [icao, bb] of S._billboards) {
      if (icao === S._trackedIcao) continue;
      // A converted TR-3B renders as a billboard and can never take a model, so
      // it must not occupy a CAP SLOT either — excluded here at selection time,
      // not just at the handoff below, or accumulated conversions would starve
      // ordinary contacts of 3D models. (The handoff guard stays as defence.)
      if (isTr3b(icao)) continue;
      // Ground planes compete for model slots like everyone else (owner decision
      // 2026-07-03: "3D mode is respected regardless of whether a plane is on the
      // ground or in the air — no distinction"). The cap + nearest-first ordering
      // below already bound airport clusters; grounded placement is handled by the
      // one-shot ground snap in _modelDisplayPosition.
      const d2 = Cesium.Cartesian3.distanceSquared(camPos, bb.position);
      if (d2 > keepDistSq) continue; // beyond the keep radius → never eligible
      Cesium.Cartesian3.clone(bb.position, _scratchModelBS.center);
      cand.push([icao, d2, cull.computeVisibility(_scratchModelBS) !== Cesium.Intersect.OUTSIDE]);
    }
    cand.sort((a, b) => a[1] - b[1]); // nearest first
    if (cand.length > cap && (nowMs - S._lastModelCapWarnMs) > 5000) {
      console.warn(`[Data:Flights] ${cand.length} planes in 3D range; capped at ${cap} (${S._models3dMode}). On-screen planes are prioritized.`);
      S._lastModelCapWarnMs = nowMs;
    }
    modelEligible = new Set();
    // 1. KEEP on-screen already-modeled (visible retained — no flicker for what you can see).
    for (const [icao, , inF] of cand) { if (modelEligible.size >= cap) break; if (inF && _models.has(icao)) modelEligible.add(icao); }
    // 2. ADD on-screen NEW inside the add radius, nearest first (visible additions win the cap).
    for (const [icao, d2, inF] of cand) { if (modelEligible.size >= cap) break; if (inF && d2 <= addDistSq && !modelEligible.has(icao)) modelEligible.add(icao); }
    // 3. KEEP off-screen already-modeled (hysteresis, but LOWER priority than anything visible — so a
    //    retained off-screen model can never starve an on-screen plane that wants one; dropping it is
    //    invisible and it re-adds the moment it's back in view).
    for (const [icao, , inF] of cand) { if (modelEligible.size >= cap) break; if (!inF && _models.has(icao)) modelEligible.add(icao); }
    // 4. ADD off-screen NEW inside the add radius with any leftover slots.
    for (const [icao, d2, inF] of cand) { if (modelEligible.size >= cap) break; if (!inF && d2 <= addDistSq && !modelEligible.has(icao)) modelEligible.add(icao); }
    const toRelease = [];
    for (const icao of _models.keys()) {
      if (icao !== S._trackedIcao && !modelEligible.has(icao)) toRelease.push(icao);
    }
    for (const icao of toRelease) _releaseModel(icao);
  }

  for (const [icao24, bb] of S._billboards) {
    if (icao24 === S._trackedIcao) continue; // tracked entity owns its own motion

    const info = S._flightData.get(icao24);

    const dr = _dr.deadReckon(icao24, _scratchFleetPos);
    // The dead-reckoned point drifts away from the fix whose cell supplied the
    // height, so a grounded contact's sprite ends up under the mesh it taxied
    // (or coasted) over. Re-floor at the DISPLAYED coordinate — read-only, and
    // never while a 3D model owns the visual (T7).
    const display = _floorGroundedDisplayPosition(icao24, info, dr, _modelOwnsVisual(icao24), nowMs);
    // Gate the write — assigning Billboard.position dirties the whole
    // collection's vertex buffer, so skip sub-meter moves.
    if (display && Cesium.Cartesian3.distanceSquared(display, bb.position) > 1.0) {
      bb.position = display;
    }

    // Round 6: occlusion-test a LIFTED point for contacts rendering below
    // (or within a wingspan of) the ellipsoid — EllipsoidalOccluder judges a
    // sub-ellipsoid point near the limb "beyond the horizon" and the fleet
    // pass would hide a plane that is really just low over high-N terrain
    // waiting for its floor to warm (ATL grounded contacts at geoid −31 m).
    const beyondHorizon = !occluder.isPointVisible(info?.cullPosition || bb.position);
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

    // One order-independent write site composes freshness × focus × limb haze
    // for alpha, and base class/ground scale × limb taper for scale. Cesium's
    // locked NearFarScalar remains a separate multiplicative stage. This
    // narrowly amends always-visible rendering without count culling or zero
    // alpha; nearer focus behavior remains tunable rather than universal.
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
    const baseColor = S._cockpitContactMode && !isCockpitNear
      ? (isMilitaryIcao(icao24) ? MIL_TINT : COCKPIT_CIVILIAN_COLOR)
      : _fleetBillboardColor(icao24);
    const treatment = applyAircraftBillboardTreatment({
      billboard: bb,
      baseScale: S._cockpitContactMode && !isCockpitNear ? 1 : _fleetBillboardScale(icao24, info?.klass),
      baseAlpha: S._missingPolls.get(icao24) ? 0.45 : 1,
      baseColor,
      focusFactor: focus.factor,
      cameraDistanceM,
      cameraHeightM: camera.positionCartographic?.height,
    });
    _billboardLimbScale.set(bb, treatment.factors.scale);
    // Two-tier glyph raster (owner playtest 2026-08-16): the billboard atlas
    // has no mipmaps, so no single texture stays crisp across the ~25–150
    // device-px range scaleByDistance produces. Swap between the 64 px fleet
    // raster and the 192 px close raster on the billboard's ACTUAL on-screen
    // size — post-treatment bb.scale, so focus/limb recession counts — with
    // hysteresis so zoom oscillation never thrashes the atlas.
    if (!S._cockpitContactMode || isCockpitNear) {
      const glyphDevPx = (bb.width || 20) * (bb.scale || 1)
        * distanceScale * (globalThis.devicePixelRatio || 1);
      const wantLarge = bb._gevIconLarge ? glyphDevPx > 56 : glyphDevPx > 76;
      if (wantLarge !== !!bb._gevIconLarge) {
        bb._gevIconLarge = wantLarge;
        bb.image = aircraftIcon(_iconKind(icao24, info?.klass), wantLarge ? TRACKED_ICON_PX : undefined);
      }
    }

    // Smoothed display course: the path direction _dr.deadReckon just reported
    // for THIS aircraft (nothing else calls _dr.deadReckon in between), rate-
    // limited so segment-boundary course steps glide instead of snapping.
    // The slew cap eases toward COURSE_MIN_DPS at low speed, and a hovering
    // aircraft (hold flag) keeps its previous nose direction outright.
    const rawCourse = _dr.last.courseDeg != null ? _dr.last.courseDeg : ((info && info.true_track) || 0);
    const prevCourse = _displayCourse.get(icao24);
    const course = (_dr.last.courseHold && prevCourse != null)
      ? prevCourse
      : limitCourseStep(
        prevCourse, rawCourse,
        courseSlewCapDps(_dr.last.speedMps != null ? _dr.last.speedMps : ((info && info.velocity) ?? NaN), COURSE_MAX_DPS),
        tickDtSec,
      );
    _displayCourse.set(icao24, course);

    // 3D model takes over from the billboard for in-view planes (modelEligible). GAP-PROOF: the
    // billboard stays shown until the model is actually READY to render, so a plane is never both
    // iconless AND modelless (the "planes vanish when 3D turns on" bug). Position the model every
    // tick regardless so it's framed the instant it becomes ready.
    // Converted TR-3Bs stay 2D on purpose: the Easter egg IS the triangle, and
    // there is no GLB for it, so the model handoff is suppressed rather than
    // fed a stand-in mesh. The billboard keeps rendering (and keeps satisfying
    // the getNearby/getDetectableObjects `bb.show` visibility guards), so a
    // converted contact still works in Contacts and Cockpit.
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
            // IR boost must survive the per-tick treatment write — otherwise
            // any alpha change would repaint the ordinary tint over the hot
            // white. Boosted models also skip the recession fade: hot targets
            // stay full-strength at any range (billboards keep their normal
            // fade — full-opacity glyph walls read as overwhelming).
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
 * @param {string} icao24 - ICAO 24-bit transponder address.
 * @returns {{icao24: string, callsign: string|null, position: Cesium.Cartesian3, latitude: number, longitude: number, altitudeM: number, velocityMps: number|null, track: number|null}|null}
 *   Descriptor with a cloned position, or null if the aircraft is unknown.
 */
export function _describeFlight(icao24) {
  // DATA, NOT PIXELS — deliberately UNFLOORED (2026-08-19). The display floor
  // lifts grounded contacts onto the visible mesh so the sprite you see is not
  // buried; that is a rendering correction, not a measurement. This descriptor
  // feeds query/analyst/subject APIs — `findByQuery` (voice track-by-name),
  // `getTrackedInfo` (cockpit + readout altitude), `getTrackedSubject`
  // (proximity counts and distances) — where the honest answer is what the
  // aircraft REPORTED, not where its icon was nudged to avoid clipping tiles.
  // `altitudeM` is therefore the barometric/aviation value and `renderAltitudeM`
  // the fix-time datum, neither of them the floored display height. No
  // user-visible surface renders `position` as the plane's on-screen location —
  // every visual consumer reads the floored per-frame cache instead (see
  // `_trackedDisplayPosition`). If that ever changes, floor this path too.
  const info = S._flightData.get(icao24);
  const bb = S._billboards.get(icao24);
  const basePos = _dr.deadReckon(icao24) || (bb ? bb.position : null);
  if (!basePos) return null;
  const displayed = displayedKinematics({
    derivedSpeedMps: _dr.last.speedMps,
    derivedTrackDeg: _dr.last.courseDeg,
    reportedSpeedMps: info?.velocity,
    reportedTrackDeg: info?.true_track,
  });
  const carto = Cesium.Cartographic.fromCartesian(basePos, Cesium.Ellipsoid.WGS84, _scratchCarto);
  if (!carto) return null;
  return {
    icao24,
    callsign: String(info?.callsign || '').trim() || null,
    position: Cesium.Cartesian3.clone(basePos),
    latitude: Cesium.Math.toDegrees(carto.latitude),
    longitude: Cesium.Math.toDegrees(carto.longitude),
    // The cockpit instrument reports aviation altitude, not the Cesium
    // ellipsoid height of the camera/ground-clamped render position. The
    // latter can be slightly negative over terrain near the surface.
    altitudeM: Number.isFinite(info?.altitude) ? info.altitude : carto.height,
    renderAltitudeM: Number.isFinite(info?.renderAltitudeM) ? info.renderAltitudeM : carto.height,
    onGround: info?.onGround === true,
    velocityMps: displayed.speedMps,
    track: displayed.trackDeg,
    stale: Boolean(S._missingPolls.get(icao24) || S._backoff),
    airline: info?.airline ?? null,
    // CLASS label follows the TR-3B conversion so every downstream card
    // (cockpit, Contacts, analyst) agrees with the triangle on screen.
    typeName: tr3bTypeLabel(icao24, info?.typeName ?? null),
    typeCode: tr3bTypeLabel(icao24, info?.typeCode ?? null),
    // IDENTITY, deliberately NOT converted: registration is the airframe's tail
    // number and feeds `_contactLabel`'s callsign → registration → hex chain, so
    // a converted contact keeps the label convention every other contact uses.
    // Trimmed like `callsign` above so every consumer (cockpit readout, voice
    // narration, getTrackedSubject) can use it as a label link without
    // re-guarding a whitespace-only enrichment value.
    registration: _toCleanText(info?.registration) || null,
    origin: info?.route && _routeIsPlausible(icao24, info.route) ? info.route.origin.code : null,
    destination: info?.route && _routeIsPlausible(icao24, info.route) ? info.route.destination.code : null,
    route: info?.route && _routeIsPlausible(icao24, info.route) ? {
      origin: { ...info.route.origin },
      destination: { ...info.route.destination },
    } : null,
  };
}
