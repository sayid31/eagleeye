// src/admin/api/adminStatusApi.js
/**
 * Browser-side calls for /admin → Audit Log and System Health (session cookie).
 * @module admin/api/adminStatusApi
 */

async function getJson(url, action, fetchFn) {
  const response = await fetchFn(url, { credentials: 'same-origin', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const error = new Error(`${action} failed — ${payload.error || `HTTP ${response.status}`}`);
  error.status = response.status;
  throw error;
}

/**
 * @param {{type?: string, offset?: number}} [filter]
 * @param {typeof fetch} [fetchFn]
 */
export function fetchAudit({ type = '', offset = 0 } = {}, fetchFn = fetch) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (offset) params.set('offset', String(offset));
  const query = params.toString();
  return getJson(`/api/admin/audit${query ? `?${query}` : ''}`, 'Loading the audit log', fetchFn);
}

/** @param {typeof fetch} [fetchFn] */
export function fetchHealth(fetchFn = fetch) {
  return getJson('/api/admin/health', 'Loading System Health', fetchFn);
}
