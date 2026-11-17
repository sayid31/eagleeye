/**
 * Browser-side calls for the login, used by `/login`, `/account`, `/admin`,
 * `/dev` and the map: who am I (`/api/me`), password sign-in, Google sign-in
 * (super_admin), change password, sign out. Plain `fetch` against Better
 * Auth's allowlisted endpoints, so no auth client library ships in the bundles.
 *
 * @module auth/authClientApi
 */

export const LOGIN_PATH = '/login';

/**
 * @typedef {{configured: boolean, signedIn: boolean, home: string, googleSignIn: boolean,
 *   user?: {id: string, name: string, email: string, role: string, mustChangePassword: boolean,
 *   capabilities: {layers: boolean, ai: boolean, premium: boolean}}}} MePayload
 */

const postJson = (fetchFn, url, body) => fetchFn(url, {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

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
 * Password sign-in. Never throws for a refused sign-in: the caller shows the code.
 * @param {{email: string, password: string}} credentials
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{ok: true} | {ok: false, status: number, code: string}>}
 */
export async function signInWithPassword({ email, password }, fetchFn = fetch) {
  const response = await postJson(fetchFn, '/api/auth/sign-in/email', { email, password, rememberMe: true });
  if (response.ok) return { ok: true };
  const payload = await response.json().catch(() => ({}));
  return { ok: false, status: response.status, code: response.status === 429 ? 'RATE_LIMITED' : String(payload.code ?? 'UNKNOWN') };
}

/**
 * Change the signed-in account's password (the server also signs out every other device).
 * @param {{currentPassword: string, newPassword: string}} input
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{ok: true} | {ok: false, status: number, code: string}>}
 */
export async function changePassword({ currentPassword, newPassword }, fetchFn = fetch) {
  const response = await postJson(fetchFn, '/api/auth/change-password', { currentPassword, newPassword });
  if (response.ok) return { ok: true };
  const payload = await response.json().catch(() => ({}));
  return { ok: false, status: response.status, code: String(payload.code ?? payload.error ?? 'UNKNOWN') };
}

/**
 * Ask for the Google authorization URL and go there. Where Google returns to
 * (`/dev`, or `/login?next=/dev&notice=google&error=…`) is fixed by the server.
 * @param {{fetchFn?: typeof fetch, assign?: (url: string) => void}} [deps]
 * @returns {Promise<void>}
 */
export async function startGoogleSignIn({ fetchFn = fetch, assign = (url) => window.location.assign(url) } = {}) {
  const response = await postJson(fetchFn, '/api/auth/sign-in/social', { provider: 'google' });
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
  const response = await postJson(fetchFn, '/api/auth/sign-out', {});
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
