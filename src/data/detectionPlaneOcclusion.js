import * as Cesium from 'cesium';

/**
 * @module detectionPlaneOcclusion
 *
 * Pure ray-vs-finite-rectangle occlusion test for the Universal Detection
 * Overlay (`detection.js`). Answers one question: "does the line of sight
 * from the render camera to a detectable object's position pass through a
 * given rectangular plane (e.g. a CCTV monitor plane) before reaching that
 * object?" — if so, the object is behind the plane and its bracket/label
 * should not paint, exactly as if a real opaque screen were in the way.
 *
 * Deliberately NOT `scene.pickFromRay`: `cctv.js`'s `runActivationObstructionProbe`
 * documents a zero-raycast-in-steady-state invariant for that module (one
 * raycast per camera activation, never per frame). A per-object-per-frame
 * `scene.pickFromRay` call for every traffic/aircraft/vessel candidate would
 * violate that invariant outright. This module instead does plain vector
 * math against a plane's already-known center/orientation/half-extents
 * (read once per frame from the live entity, see `cctv.js#getOcclusionPlane`)
 * — zero scene queries, same purity standard as `cctvGizmo.js`'s drag math.
 *
 * Re-evaluated every frame per object: an object that moves in front of the
 * plane (or out of its rectangular bounds) is un-occluded on the very next
 * frame — this is not a permanent hide, and it only ever affects objects
 * whose line of sight to the camera actually crosses the plane's bounds.
 *
 * @module detectionPlaneOcclusion
 */

// Below this |dir·normal|, the view ray is nearly parallel to the plane and
// the intersection parameter is numerically unstable (races toward
// infinity) — treat as "does not hit the plane" rather than risk a false
// occlusion from a razor-thin grazing angle. Mirrors cctvGizmo.js's
// GRAZING_DOT_MIN guard for the same underlying ray/plane formula.
const GRAZING_DOT_MIN = 0.02;

const scratchDir = new Cesium.Cartesian3();
const scratchToPlane = new Cesium.Cartesian3();
const scratchHit = new Cesium.Cartesian3();
const scratchOffset = new Cesium.Cartesian3();

/**
 * Tests whether `targetPos` is occluded from `observerPos` by one finite
 * rectangular plane.
 * @param {Cesium.Cartesian3} observerPos - Render camera position (ECEF).
 * @param {Cesium.Cartesian3} targetPos - Candidate object position (ECEF).
 * @param {{center: Cesium.Cartesian3, normal: Cesium.Cartesian3,
 *   right: Cesium.Cartesian3, up: Cesium.Cartesian3, halfWidth: number,
 *   halfHeight: number}} plane - Plane geometry; `normal`/`right`/`up` must
 *   be unit and mutually orthogonal (as produced by
 *   `cctv.js#getOcclusionPlane`).
 * @returns {boolean} True when the observer→target ray crosses the plane's
 *   rectangular bounds strictly before reaching the target.
 */
export function isPointOccludedByPlane(observerPos, targetPos, plane) {
  const dir = Cesium.Cartesian3.subtract(targetPos, observerPos, scratchDir);
  const targetDistance = Cesium.Cartesian3.magnitude(dir);
  if (targetDistance < 1e-6) return false;
  Cesium.Cartesian3.divideByScalar(dir, targetDistance, dir);

  const denom = Cesium.Cartesian3.dot(dir, plane.normal);
  if (Math.abs(denom) < GRAZING_DOT_MIN) return false;

  const toPlane = Cesium.Cartesian3.subtract(plane.center, observerPos, scratchToPlane);
  const t = Cesium.Cartesian3.dot(toPlane, plane.normal) / denom;
  // t <= 0: plane is behind the observer. t >= targetDistance: the target is
  // at or in front of the plane along this ray, not behind it.
  if (t <= 0 || t >= targetDistance) return false;

  const hit = Cesium.Cartesian3.multiplyByScalar(dir, t, scratchHit);
  Cesium.Cartesian3.add(observerPos, hit, hit);
  const offset = Cesium.Cartesian3.subtract(hit, plane.center, scratchOffset);
  const u = Cesium.Cartesian3.dot(offset, plane.right);
  const v = Cesium.Cartesian3.dot(offset, plane.up);
  return Math.abs(u) <= plane.halfWidth && Math.abs(v) <= plane.halfHeight;
}

/**
 * Tests whether `targetPos` is occluded from `observerPos` by ANY plane in
 * `planes`. Short-circuits on the first hit — callers only need a boolean.
 * @param {Cesium.Cartesian3} observerPos
 * @param {Cesium.Cartesian3} targetPos
 * @param {Array<Object>} planes - Plane geometries, see `isPointOccludedByPlane`.
 * @returns {boolean}
 */
export function isOccludedByAnyPlane(observerPos, targetPos, planes) {
  for (let i = 0; i < planes.length; i++) {
    if (isPointOccludedByPlane(observerPos, targetPos, planes[i])) return true;
  }
  return false;
}
