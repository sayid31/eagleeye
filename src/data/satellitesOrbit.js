// Moved out of satellites.js (satellitesOrbit).

import * as Cesium from 'cesium';
import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate } from 'satellite.js';
import { orbitTrackFromRecord, scoreSatelliteNameMatch } from './satelliteTleLookup.js';
import { ISS_NORAD, ORBIT_PATH_STEPS } from './satellitesConstants.js';
import { internationalDesignatorYear } from './satellitesIss.js';
import { S, _scratchRingRotation } from './satellitesState.js';

/**
 * Build the rigid ECEF transform that keeps an orbit path baked at one GMST
 * aligned with live SGP4 positions propagated at another epoch.
 * @param {number} gmstAtBake GMST used when the path positions were baked.
 * @param {Date} nowDate Epoch whose rotating-Earth frame should be displayed.
 * @param {Cesium.Matrix4} [result] Optional matrix to update in place.
 * @returns {Cesium.Matrix4} Z-rotation from bake-time ECEF to current ECEF.
 */
export function orbitFrameModelMatrix(
  gmstAtBake,
  nowDate,
  result = new Cesium.Matrix4(),
) {
  const deltaGmst = gstime(nowDate) - gmstAtBake;
  const rotation = Cesium.Matrix3.fromRotationZ(-deltaGmst, _scratchRingRotation);
  return Cesium.Matrix4.fromRotationTranslation(
    rotation,
    Cesium.Cartesian3.ZERO,
    result,
  );
}

/**
 * Parse TLE text into array of { name, line1, line2 } objects.
 */
export function parseTLE(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const result = [];
  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (line1.startsWith('1 ') && line2.startsWith('2 ')) {
      result.push({ name, line1, line2 });
    }
  }
  return result;
}

/**
 * Propagate satellite position at a given JS Date.
 * Returns geodetic position plus inertial speed from the same SGP4 propagation
 * epoch, or null on error.
 */
export function propagatePosition(satrec, date) {
  try {
    const posVel = propagate(satrec, date);
    if (!posVel.position || typeof posVel.position === 'boolean') return null;

    const gmst = gstime(date);
    const geo = eciToGeodetic(posVel.position, gmst);
    const velocity = posVel.velocity && typeof posVel.velocity !== 'boolean'
      ? posVel.velocity
      : null;
    const speedMps = velocity
      ? Math.hypot(velocity.x, velocity.y, velocity.z) * 1000
      : null;

    return {
      longitude: degreesLong(geo.longitude),
      latitude: degreesLat(geo.latitude),
      altitude: geo.height * 1000, // km → meters
      speedMps: Number.isFinite(speedMps) ? speedMps : null,
    };
  } catch {
    return null;
  }
}

export function orbitalPeriodSeconds(satrec) {
  const meanMotion = satrec.no * (1440 / (2 * Math.PI));
  return 86400 / Math.max(meanMotion, 0.1);
}

/**
 * Compute full orbital path as array of Cartesian3 positions.
 * Steps around one full orbit based on the satellite's mean motion.
 */
export function computeOrbitPath(satrec, referenceDate) {
  const periodSec = orbitalPeriodSeconds(satrec);
  const stepSec = periodSec / ORBIT_PATH_STEPS;

  const positions = [];
  const baseTime = referenceDate.getTime();
  // Fix GMST to reference time so the orbital ring closes.
  // Without this, Earth rotation during the orbit period (~24° for LEO)
  // shifts the end point west of the start, leaving a visible gap.
  const fixedGmst = gstime(referenceDate);

  for (let i = 0; i <= ORBIT_PATH_STEPS; i++) {
    const t = new Date(baseTime + i * stepSec * 1000);
    try {
      const posVel = propagate(satrec, t);
      if (!posVel.position || typeof posVel.position === 'boolean') continue;
      const geo = eciToGeodetic(posVel.position, fixedGmst);
      positions.push(Cesium.Cartesian3.fromDegrees(
        degreesLong(geo.longitude),
        degreesLat(geo.latitude),
        geo.height * 1000
      ));
    } catch { continue; }
  }

  return positions;
}

/**
 * Show orbital path for a satellite.
 *
 * RING FLICKER FIX: this is a one-instance Cesium.Primitive built
 * synchronously ONCE (asynchronous: false), then re-aligned to current GMST
 * each tick via its modelMatrix. The previous Entity-polyline approach
 * rebuilt geometry ASYNCHRONOUSLY on every positions assignment, which made
 * both the selected ring and the ISS ring blink once per second while the
 * rebuild was in flight. A rigid Z-rotation needs no rebuild at all.
 *
 * Why not a CallbackProperty entity (dynamic mode)? Verified in Cesium
 * 1.138 source: the dynamic polyline updater renders through a shared
 * PolylineCollection and applies only the fill material —
 * `depthFailMaterial` is silently dropped, losing the dimmed behind-Earth
 * segment. The Primitive keeps it via depthFailAppearance + the per-instance
 * depthFailColor attribute (same mechanism the entity STATIC batch uses):
 * bright where above the horizon, dimmed where behind the globe.
 */
export function _showOrbitPath(noradId, color) {
  if (S._orbitPaths.has(noradId)) return; // already showing

  const sat = S._catalog.get(noradId);
  if (!sat || !S._viewer) return;

  const bakeDate = new Date();
  const basePositions = computeOrbitPath(sat.satrec, bakeDate);
  if (basePositions.length < 2) return;

  const pathColor = color || Cesium.Color.CYAN;

  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.PolylineGeometry({
        positions: basePositions,
        width: noradId === ISS_NORAD ? 2.5 : 2.0,
        vertexFormat: Cesium.PolylineColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(pathColor.withAlpha(0.6)),
        depthFailColor: Cesium.ColorGeometryInstanceAttribute.fromColor(pathColor.withAlpha(0.35)),
      },
    }),
    appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
    depthFailAppearance: new Cesium.PolylineColorAppearance({ translucent: true }),
    asynchronous: false, // build this frame — no async-rebuild blink window
    allowPicking: false, // ring clicks fall through to satellites/deselect
  });
  S._viewer.scene.primitives.add(primitive);

  S._orbitPaths.set(noradId, {
    primitive,
    // Same Date object as computeOrbitPath's internal fixedGmst → identical
    // GMST value (gstime is pure), so delta starts at exactly 0 and the
    // initial identity modelMatrix is correct until the first ring tick.
    gmstAtBake: gstime(bakeDate),
  });
}

/**
 * Rotate every baked orbit ring from its bake-time ECEF snapshot to current
 * GMST (WS-D1). The baked ring is an inertial-frame snapshot frozen at
 * gmstAtBake; the live dot lives in true rotating-frame ECEF, so without this
 * the dot slides west off the ring at Earth-rotation rate (~0.25°/min).
 *
 * Sign derivation: a point fixed in inertial space keeps its right ascension
 * α, so its ECEF longitude λ = α − gmst DECREASES by ΔGMST as time advances
 * (it drifts WEST). Cesium.Matrix3.fromRotationZ(θ) rotates +X toward +Y,
 * i.e. INCREASES longitude by θ — so we rotate the baked points by −ΔGMST.
 * Mental check: ISS baked over Austin at t0; 10 min later Austin has rotated
 * east under the (inertial) ring, so the ring must sit further WEST in ECEF.
 *
 * Wraparound: gstime returns radians in [0, 2π), so the raw difference can be
 * off from the continuous ΔGMST — but only by exact multiples of 2π, which a
 * rotation cannot distinguish. Tiny negative deltas right after bake are
 * likewise harmless. No unwrapping needed.
 *
 * No SGP4 here — the rotation is applied as the ring primitive's modelMatrix
 * (exact compensation; WGS84 is rotationally symmetric about Z, so rotating
 * the baked curve rigidly equals rebaking from rotated points). modelMatrix
 * updates are synchronous uniforms — no geometry rebuild, no flicker. Post-
 * creation modelMatrix changes are supported for one-instance primitives in
 * 3D mode, which these rings are. In-place mutation is safe: Primitive.update
 * diffs modelMatrix against an internal clone.
 * @param {Date} nowDate Epoch used for current GMST.
 */
export function _updateOrbitPathRotations(nowDate) {
  if (S._orbitPaths.size === 0) return;

  for (const path of S._orbitPaths.values()) {
    if (!path.primitive) continue;
    orbitFrameModelMatrix(path.gmstAtBake, nowDate, path.primitive.modelMatrix);
  }
}

/**
 * Remove orbital path for a satellite.
 */
export function _hideOrbitPath(noradId) {
  const path = S._orbitPaths.get(noradId);
  if (path) {
    if (S._viewer) S._viewer.scene.primitives.remove(path.primitive); // remove() destroys
    S._orbitPaths.delete(noradId);
  }
}

/**
 * Return the current propagated position and one-orbit path for a catalog satellite.
 * @param {string|number} query NORAD id or mission/payload name.
 * @param {{launchTime?: string|null}} [options] Optional launch epoch used to reject namesakes from another launch year.
 * @returns {{noradId:number,name:string,current:object,periodSec:number,orbitPath:Cesium.Cartesian3[],positionAt:function(Date):object|null}|null}
 */
export function getSatelliteOrbitTrack(query, options = {}) {
  if (query === null || query === undefined || !S._catalog?.size) return null;
  const q = String(query).trim().toLowerCase();
  let noradId = /^\d+$/.test(q) ? Number(q) : null;
  if (noradId === null || !S._catalog.has(noradId)) {
    noradId = null;
    const launchYear = Number.isFinite(Date.parse(options.launchTime))
      ? new Date(options.launchTime).getUTCFullYear()
      : null;
    let bestScore = 0;
    for (const [id, sat] of S._catalog) {
      const designatorYear = internationalDesignatorYear(sat.satrec);
      if (launchYear !== null && designatorYear !== null && designatorYear !== launchYear) continue;
      const score = scoreSatelliteNameMatch(q, sat.name);
      if (score > bestScore) { bestScore = score; noradId = id; }
    }
    if (bestScore < 12) noradId = null;
  }
  if (noradId === null) return null;
  const sat = S._catalog.get(noradId);
  return orbitTrackFromRecord(sat.name, sat.satrec);
}
