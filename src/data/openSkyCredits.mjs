// src/data/openSkyCredits.mjs
/**
 * OpenSky credit governor state (field-test fix 2026-07-06), split out of
 * openSkyProxy.mjs: the adaptive cache TTL picked from the remaining daily
 * credits, the last remaining value for /admin → System Health, and the
 * Server Log warning when credits run low.
 *
 * The global /states/all the proxy fetches costs 4 credits per call against
 * OpenSky's ~4000/day authenticated budget; stretching the TTL as the budget
 * thins keeps a full day of continuous use from exhausting it.
 *
 * @module data/openSkyCredits
 */

import { logServerEvent } from '../admin/log/serverLogStore.mjs';

/** TTL for the OpenSky response cache (ms) while credits are plentiful. */
export const OPENSKY_CACHE_MS = 9000;
/** Remaining daily credits at which the Server Log gets a quota warning. */
export const OPENSKY_QUOTA_WARN_REMAINING = 400;

/** Last `x-rate-limit-remaining` OpenSky reported. */
let lastCredits = null;

/**
 * Picks the cache TTL from the remaining daily credit budget.
 * Client polls every 30 s, so tiers ≤30 s cost the same 480 credits/h; the
 * later tiers stretch the day: >2400 → ~3 h of full freshness, then 30 s
 * (~2.5 h), 90 s (~5 h), 300 s (~8 h) ≈ 18+ h of continuous use per day.
 * @param {number} remaining X-Rate-Limit-Remaining header value.
 * @returns {number} TTL in ms.
 */
export function openskyAdaptiveTtlMs(remaining) {
  if (!Number.isFinite(remaining)) return OPENSKY_CACHE_MS;
  if (remaining > 2400) return OPENSKY_CACHE_MS;
  if (remaining > 1200) return 30_000;
  if (remaining > 400) return 90_000;
  return 300_000;
}

/**
 * Record one successful answer's remaining credits: keep it for System
 * Health, warn the Server Log when it is low, and return the TTL to use.
 * @param {number} remaining
 * @param {{now?: number, log?: (event: object) => void}} [deps]
 * @returns {number} TTL in ms.
 */
export function recordOpenSkyCredits(remaining, { now = Date.now(), log = logServerEvent } = {}) {
  if (Number.isFinite(remaining)) {
    lastCredits = { remaining, at: now };
    if (remaining <= OPENSKY_QUOTA_WARN_REMAINING) {
      log({ level: 'warn', source: 'proxy', code: 'proxy.quota_low', message: 'OpenSky daily credits are nearly used up', detail: { provider: 'opensky', remaining } });
    }
  }
  return openskyAdaptiveTtlMs(remaining);
}

/** @returns {{remaining: number, at: number} | null} null until the first OpenSky answer. */
export function openSkyCreditStatus() {
  return lastCredits ? { ...lastCredits } : null;
}
