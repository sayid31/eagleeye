// src/admin/api/adminKeysApi.js
/**
 * Browser-side calls to /api/admin/keys (session cookie, JSON). A key value is
 * only ever SENT, in the PUT body; no response carries one.
 *
 * @module admin/api/adminKeysApi
 */

const KEYS_URL = '/api/admin/keys';

async function readJson(response, action) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const error = new Error(`${action} failed — ${payload.error || `HTTP ${response.status}`}`);
  error.status = response.status;
  throw error;
}

/** @param {typeof fetch} [fetchFn] */
export async function fetchKeyStatus(fetchFn = fetch) {
  return readJson(await fetchFn(KEYS_URL, { credentials: 'same-origin', cache: 'no-store' }), 'Loading keys');
}

/**
 * @param {Record<string, string | null>} updates `{ENV_VAR: value}`; null removes.
 * @param {typeof fetch} [fetchFn]
 */
export async function saveKeys(updates, fetchFn = fetch) {
  const response = await fetchFn(KEYS_URL, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return readJson(response, 'Saving keys');
}

/**
 * @param {string} id Registry id (e.g. 'openai').
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{id: string, result: string, httpStatus?: number, message: string}>}
 */
export async function testKey(id, fetchFn = fetch) {
  const response = await fetchFn(`${KEYS_URL}/test`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  return readJson(response, 'Testing the key');
}
