// Pure visibility policy for CCTV coverage wireframes and viewshed fills.
//
// While a live monitor plane is showing, the plane is the only thing the
// operator should read: neighbor frustum lines and fills drawn across it
// contaminate the picture, and the active camera's own frustum lines add
// nothing once the frame is up. The one exception is ADJUST (calibration)
// mode, where the active frustum is the thing being edited.

/**
 * True when a live monitor plane is on screen for the selected camera.
 * @param {{enabled: boolean, showProjection: boolean, hasActive: boolean}} state
 * @returns {boolean}
 */
export function isLivePlaneOn({ enabled, showProjection, hasActive }) {
  return !!(enabled && showProjection && hasActive);
}

/**
 * Whether a camera's coverage wireframe polylines should be shown.
 * @param {Object} args
 * @param {boolean} args.enabled - CCTV layer enabled.
 * @param {boolean} args.livePlaneOn - See isLivePlaneOn.
 * @param {boolean} args.calibrating - ADJUST mode is on.
 * @param {boolean} args.isActive - This camera is the selected one.
 * @param {boolean} args.coverageOn - Coverage mode is not 'off'.
 * @param {boolean} args.inVisibleSet - Camera is in the neighbor cohort.
 * @returns {boolean}
 */
export function shouldShowCoverageWireframe({
  enabled, livePlaneOn, calibrating, isActive, coverageOn, inVisibleSet,
}) {
  if (!enabled) return false;
  if (livePlaneOn) return calibrating && isActive;
  return coverageOn && inVisibleSet;
}

/**
 * Whether a camera's translucent viewshed fill should exist. Never while a
 * live plane is showing: the fill is welded to the plane's far-cap corners
 * and neighbor fills would tint the frame.
 * @param {Object} args
 * @param {boolean} args.enabled
 * @param {boolean} args.livePlaneOn
 * @param {boolean} args.viewshedOn - Coverage mode is 'viewshed'.
 * @param {boolean} args.inVisibleSet
 * @param {boolean} args.hasGeometry - Record has frustumPositions.
 * @returns {boolean}
 */
export function shouldShowViewshedVolume({
  enabled, livePlaneOn, viewshedOn, inVisibleSet, hasGeometry,
}) {
  return !!(enabled && !livePlaneOn && viewshedOn && inVisibleSet && hasGeometry);
}
