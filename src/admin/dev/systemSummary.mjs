// src/admin/dev/systemSummary.mjs
/**
 * `/dev` → System Overview: version, runtime, uptime, login configuration,
 * key presence per provider, kill-switch states, recent Server Log errors and
 * the doctor's auth warnings — one payload, built from facts the server
 * already has. Pure. Never carries a key value, a secret or an email.
 *
 * @module admin/dev/systemSummary
 */

import { readinessWarnings } from '../../auth/authReadiness.mjs';

/** Window for "recent" Server Log errors. */
export const RECENT_ERROR_WINDOW_HOURS = 24;
const HOUR_MS = 3_600_000;

/**
 * @param {Iterable<{level: string, lastAt: number}>} entries Server Log rows.
 * @param {number} now
 * @param {number} [windowHours]
 * @returns {number} Error rows whose last occurrence is inside the window.
 */
export function countRecentErrors(entries, now, windowHours = RECENT_ERROR_WINDOW_HOURS) {
  const since = now - windowHours * HOUR_MS;
  let count = 0;
  for (const entry of entries) if (entry.level === 'error' && entry.lastAt >= since) count += 1;
  return count;
}

/**
 * @param {{versions?: {bun?: string, node?: string}}} proc `process`-like.
 * @returns {{name: 'Bun' | 'Node', version: string}}
 */
export function runtimeOf(proc) {
  if (proc.versions?.bun) return { name: 'Bun', version: proc.versions.bun };
  return { name: 'Node', version: proc.versions?.node ?? 'unknown' };
}

/**
 * @param {object} facts
 * @param {number} facts.now
 * @param {string} facts.appVersion
 * @param {{name: string, version: string}} facts.runtime
 * @param {number} facts.startedAt
 * @param {{configured: boolean, googleSignIn: boolean}} facts.auth
 * @param {{id: string, title: string, set: boolean}[]} facts.keys
 * @param {{gate: string, killed: boolean, reason: string | null, updatedAt: number | null}[]} facts.killSwitches
 * @param {{level: string, lastAt: number}[]} facts.logEntries
 * @param {{id: string, level: string, params: object}[]} facts.readiness From authReadinessChecks.
 */
export function buildSystemSummary(facts) {
  const { now } = facts;
  return {
    generatedAt: now,
    app: {
      version: facts.appVersion,
      runtime: facts.runtime,
      startedAt: facts.startedAt,
      uptimeSeconds: Math.max(0, Math.round((now - facts.startedAt) / 1000)),
    },
    auth: { configured: Boolean(facts.auth.configured), googleSignIn: Boolean(facts.auth.googleSignIn) },
    keys: facts.keys.map((key) => ({ id: key.id, title: key.title, set: key.set === true })),
    killSwitches: facts.killSwitches.map(({ gate, killed, reason, updatedAt }) => ({ gate, killed, reason, updatedAt })),
    serverLog: { recentErrors: countRecentErrors(facts.logEntries, now), windowHours: RECENT_ERROR_WINDOW_HOURS },
    doctor: readinessWarnings(facts.readiness),
  };
}
