/**
 * Public result codes for explicit CCTV camera flights. Extracted out of
 * `cctv.js` (lazy-loading refactor, plan §3.6) so `gevActions.js` can read
 * this small, pure, frozen constant without pulling in the entire 4600+-line
 * CCTV layer module. `cctv.js` imports-and-re-exports this so its own
 * internal call sites are unchanged.
 */
export const CCTV_FOCUS_RESULT = Object.freeze({
  FOCUSED: 'focused',
  NO_ACTIVE_CAMERA: 'no-active-camera',
  TRACKING_HOLDS_VIEW: 'tracking-holds-view',
  COCKPIT_ACTIVE: 'cockpit-active',
});
