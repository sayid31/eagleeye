/**
 * What the `/login` page says and where it sends a visitor, as pure functions
 * of the URL query and the `/api/me` v2 payload. No DOM, no network.
 *
 * @module login/loginView
 */

import { safeNextPath } from '../auth/nextPath.mjs';

export const CHANGE_PASSWORD_PATH = '/account/password';

/** `?notice=` set by the server guard or the Google error redirect. */
export const LOGIN_NOTICES = Object.freeze({
  session: { tone: 'warn', text: 'Sesi berakhir. Silakan masuk lagi.' },
  google: { tone: 'error', text: 'Masuk dengan Google hanya untuk akun developer yang terdaftar.' },
});

/** Codes from the sign-in endpoint (and the Google `?error=` redirect). */
export const SIGN_IN_ERRORS = Object.freeze({
  INVALID_EMAIL_OR_PASSWORD: 'Email atau password salah.',
  INVALID_EMAIL: 'Email atau password salah.',
  ACCOUNT_DISABLED: 'Akun dinonaktifkan, hubungi admin.',
  GOOGLE_SIGN_IN_REQUIRED: 'Akun ini masuk lewat Google.',
  RATE_LIMITED: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
  GOOGLE_NOT_ALLOWED: 'Akun Google ini tidak terdaftar sebagai developer.',
  account_not_linked: 'Email ini sudah dipakai akun password. Hubungi developer.',
  access_denied: 'Proses masuk dibatalkan.',
  state_mismatch: 'Percobaan masuk kedaluwarsa. Silakan coba lagi.',
});
const GENERIC_ERROR = 'Gagal masuk. Silakan coba lagi.';

/**
 * @param {string} code
 * @returns {string} Indonesian message for a sign-in refusal.
 */
export function signInErrorText(code) {
  return SIGN_IN_ERRORS[code] ?? GENERIC_ERROR;
}

/**
 * @param {URLSearchParams} params
 * @returns {{tone: 'error' | 'warn', text: string} | null}
 */
export function loginMessage(params) {
  const error = params.get('error');
  if (error) return { tone: 'error', text: signInErrorText(error) };
  return LOGIN_NOTICES[params.get('notice')] ?? null;
}

/**
 * Where a signed-in visitor goes: the forced password change, else a valid
 * `next`, else the role's home. (The server re-checks the area.)
 * @param {URLSearchParams} params
 * @param {import('../auth/authClientApi.js').MePayload} me
 * @returns {string}
 */
export function afterSignInLocation(params, me) {
  if (me?.user?.mustChangePassword) return CHANGE_PASSWORD_PATH;
  return safeNextPath(params.get('next')) ?? me?.home ?? '/app';
}

/**
 * @param {URLSearchParams} params
 * @param {import('../auth/authClientApi.js').MePayload | null} me
 * @returns {boolean} The Google button shows only on the way to `/dev`, when Google is configured.
 */
export function showGoogleButton(params, me) {
  const next = safeNextPath(params.get('next'));
  return Boolean(me?.googleSignIn && next && (next === '/dev' || next.startsWith('/dev/') || next.startsWith('/dev?')));
}

/**
 * Decide what the page shows from `/api/me`.
 * @param {import('../auth/authClientApi.js').MePayload | null} me
 * @param {URLSearchParams} params
 * @returns {{view: 'not-configured'} | {view: 'redirect', location: string} | {view: 'sign-in'}}
 */
export function loginPageState(me, params) {
  if (me && me.configured === false) return { view: 'not-configured' };
  if (me?.signedIn) return { view: 'redirect', location: afterSignInLocation(params, me) };
  return { view: 'sign-in' };
}
