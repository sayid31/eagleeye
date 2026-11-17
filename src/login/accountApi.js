/**
 * Browser calls of the `/account` page that `auth/authClientApi.js` does not
 * cover: the session's user row (to know whether it has a password), display
 * name, and signing out the other devices. Plain `fetch` against Better Auth's
 * allowlisted endpoints; a refusal is returned, never thrown.
 *
 * @module login/accountApi
 */

/** Mirrors MAX_NAME_LENGTH of the server's update-user hook (authHooks.mjs). */
export const MAX_NAME_LENGTH_CLIENT = 80;

const post = (fetchFn, url, body) => fetchFn(url, {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const failure = async (response) => {
  const payload = await response.json().catch(() => ({}));
  return { ok: false, status: response.status, code: String(payload.code ?? payload.error ?? 'UNKNOWN') };
};

/**
 * The signed-in user row as Better Auth returns it (includes `passwordSetBy`).
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<object | null>} null when there is no session.
 */
export async function fetchSessionUser(fetchFn = fetch) {
  const response = await fetchFn('/api/auth/get-session', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`Session lookup failed: HTTP ${response.status}`);
  const payload = await response.json().catch(() => null);
  return payload?.user ?? null;
}

/**
 * @param {string} name
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{ok: true} | {ok: false, status: number, code: string}>}
 */
export async function updateDisplayName(name, fetchFn = fetch) {
  const response = await post(fetchFn, '/api/auth/update-user', { name: String(name).trim() });
  return response.ok ? { ok: true } : failure(response);
}

/**
 * End every session of this account except the current one.
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{ok: true} | {ok: false, status: number, code: string}>}
 */
export async function revokeOtherSessions(fetchFn = fetch) {
  const response = await post(fetchFn, '/api/auth/revoke-other-sessions', {});
  return response.ok ? { ok: true } : failure(response);
}
