/**
 * Camera angle mode — the operator's standing choice between a top-down (ATAS)
 * and an oblique (SAMPING) framing, applied to every pitch-bearing camera
 * flight in the app.
 *
 * Owner directive 2026-10-28: clicking the globe button always ended straight
 * overhead, and the oblique framing the operator wanted ("like when CCTV is
 * active") existed only as a bare inline `toRad(-22)` inside focusCctvRecord.
 * The ask was explicitly for a PERSISTED mode, not a per-button option —
 * "satu sumber kebenaran, tidak ada tombol yang 'lupa' mode-nya" — so the mode
 * lives here as a module singleton and every seam reads it at flight time
 * rather than caching a pitch.
 *
 * THE CONTRACT (resolveCameraPitchDeg is the whole thing, in one pure function):
 *
 *   ATAS overrides curated pitch to straight-down everywhere. CITY_POIS carries
 *   ~30 hand-curated per-landmark pitches (-12 … -45) and buildingPitch() derives
 *   more from building aspect ratio, but all of that curation is about how a
 *   building's FACE reads. In plan view there is no face, so honoring a facade
 *   pitch would preserve the number while discarding the intent.
 *
 *   SAMPING preserves curated pitch and supplies OBLIQUE_PITCH_DEG only where no
 *   curated intent exists (the globe button, city-level flights, layer focus).
 *   Those curated values are ALREADY oblique; SAMPING is a request for oblique,
 *   so overriding them would be strictly worse than leaving them alone.
 *
 * Scope limit, deliberate: the mode governs PITCH-BEARING flights. flyToViewportBounds
 * flies to a Cesium.Rectangle and passes no orientation at all, so a whole-city
 * overview search stays top-down in both modes. Converting it means re-deriving a
 * center and range from the padded box and re-entering the antimeridian padding
 * logic that file already paid for. See docs/DECISIONS.md 2026-10-28.
 *
 * Singleton rather than StyleManager state on purpose: locations.js,
 * cctvActivation.js, worldFocus.js and camera.js all need the live mode, and none
 * of them should take a UI dependency to get it. Same idiom as
 * getScopeMaskFeather/setScopeMaskFeather in scopeMask.js.
 */

/**
 * The two modes. Frozen because this one object is the hash value, the
 * `data-camera-angle` attribute value, and any future voice-tool enum — three
 * surfaces that must not drift. Lowercase ASCII so it is hash- and dataset-safe.
 */
export const CAMERA_ANGLE_MODES = Object.freeze({
  ATAS: 'atas',
  SAMPING: 'samping',
});

/**
 * First-run mode.
 *
 * SAMPING, because "default" means what you get having said nothing, and what
 * the app does TODAY at every pitch-bearing seam is curated/oblique. An
 * ATAS default would silently re-frame every existing flight on first boot.
 *
 * Keep in lockstep with the `active` class + aria-checked in index.html's
 * #camera-angle-samping and with GLOBAL_POST_DEFAULTS.cameraAngle in
 * uiConstants.js — a fresh boot applies no restore, so those are the real
 * first-run state. Pinned in reasonableDefaults.test.mjs.
 */
export const CAMERA_ANGLE_MODE_DEFAULT = CAMERA_ANGLE_MODES.SAMPING;

/** One name for straight-down, so no seam re-literalizes -90. */
export const NADIR_PITCH_DEG = -90;

/**
 * The SAMPING fallback, used only where a destination carries no curated pitch.
 *
 * -35 deliberately matches two numbers already in the tree — the `pitch` parse
 * fallback in sharelink.js and the fly-to pitch in gevActionsLocation.js — so
 * this is the app's existing generic oblique given a name, not a new invention.
 */
export const OBLIQUE_PITCH_DEG = -35;

/**
 * The CCTV activation pitch, extracted from the bare `toRad(-22)` literal that
 * used to sit inside focusCctvRecord.
 *
 * Kept SEPARATE from OBLIQUE_PITCH_DEG even though both are "the oblique one":
 * -22 is calibrated against focusCctvRecord's own range (rangeM * 1.18) and
 * bounding-sphere radius (rangeM * 0.36), so it is not interchangeable with the
 * generic fallback. It equals buildingPitch()'s mid-ratio -22 by coincidence.
 * Do not unify them.
 */
export const CCTV_OBLIQUE_PITCH_DEG = -22;

/**
 * The globe button's SAMPING pitch.
 *
 * Derived, not chosen by eye. At GLOBE_VIEW.heightM (18,000 km) the camera sits
 * 24,371 km from Earth's center, so the planet's angular radius is
 * asin(6371/24371) = 15.15°. Cesium's default vertical FOV is 60°, giving a 30°
 * half-FOV. So OBLIQUE_PITCH_DEG (-35) would point 55° off nadir — almost
 * entirely at empty space, which is why the globe needs its own value rather
 * than the generic fallback.
 *
 * At -80 the view axis is 10° off nadir: near limb at 15.15°, far limb at
 * ~25.1°, both inside 30° — the full disc, off-center, with visible curvature.
 * At -75 the far limb reaches ~30.15° and clips. Hence -80, and hence the
 * -89 < x < -75 band asserted in cameraAngleMode.test.mjs.
 */
export const GLOBE_OBLIQUE_PITCH_DEG = -80;

const VALID_MODES = new Set(Object.values(CAMERA_ANGLE_MODES));

/**
 * Is this a mode this module recognizes?
 *
 * Exists so a caller that must REJECT junk (the public setter, which owes its
 * caller an error) can ask directly, rather than inferring it from whether
 * normalizeCameraAngleMode returned the value unchanged. That round-trip
 * comparison answers the right question today only because normalization is
 * trim + lowercase; it would start quietly accepting junk the moment
 * normalization gained a step. Callers that must COERCE still use
 * normalizeCameraAngleMode.
 *
 * @param {unknown} value
 * @returns {boolean} True for a recognized mode, modulo casing and padding.
 */
export function isCameraAngleMode(value) {
  return typeof value === 'string' && VALID_MODES.has(value.trim().toLowerCase());
}

/**
 * Coerce anything into a valid mode. The single place the string set is enforced,
 * so a share link, a dataset attribute, and a public setter cannot disagree.
 * @param {unknown} value
 * @returns {string} One of CAMERA_ANGLE_MODES; CAMERA_ANGLE_MODE_DEFAULT for junk.
 */
export function normalizeCameraAngleMode(value) {
  if (!isCameraAngleMode(value)) return CAMERA_ANGLE_MODE_DEFAULT;
  return value.trim().toLowerCase();
}

/**
 * THE contract, as a pure function so it is testable without a Cesium viewer.
 *
 * @param {string} mode - A CAMERA_ANGLE_MODES value; anything else normalizes.
 * @param {number} [curatedPitchDeg] - The destination's own hand-tuned pitch, if
 *   it has one. Omit (or pass a non-finite value) where no curation exists.
 * @returns {number} Pitch in degrees, negative = looking down.
 */
export function resolveCameraPitchDeg(mode, curatedPitchDeg) {
  if (normalizeCameraAngleMode(mode) === CAMERA_ANGLE_MODES.ATAS) {
    return NADIR_PITCH_DEG;
  }
  return Number.isFinite(curatedPitchDeg) ? curatedPitchDeg : OBLIQUE_PITCH_DEG;
}

let _mode = CAMERA_ANGLE_MODE_DEFAULT;

/** @returns {string} The live mode. */
export function getCameraAngleMode() {
  return _mode;
}

/**
 * @param {unknown} mode - Normalized on the way in, so a bad value cannot wedge
 *   the singleton into an unrenderable state.
 * @returns {string} The mode actually stored.
 */
export function setCameraAngleMode(mode) {
  _mode = normalizeCameraAngleMode(mode);
  return _mode;
}

/**
 * What call sites invoke, so adding the mode to a seam is a one-line edit.
 * @param {number} [curatedPitchDeg]
 * @returns {number}
 */
export function resolveActiveCameraPitchDeg(curatedPitchDeg) {
  return resolveCameraPitchDeg(_mode, curatedPitchDeg);
}

/** Test seam, mirroring _resetRenderGovernorForTest in renderGovernor.js. */
export function _resetCameraAngleModeForTest() {
  _mode = CAMERA_ANGLE_MODE_DEFAULT;
}
