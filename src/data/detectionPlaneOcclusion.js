import * as Cesium from 'cesium';

/**
 * @module detectionPlaneOcclusion
 *
 * Screen-space masking for the Universal Detection Overlay's CCTV monitor
 * plane. Answers one question: "does a detectable object's on-screen
 * position fall inside the CCTV monitor plane's on-screen rectangle?" — if
 * so, its bracket/label doesn't paint, so the plane always reads as one
 * solid, uncontaminated screen, regardless of the object's real 3D depth
 * relative to the plane.
 *
 * Revision history: the original (2026-09) version was a pure 3D
 * ray-vs-finite-rectangle DEPTH test — it only hid objects strictly BEHIND
 * the plane along the camera's line of sight. That left objects nearer to
 * the *viewer's* camera than the monitor plane, but still landing inside
 * its screen rectangle, drawing their labels over the live video (field
 * report: VEH-XXXX traffic labels still visibly contaminated the CCTV
 * screen after that fix). Traffic dots sit on the real road surface the
 * CCTV camera is pointed at, so this is the common case, not an edge case
 * — road-surface geometry is very often nearer to the operator's viewing
 * camera than the monitor plane it's displayed on.
 *
 * Masking by screen-space containment instead is a provable superset of
 * the old depth test for the "behind" case: perspective projection maps a
 * planar convex rectangle's interior to the interior of its projected
 * screen quad (projective transformations preserve convexity/betweenness),
 * and an object behind the plane within its 3D bounds shares the exact
 * same camera ray — and therefore the exact same screen pixel — as the
 * ray/plane intersection point the old test located. So every object the
 * old test hid, this one hides too, plus every "in front but overlapping"
 * object the field report was about.
 *
 * Still zero scene queries: the plane's four corners are projected through
 * the frame's already-computed view-projection matrix using the same
 * flattened-scalar approach `detection.js` uses for every object (no
 * `SceneTransforms` call), and this projection runs once per plane per
 * frame (at most one plane can be showing at a time — see
 * `cctv.js#activeCctvOcclusionPlanes`), not once per object — preserving
 * `cctv.js`'s zero-raycast-in-steady-state invariant.
 */

/**
 * Projects one ECEF point through a flattened view-projection matrix into
 * screen-space pixel coordinates — identical component indices and
 * NDC-to-pixel mapping to `detection.js`'s own per-object projection, so
 * an object and a plane corner projected from the same frame always agree.
 * @param {Cesium.Cartesian3} pos
 * @param {Cesium.Matrix4|Array<number>} vp - Column-major 16-element matrix.
 * @param {number} width
 * @param {number} height
 * @returns {{x:number,y:number}|null} null when the point is behind the camera.
 */
function projectToScreen(pos, vp, width, height) {
  const clipW = vp[3] * pos.x + vp[7] * pos.y + vp[11] * pos.z + vp[15];
  if (clipW <= 0) return null;
  const invW = 1 / clipW;
  return {
    x: ((vp[0] * pos.x + vp[4] * pos.y + vp[8] * pos.z + vp[12]) * invW * 0.5 + 0.5) * width,
    y: (0.5 - (vp[1] * pos.x + vp[5] * pos.y + vp[9] * pos.z + vp[13]) * invW * 0.5) * height,
  };
}

/**
 * One corner of a rectangular plane: center + right*rSign*halfWidth +
 * up*uSign*halfHeight. Fresh objects per call — this runs at most a
 * handful of times per frame (once per corner, per showing plane, and at
 * most one plane ever shows at once), not per detectable object, so the
 * zero-allocation discipline `isPointInScreenQuad`'s per-object caller
 * needs doesn't apply here.
 * @param {Object} plane - See `computeOcclusionPlaneScreenQuads`'s plane shape.
 * @param {number} rSign - +1 or -1.
 * @param {number} uSign - +1 or -1.
 * @returns {Cesium.Cartesian3}
 */
function planeCorner(plane, rSign, uSign) {
  const right = Cesium.Cartesian3.multiplyByScalar(
    plane.right, rSign * plane.halfWidth, new Cesium.Cartesian3()
  );
  const up = Cesium.Cartesian3.multiplyByScalar(
    plane.up, uSign * plane.halfHeight, new Cesium.Cartesian3()
  );
  const corner = Cesium.Cartesian3.add(plane.center, right, new Cesium.Cartesian3());
  return Cesium.Cartesian3.add(corner, up, corner);
}

/**
 * Projects one occlusion plane's rectangle into a 4-point screen-space quad
 * (winding order: top-left, top-right, bottom-right, bottom-left — a
 * simple, non-self-intersecting loop since the source rectangle is planar
 * and convex).
 * @param {Object} plane - `{center, right, up, halfWidth, halfHeight}`, see
 *   `cctv.js#activeCctvOcclusionPlanes`'s return shape (its `normal` field
 *   is unused here — only needed by the old depth test).
 * @param {Cesium.Matrix4|Array<number>} viewProjection
 * @param {number} width
 * @param {number} height
 * @returns {Array<{x:number,y:number}>|null} null when any corner is behind
 *   the camera — treated as "plane not currently on screen", so it masks
 *   nothing rather than producing a nonsensical partial quad.
 */
export function projectPlaneScreenQuad(plane, viewProjection, width, height) {
  const corners = [
    planeCorner(plane, -1, 1),
    planeCorner(plane, 1, 1),
    planeCorner(plane, 1, -1),
    planeCorner(plane, -1, -1),
  ];
  const quad = [];
  for (let i = 0; i < corners.length; i++) {
    const p = projectToScreen(corners[i], viewProjection, width, height);
    if (!p) return null;
    quad.push(p);
  }
  return quad;
}

/**
 * Precomputes screen-space quads for every currently-showing occlusion
 * plane. Call once per frame, before the per-object loop — plane geometry
 * doesn't depend on any individual detectable object.
 * @param {Array<Object>} planes
 * @param {Cesium.Matrix4|Array<number>} viewProjection
 * @param {number} width
 * @param {number} height
 * @returns {Array<Array<{x:number,y:number}>>} One quad per plane that's
 *   actually on screen (planes fully behind the camera are dropped).
 */
export function computeOcclusionPlaneScreenQuads(planes, viewProjection, width, height) {
  const quads = [];
  for (let i = 0; i < planes.length; i++) {
    const quad = projectPlaneScreenQuad(planes[i], viewProjection, width, height);
    if (quad) quads.push(quad);
  }
  return quads;
}

/**
 * Point-in-convex-quadrilateral test via consistent edge cross-product
 * signs. Works for either screen-space winding direction as long as it's
 * consistent around the quad, which `projectPlaneScreenQuad`'s fixed
 * corner order always produces for an unclipped rectangle.
 * @param {number} x
 * @param {number} y
 * @param {Array<{x:number,y:number}>} quad - Exactly 4 points.
 * @returns {boolean}
 */
function isPointInScreenQuad(x, y, quad) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross === 0) continue; // exactly on the edge line — treat as inside
    const edgeSign = cross > 0 ? 1 : -1;
    if (sign === 0) sign = edgeSign;
    else if (edgeSign !== sign) return false;
  }
  return true;
}

/**
 * Tests whether screen point (x, y) falls inside ANY of the given
 * precomputed occlusion-plane screen quads. Short-circuits on the first
 * hit — callers only need a boolean. An empty `screenQuads` array (the
 * overwhelmingly common case: no CCTV plane showing) never masks anything.
 * @param {number} x
 * @param {number} y
 * @param {Array<Array<{x:number,y:number}>>} screenQuads - From
 *   `computeOcclusionPlaneScreenQuads`.
 * @returns {boolean}
 */
export function isPointMaskedByPlanesOnScreen(x, y, screenQuads) {
  for (let i = 0; i < screenQuads.length; i++) {
    if (isPointInScreenQuad(x, y, screenQuads[i])) return true;
  }
  return false;
}
