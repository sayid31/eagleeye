// src/admin/users/activityRange.mjs
/**
 * Time windows the Aktivitas filters offer ("24 jam terakhir", ...). One pure module shared by the server boundary
 * (which turns a window into a cutoff) and the browser (which lists the choices), so both always agree on the codes.
 *
 * @module admin/users/activityRange
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Window code → length in milliseconds. */
export const ACTIVITY_RANGE_MS = Object.freeze({ '24h': DAY_MS, '7d': 7 * DAY_MS, '30d': 30 * DAY_MS });

/** Window codes in the order the filter lists them. */
export const ACTIVITY_RANGES = Object.freeze(Object.keys(ACTIVITY_RANGE_MS));

/**
 * ISO cutoff for a window (rows at or after it are in range); undefined for "all time" or an unknown code.
 * @param {string | undefined} range
 * @param {number} [now] Epoch ms.
 * @returns {string | undefined}
 */
export function rangeStart(range, now = Date.now()) {
  return Object.hasOwn(ACTIVITY_RANGE_MS, range ?? '') ? new Date(now - ACTIVITY_RANGE_MS[range]).toISOString() : undefined;
}
