// src/admin/dev/devApi.js
/**
 * Browser-side calls of the `/dev` system pages (session cookie, JSON). The
 * PUT body carries the re-auth password once; no response carries a secret.
 *
 * @module admin/dev/devApi
 */

import { DEV_ERROR_MESSAGES } from './devText.js';

const KILL_SWITCHES_URL = '/api/admin/kill-switches';

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const error = new Error(payload.message || DEV_ERROR_MESSAGES[payload.error] || `HTTP ${response.status}`);
  error.status = response.status;
  error.code = payload.error ?? null;
  error.field = payload.field ?? null;
  throw error;
}

const getJson = async (url, fetchFn) => readJson(await fetchFn(url, { credentials: 'same-origin', cache: 'no-store' }));

/** @param {typeof fetch} [fetchFn] */
export const fetchSystemSummary = (fetchFn = fetch) => getJson('/api/admin/system', fetchFn);

/** @param {typeof fetch} [fetchFn] */
export const fetchUsage = (fetchFn = fetch) => getJson('/api/admin/usage', fetchFn);

/** @param {typeof fetch} [fetchFn] */
export const fetchKillSwitches = (fetchFn = fetch) => getJson(KILL_SWITCHES_URL, fetchFn);

/**
 * @param {{gate: string, killed: boolean, reason: string, currentPassword: string}} change
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{switch: object, audit: 'written' | 'failed'}>}
 */
export async function updateKillSwitch(change, fetchFn = fetch) {
  return readJson(await fetchFn(KILL_SWITCHES_URL, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
  }));
}
