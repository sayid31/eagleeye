// src/login/loginView.js
/**
 * What the `/login` page says, as pure functions of the URL query and the
 * `/api/me` payload. No DOM, no network.
 *
 * @module login/loginView
 */

/** `?notice=` set by the server guard. */
export const LOGIN_NOTICES = Object.freeze({
  banned: { tone: 'error', text: 'Akun ini diblokir. Hubungi admin bila menurutmu ini keliru.' },
  session: { tone: 'warn', text: 'Sesi berakhir. Silakan masuk lagi.' },
});

/** `?error=` codes Better Auth (or Google) sends back after a failed sign-in. */
export const LOGIN_ERRORS = Object.freeze({
  access_denied: 'Proses masuk dibatalkan.',
  state_mismatch: 'Percobaan masuk kedaluwarsa atau tidak valid. Silakan coba lagi.',
  please_restart_the_process: 'Percobaan masuk kedaluwarsa. Silakan coba lagi.',
  invalid_code: 'Google menolak kode masuk. Silakan coba lagi.',
  unable_to_get_user_info: 'Data akun Google tidak bisa dibaca. Silakan coba lagi.',
  email_not_found: 'Akun Google ini tidak memberikan alamat email.',
  internal_server_error: 'Server gagal menyelesaikan proses masuk. Lihat log server.',
});

const GENERIC_ERROR = 'Gagal masuk. Silakan coba lagi.';

/**
 * @param {URLSearchParams} params
 * @returns {{tone: 'error' | 'warn', text: string} | null}
 */
export function loginMessage(params) {
  const error = params.get('error');
  if (error) return { tone: 'error', text: LOGIN_ERRORS[error] ?? GENERIC_ERROR };
  return LOGIN_NOTICES[params.get('notice')] ?? null;
}

/**
 * Decide what the page shows from `/api/me`.
 * @param {{authenticated: boolean, configured: boolean, status?: string, missing?: string[], invalid?: string[]} | null} me
 * @returns {{view: 'not-configured', missing: string[], invalid: string[]}
 *   | {view: 'redirect', location: string} | {view: 'sign-in'}}
 */
export function loginPageState(me) {
  if (me && me.configured === false) return { view: 'not-configured', missing: me.missing ?? [], invalid: me.invalid ?? [] };
  if (me?.authenticated && me.status !== 'banned') return { view: 'redirect', location: '/' };
  return { view: 'sign-in' };
}
