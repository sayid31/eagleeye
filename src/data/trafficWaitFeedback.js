/**
 * @file Honest wait copy for the traffic layer's Overpass road fetch.
 *
 * A cold-area road fetch is slow because the public Overpass mirror queues the
 * request (measured ~45 s on an `X-Overpass-Cache: MISS`, DECISIONS 2026-10-27),
 * not because the browser is busy. Without a sentence saying so, the generic
 * "updating live data" banner reads as a hang. Pure and Cesium-free so the
 * copy and thresholds are unit-testable.
 *
 * @module data/trafficWaitFeedback
 */

/** @const {number} Waits shorter than this stay silent (cache hits settle well under it). */
export const OSM_WAIT_REVEAL_MS = 4000;

/** @const {number} Typical mirror queue the copy quotes; past it the wording stops promising. */
export const OSM_WAIT_TYPICAL_MS = 45000;

/**
 * Describe an in-flight Overpass road fetch to the user.
 *
 * @param {number|null|undefined} startedAtMs - When the fetch began (same clock as `nowMs`), or null if none is in flight.
 * @param {number} nowMs - Current time on the same clock.
 * @returns {string|null} Indonesian wait copy with elapsed seconds, or null when nothing needs saying.
 */
export function osmWaitLabel(startedAtMs, nowMs) {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return null;
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  if (elapsedMs < OSM_WAIT_REVEAL_MS) return null;
  const seconds = Math.floor(elapsedMs / 1000);
  return elapsedMs < OSM_WAIT_TYPICAL_MS
    ? `menunggu server peta OSM (antre, bisa ~${OSM_WAIT_TYPICAL_MS / 1000} dtk) · ${seconds} dtk`
    : `server peta OSM masih antre · ${seconds} dtk`;
}
