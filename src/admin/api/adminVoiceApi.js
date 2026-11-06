// src/admin/api/adminVoiceApi.js
/**
 * Browser-side calls to the /api/admin/voice/* routes (session cookie, JSON).
 * Every failure becomes an Error whose message is safe to show on the page.
 *
 * @module admin/api/adminVoiceApi
 */

const SETTINGS_URL = '/api/admin/voice/settings';
const USAGE_URL = '/api/admin/voice/usage';

async function readJson(response, action) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const details = Array.isArray(payload.details) ? payload.details.slice(0, 3).join('; ') : '';
  const reason = [payload.error, details].filter(Boolean).join(': ') || `HTTP ${response.status}`;
  const error = new Error(`${action} failed — ${reason}`);
  error.status = response.status;
  throw error;
}

/**
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{settings: object, storedValid: boolean, toolGroups: Array<object>, limitRanges: object}>}
 */
export async function fetchVoiceSettings(fetchFn = fetch) {
  return readJson(await fetchFn(SETTINGS_URL, { credentials: 'same-origin', cache: 'no-store' }), 'Loading settings');
}

/**
 * Replace the stored settings (the server validates again).
 * @param {object} settings Full settings object.
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{settings: object, storedValid: boolean}>}
 */
export async function saveVoiceSettings(settings, fetchFn = fetch) {
  const response = await fetchFn(SETTINGS_URL, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return readJson(response, 'Saving settings');
}

/**
 * @param {number} days One of the server's `dayOptions`.
 * @param {typeof fetch} [fetchFn]
 */
export async function fetchVoiceUsage(days, fetchFn = fetch) {
  const url = `${USAGE_URL}?days=${encodeURIComponent(days)}`;
  return readJson(await fetchFn(url, { credentials: 'same-origin', cache: 'no-store' }), 'Loading usage');
}
