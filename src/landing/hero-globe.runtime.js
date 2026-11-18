// src/landing/hero-globe.runtime.js
/**
 * Scheduling rules of the hero globe, kept pure so they are testable without a browser: when the loop may run, how
 * big the backing store is, and where the globe points at a given time.
 *
 * @module landing/hero-globe.runtime
 */

/** Device pixel ratio cap: beyond 2x the extra pixels cost fill rate and add nothing visible on thin dots. */
export const MAX_DPR = 2;
/** Radians per second: one revolution in about two minutes. */
export const SPIN_SPEED = 0.052;
/** Longitude (degrees east) the globe is centred on when it first appears: Southeast Asia. */
export const START_LON = 108;
/** North pole tilt toward the viewer, radians. */
export const TILT = 0.36;
/** Frame time past which a stalled tab's delta is clamped, so the globe does not jump when it resumes. */
export const MAX_FRAME_SECONDS = 0.1;
/** Animation clock used for the single static frame (arcs mid-flight). */
export const STATIC_TIME = 1.7;

/**
 * @param {{ visible: boolean, tabHidden: boolean, reducedMotion: boolean }} state
 * @returns {boolean} whether the animation loop should be running
 */
export function shouldAnimate({ visible, tabHidden, reducedMotion }) {
  return visible && !tabHidden && !reducedMotion;
}

/**
 * @param {number} cssSize canvas side in CSS px
 * @param {number} devicePixelRatio
 * @returns {{ dpr: number, pixels: number }} effective ratio and backing-store side
 */
export function backingSize(cssSize, devicePixelRatio) {
  const dpr = Math.min(MAX_DPR, Math.max(1, devicePixelRatio || 1));
  return { dpr, pixels: Math.max(1, Math.round(cssSize * dpr)) };
}

/** Yaw (radians) that centres `START_LON` at animation time 0 and then spins eastward. */
export function yawAt(seconds) {
  return -(START_LON * Math.PI) / 180 + seconds * SPIN_SPEED;
}

/** Seconds of animation clock to add for a frame, clamped. */
export function frameDelta(previousMs, nowMs) {
  return Math.min(MAX_FRAME_SECONDS, Math.max(0, (nowMs - previousMs) / 1000));
}
