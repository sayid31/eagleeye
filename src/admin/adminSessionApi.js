// src/admin/adminSessionApi.js
/**
 * Browser-side helpers for the admin login state.
 * @module admin/adminSessionApi
 */

/** Messages for the `?error=` codes the callback route redirects with. */
export const LOGIN_ERRORS = Object.freeze({
  not_admin: 'Akun Google ini bukan akun admin.',
  cancelled: 'Proses masuk dibatalkan.',
  invalid_request: 'Percobaan masuk tidak valid. Silakan coba lagi.',
  google_unavailable: 'Google tidak bisa dihubungi. Silakan coba lagi.',
  not_configured: 'Login admin belum dikonfigurasi di server.',
});

/**
 * @param {string | null | undefined} code
 * @returns {string | null}
 */
export function loginErrorMessage(code) {
  if (!code) return null;
  return LOGIN_ERRORS[code] ?? 'Gagal masuk. Silakan coba lagi.';
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
