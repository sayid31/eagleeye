/**
 * Tilt-in-place — what the Sudut control does to the camera the moment it is
 * clicked, as opposed to what cameraAngleMode.js does to the NEXT flight.
 *
 * Owner correction 2026-10-28: the first build treated the mode purely as a
 * preference for subsequent flights, so clicking Atas or Samping moved nothing
 * and read as a dead button ("masih hanya sekedar tombol aja tapi tidak ada
 * fungsi"). The reference the request named is OsirisAI's 2D/3D switch, where
 * the toggle acts immediately on what you are already looking at. So the click
 * now re-aims the camera where it stands.
 *
 * IN PLACE is the whole point, and it is a stronger claim than "change the
 * pitch". A naive re-pitch swings the camera about its own eye point, which
 * slides the ground away under the operator — you ask to look down at Jakarta
 * and end up looking down at somewhere else. This module instead:
 *
 *   1. resolves the point on the globe the camera is currently aimed at,
 *   2. measures how far the eye is from that point,
 *   3. re-places the eye at the new pitch, same target, same distance, same
 *      heading.
 *
 * The target stays centered, so the gesture reads as the world tipping rather
 * than the camera wandering.
 *
 * This file holds no Cesium import. The geometry decision is a pure function
 * (`planTiltInPlace`) and the Cesium call lives in uiCameraAngle.js, which is
 * what lets the interesting half be tested in Node without a viewer or a GPU.
 */

import {
  CAMERA_ANGLE_MODES,
  GLOBE_OBLIQUE_PITCH_DEG,
  NADIR_PITCH_DEG,
  OBLIQUE_PITCH_DEG,
  normalizeCameraAngleMode,
} from './cameraAngleMode.js';

/**
 * Above this altitude the camera is looking at the planet as a whole, so the
 * globe button's own derived oblique applies instead of the generic one.
 *
 * Matches `viewScaleForAltitude`'s 'global' band in detectionPolicy.js rather
 * than inventing a second threshold: the reason -35 fails up here is the same
 * reason the globe button needed -80 — at that distance the planet subtends
 * ~15° against a 30° half-FOV, so a generic oblique aims at empty space. See
 * GLOBE_OBLIQUE_PITCH_DEG for the arithmetic.
 */
export const GLOBAL_VIEW_ALTITUDE_M = 150000;

/** How long the tilt animation runs. Short: this is a toggle, not a journey. */
export const TILT_DURATION_S = 0.9;

/**
 * Below this the camera is close enough to the ground that a nadir tilt would
 * otherwise dive it into terrain; the standoff is clamped so Atas stays a view
 * change rather than a collision.
 */
export const MIN_TILT_RANGE_M = 120;

/**
 * Decide the pitch a tilt-in-place should land on.
 *
 * Deliberately NOT resolveCameraPitchDeg: that function answers "what pitch
 * should this DESTINATION be framed at", and its SAMPING branch preserves a
 * caller's curated per-landmark value. A tilt has no destination and no
 * curation — the operator is re-aiming at whatever is already on screen — so
 * the only thing that varies is how far away they are.
 *
 * @param {string} mode - A CAMERA_ANGLE_MODES value; anything else normalizes.
 * @param {number} altitudeM - Current camera height above the ellipsoid.
 * @returns {number} Pitch in degrees, negative = looking down.
 */
export function resolveTiltPitchDeg(mode, altitudeM) {
  if (normalizeCameraAngleMode(mode) === CAMERA_ANGLE_MODES.ATAS) {
    return NADIR_PITCH_DEG;
  }
  const altitude = Number.isFinite(altitudeM) ? altitudeM : 0;
  return altitude >= GLOBAL_VIEW_ALTITUDE_M ? GLOBE_OBLIQUE_PITCH_DEG : OBLIQUE_PITCH_DEG;
}

/**
 * Plan a tilt, or decline to.
 *
 * Returns a plan rather than performing one so the refusals are testable:
 * a tilt that fires while the cockpit or a tracked entity owns the camera
 * would yank the view out from under whoever owns it, and a tilt that fires
 * when the camera is already at the target pitch is a pointless animation.
 * Each refusal carries a machine-readable `reason` for the same purpose the
 * CCTV focus path uses its CCTV_FOCUS_RESULT codes.
 *
 * @param {object} state
 * @param {string} state.mode - The mode being switched to.
 * @param {number} state.altitudeM - Camera height above the ellipsoid.
 * @param {number} state.currentPitchDeg - Where the camera is aimed now.
 * @param {number} state.targetDistanceM - Eye-to-ground-target distance.
 * @param {boolean} [state.cockpitActive] - Cockpit owns the camera.
 * @param {boolean} [state.trackingActive] - A tracked entity owns the camera.
 * @param {boolean} [state.targetResolved] - The aim point was found on the globe.
 * @returns {{tilt: boolean, reason: string, pitchDeg?: number, rangeM?: number, durationS?: number}}
 */
export function planTiltInPlace(state = {}) {
  const {
    mode,
    altitudeM,
    currentPitchDeg,
    targetDistanceM,
    cockpitActive = false,
    trackingActive = false,
    targetResolved = true,
  } = state;

  // Same two owners focusCctvRecord refuses for, and for the same reason: both
  // drive the camera continuously, so a tilt would be overwritten next frame
  // anyway — and in the meantime it would fight them visibly.
  if (cockpitActive) return { tilt: false, reason: 'cockpit-active' };
  if (trackingActive) return { tilt: false, reason: 'tracking-holds-view' };
  // No aim point means the camera is pointed at space past the limb; there is
  // no "in place" to pivot around, so the mode applies to the next flight only.
  if (!targetResolved) return { tilt: false, reason: 'no-ground-target' };

  const pitchDeg = resolveTiltPitchDeg(mode, altitudeM);
  if (Number.isFinite(currentPitchDeg) && Math.abs(currentPitchDeg - pitchDeg) < 0.5) {
    return { tilt: false, reason: 'already-there', pitchDeg };
  }

  const distance = Number.isFinite(targetDistanceM) ? targetDistanceM : 0;
  return {
    tilt: true,
    reason: 'tilt',
    pitchDeg,
    rangeM: Math.max(MIN_TILT_RANGE_M, distance),
    durationS: TILT_DURATION_S,
  };
}

/**
 * Which button the live camera matches: the mode whose pitch at this altitude
 * is nearer to the camera's (the same pair `resolveTiltPitchDeg` flies to).
 * A whole-city search lands straight down in either mode, and the control
 * used to keep showing 3D there, so reaching the oblique view took 2D then 3D.
 *
 * @param {number} pitchDeg - Live camera pitch, negative = looking down.
 * @param {number} altitudeM - Live camera height.
 * @returns {'atas'|'samping'|null} Null when the pitch is unknown.
 */
export function cameraAngleShownForCamera(pitchDeg, altitudeM) {
  if (!Number.isFinite(pitchDeg)) return null;
  const nadir = resolveTiltPitchDeg(CAMERA_ANGLE_MODES.ATAS, altitudeM);
  const oblique = resolveTiltPitchDeg(CAMERA_ANGLE_MODES.SAMPING, altitudeM);
  return Math.abs(pitchDeg - nadir) <= Math.abs(pitchDeg - oblique)
    ? CAMERA_ANGLE_MODES.ATAS
    : CAMERA_ANGLE_MODES.SAMPING;
}
