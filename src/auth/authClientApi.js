// src/auth/authClientApi.js
/**
 * Browser-side calls for the shared login, used by `/login`, `/admin` and the
 * map: who am I (`/api/me`), start Google sign-in, sign out. Plain `fetch`
 * against Better Auth's HTTP endpoints, so no auth client library ships in the
 * bundles.
 *
 * @module auth/authClientApi
 */

export const LOGIN_PATH = '/login';

/**
 * @typedef {{authenticated: boolean, configured: boolean, role?: string, status?: string,
 *   email?: string, missing?: string[], invalid?: string[]}} MePayload
 */

/**
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<MePayload>}
 */
export async function fetchMe(fetchFn = fetch) {
  const response = await fetchFn('/api/me', { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`Session check failed: HTTP ${response.status}`);
  return response.json();
}

/**
 * Ask Better Auth for the Google authorization URL and go there. On a Google
 * error Better Auth returns to `/login?error=<code>`.
 * @param {{fetchFn?: typeof fetch, assign?: (url: string) => void}} [deps]
 * @returns {Promise<void>}
 */
export async function startGoogleSignIn({ fetchFn = fetch, assign = (url) => window.location.assign(url) } = {}) {
  const response = await fetchFn('/api/auth/sign-in/social', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'google', callbackURL: '/', errorCallbackURL: LOGIN_PATH }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.url !== 'string') {
    throw new Error(`Google sign-in could not start: HTTP ${response.status}${payload.code ? ` ${payload.code}` : ''}`);
  }
  assign(payload.url);
}

/**
 * End the session (Better Auth deletes it and clears the cookie).
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<void>}
 */
export async function signOut(fetchFn = fetch) {
  const response = await fetchFn('/api/auth/sign-out', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw new Error(`Sign-out failed: HTTP ${response.status}`);
}

/**
 * Sign out, then open the login page whatever happened (a failed sign-out is
 * reported on the console; the server still refuses an expired session).
 * @param {{fetchFn?: typeof fetch, assign?: (url: string) => void}} [deps]
 * @returns {Promise<void>}
 */
export async function signOutAndLeave({ fetchFn = fetch, assign = (url) => window.location.assign(url) } = {}) {
  try {
    await signOut(fetchFn);
  } catch (error) {
    console.warn(`[auth] ${error.message}`);
  }
  assign(LOGIN_PATH);
}
