// src/admin/dev/logs/logsApi.js
/**
 * Browser-side calls of the Log server area (session cookie): the server log (list, clear), the key/AI audit trail and
 * the health report. A failure throws an Error carrying `status` (and `code` when the server sent one), which
 * ErrorState/ConfirmDialog turn into a sentence; `message` is for developers only.
 *
 * @module admin/dev/logs/logsApi
 */

const LOG_URL = '/api/admin/log';
const AUDIT_URL = '/api/admin/audit';
const HEALTH_URL = '/api/admin/health';
const API_CODE = /^[A-Z][A-Z0-9_]+$/;

async function readJson(response, action) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const error = new Error(`${action} failed — ${payload.error || `HTTP ${response.status}`}`);
  error.status = response.status;
  error.code = API_CODE.test(String(payload.error ?? '')) ? payload.error : null;
  throw error;
}

const getJson = async (url, action, fetchFn) => readJson(await fetchFn(url, { credentials: 'same-origin', cache: 'no-store' }), action);

/** `{level, source, q, limit, offset}` → query string; empty values and a zero offset are dropped. */
export function logQueryString(filter = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null && value !== '' && value !== 0) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * @param {{level?: string, source?: string, q?: string, limit?: number, offset?: number}} filter
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{entries: object[], total: number, nextOffset: number | null, counts: Record<string, number>, levels: string[], sources: string[]}>}
 */
export const fetchLog = (filter, fetchFn = fetch) => getJson(`${LOG_URL}${logQueryString(filter)}`, 'Loading the log', fetchFn);

/** @param {typeof fetch} [fetchFn] @returns {Promise<{removed: number}>} */
export async function clearLog(fetchFn = fetch) {
  const response = await fetchFn(LOG_URL, { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  return readJson(response, 'Clearing the log');
}

/**
 * @param {{type?: string, offset?: number}} [filter]
 * @param {typeof fetch} [fetchFn]
 */
export function fetchAudit({ type = '', offset = 0 } = {}, fetchFn = fetch) {
  // `system` = the key/AI JSONL trail; the account audit is the default source (src/admin/users/adminLogRoutes.mjs).
  const params = new URLSearchParams({ source: 'system' });
  if (type) params.set('type', type);
  if (offset) params.set('offset', String(offset));
  return getJson(`${AUDIT_URL}?${params.toString()}`, 'Loading the audit trail', fetchFn);
}

/** @param {typeof fetch} [fetchFn] */
export const fetchHealth = (fetchFn = fetch) => getJson(HEALTH_URL, 'Loading system health', fetchFn);
