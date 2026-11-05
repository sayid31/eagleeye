// src/admin/adminSessionApi.js
/**
 * Browser-side helpers for the admin login state.
 * @module admin/adminSessionApi
 */

/** Messages for the `?error=` codes the callback route redirects with. */
export const LOGIN_ERRORS = Object.freeze({
  not_admin: 'This Google account is not the admin account.',
  cancelled: 'Sign-in was cancelled.',
  invalid_request: 'The sign-in attempt was not valid. Please try again.',
  google_unavailable: 'Google could not be reached. Please try again.',
  not_configured: 'Admin login is not configured on the server yet.',
});

/**
 * @param {string | null | undefined} code
 * @returns {string | null}
 */
export function loginErrorMessage(code) {
  if (!code) return null;
  return LOGIN_ERRORS[code] ?? 'Sign-in failed. Please try again.';
}

/**
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{configured: boolean, authenticated: boolean, email?: string, missing?: string[]}>}
 */
export async function fetchSession(fetchFn = fetch) {
  const response = await fetchFn('/api/admin/auth/session', { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Session check failed: HTTP ${response.status}`);
  return response.json();
}

/**
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<void>}
 */
export async function logout(fetchFn = fetch) {
  const response = await fetchFn('/api/admin/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!response.ok) throw new Error(`Logout failed: HTTP ${response.status}`);
}
