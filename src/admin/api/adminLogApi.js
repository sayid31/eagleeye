// src/admin/api/adminLogApi.js
/**
 * Browser-side calls to /api/admin/log (session cookie).
 * @module admin/api/adminLogApi
 */

const LOG_URL = '/api/admin/log';

async function readJson(response, action) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const error = new Error(`${action} failed — ${payload.error || `HTTP ${response.status}`}`);
  error.status = response.status;
  throw error;
}

/** `{level, source, q, offset}` → query string, empty values dropped. */
export function logQueryString(filter = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null && value !== '' && value !== 0) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * @param {{level?: string, source?: string, q?: string, offset?: number}} filter
 * @param {typeof fetch} [fetchFn]
 */
export async function fetchLog(filter, fetchFn = fetch) {
  return readJson(await fetchFn(`${LOG_URL}${logQueryString(filter)}`, { credentials: 'same-origin', cache: 'no-store' }), 'Loading the log');
}

/** @param {typeof fetch} [fetchFn] */
export async function clearLog(fetchFn = fetch) {
  const response = await fetchFn(LOG_URL, {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  return readJson(response, 'Clearing the log');
}
