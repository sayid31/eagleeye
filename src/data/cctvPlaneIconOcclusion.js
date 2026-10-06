// Hides CCTV camera icons that would be drawn on top of the live monitor plane.
//
// Icons are always-on-top billboards (disableDepthTestDistance: INFINITY — the
// far-zoom submerge fix in cctvLayerLifecycle.js), so the depth test can never
// let the plane cover them. Instead, while the live plane shows, an icon whose
// screen position falls inside the plane's on-screen quad is hidden, leaving
// only the live frame in that region. Icons outside the quad are untouched.

/**
 * True when point `p` lies inside the convex quad (either winding).
 * @param {{x:number,y:number}} p
 * @param {Array<{x:number,y:number}>} quad - 4 corners in order.
 * @returns {boolean}
 */
export function pointInConvexQuad(p, quad) {
  let sign = 0;
  for (let i = 0; i < quad.length; i += 1) {
    const a = quad[i];
    const b = quad[(i + 1) % quad.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * Whether an icon should be shown: horizon-visible and not under the plane.
 * @param {{horizonVisible?: boolean, iconUnderPlane?: boolean}} record
 * @returns {boolean}
 */
export function iconShouldShow(record) {
  return record.horizonVisible !== false && !record.iconUnderPlane;
}

function writeShow(record) {
  const bb = record.billboard;
  if (!bb) return;
  const show = iconShouldShow(record);
  if (bb.show !== show) bb.show = show;
}

/**
 * Hides icons under the active camera's on-screen plane quad.
 * @param {Object} args
 * @param {Object[]} args.records - Camera records.
 * @param {Object|null} args.activeRecord - Record whose plane is showing.
 * @param {(position: Object) => ({x:number,y:number}|undefined)} args.project
 *   World -> window projector; must return a value safe to retain (not a
 *   shared scratch object) or undefined when off-screen/behind the camera.
 */
export function hideIconsUnderPlane({ records, activeRecord, project }) {
  const fp = activeRecord?.frustumPositions;
  const quad = fp ? [fp.tl, fp.tr, fp.br, fp.bl].map((c) => project(c)) : null;
  const quadOk = !!quad && quad.every(Boolean);
  for (const record of records) {
    const bb = record.billboard;
    if (!bb) continue;
    let under = false;
    if (quadOk && record.horizonVisible !== false) {
      const screen = project(bb.position);
      under = !!screen && pointInConvexQuad(screen, quad);
    }
    if (record.iconUnderPlane !== under) {
      record.iconUnderPlane = under;
      writeShow(record);
    }
  }
}

/**
 * Restores every icon hidden by hideIconsUnderPlane.
 * @param {Object[]} records - Camera records.
 */
export function restoreIconsUnderPlane(records) {
  for (const record of records) {
    if (!record.iconUnderPlane) continue;
    record.iconUnderPlane = false;
    writeShow(record);
  }
}
