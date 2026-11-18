/**
 * What the `/login` page says and where it sends a visitor, as pure functions
 * of the URL (query + hash) and the `/api/me` v2 payload. No DOM, no network.
 *
 * @module login/loginView
 */

import { safeNextPath } from '../auth/nextPath.mjs';
import { LOGIN_COPY, LOGIN_NOTICES, SIGN_IN_ERRORS, SIGN_IN_GENERIC_ERROR } from '../copy/en/login.js';

export const CHANGE_PASSWORD_PATH = '/account/password';
/** Share-link state can be long (camera + layers + annotations); anything longer is dropped. */
export const MAX_NEXT_HASH_LENGTH = 8192;
// Control characters would never come from the app's own share links.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
/** Refusals that mean "try the password again" (focus goes back to the password field, not the banner). */
const RETRY_PASSWORD_CODES = new Set(['INVALID_EMAIL_OR_PASSWORD', 'INVALID_EMAIL']);

/**
 * @param {string} code Server code of a refused sign-in.
 * @returns {string} Indonesian message (generic for anything unknown).
 */
export function signInErrorText(code) {
  return Object.hasOwn(SIGN_IN_ERRORS, code) ? SIGN_IN_ERRORS[code] : SIGN_IN_GENERIC_ERROR;
}

/**
 * The banner above the form. A Google refusal is always the same generic text
 * (`notice=google` comes with Better Auth's `error=` code, which is not shown).
 * @param {URLSearchParams} params
 * @returns {{tone: 'error' | 'warn', text: string} | null}
 */
export function loginMessage(params) {
  const notice = params.get('notice');
  if (notice && Object.hasOwn(LOGIN_NOTICES, notice)) return LOGIN_NOTICES[notice];
  const error = params.get('error');
  return error ? { tone: 'error', text: signInErrorText(error) } : null;
}

/**
 * `next` plus the page's own `location.hash`. The server guard only sees the
 * path, so a share link (`/app#…`) arrives as `/login?next=/app#…`: the hash
 * is re-attached here. `next` is validated by the shared `safeNextPath`; the
 * hash cannot change the origin, so it only needs to be well-formed.
 * @param {URLSearchParams} params
 * @param {string} [hash] `location.hash` (with its `#`, or empty).
 * @returns {string | null} The destination, or null when `next` is absent/refused.
 */
export function nextWithHash(params, hash = '') {
  const next = safeNextPath(params.get('next'));
  if (!next) return null;
  const keep = typeof hash === 'string' && hash.length > 1 && hash.startsWith('#')
    && hash.length <= MAX_NEXT_HASH_LENGTH && !CONTROL_CHARS.test(hash);
  return keep ? `${next}${hash}` : next;
}

/**
 * Where a signed-in visitor goes: the forced password change, else a valid
 * `next` (with the share hash), else the role's home. The server re-checks the area.
 * @param {URLSearchParams} params
 * @param {import('../auth/authClientApi.js').MePayload} me
 * @param {string} [hash]
 * @returns {string}
 */
export function afterSignInLocation(params, me, hash = '') {
  if (me?.user?.mustChangePassword) return CHANGE_PASSWORD_PATH;
  return nextWithHash(params, hash) ?? me?.home ?? '/app';
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
 * Decide what the page shows from `/api/me`. An already signed-in visitor goes
 * to the role's home (as the server guard does for `/login`), not to `next`.
 * @param {import('../auth/authClientApi.js').MePayload | null} me
 * @returns {{view: 'not-configured'} | {view: 'redirect', location: string} | {view: 'sign-in'}}
 */
export function loginPageState(me) {
  if (me && me.configured === false) return { view: 'not-configured' };
  if (me?.signedIn) return { view: 'redirect', location: me.user?.mustChangePassword ? CHANGE_PASSWORD_PATH : (me.home || '/app') };
  return { view: 'sign-in' };
}

/**
 * Required-field check done before any request (the form has `noValidate`, so the browser's English bubbles never show).
 * @param {{email: string, password: string}} values
 * @returns {{email?: string, password?: string}} A message per empty field; `{}` when the form may be sent.
 */
export function loginFieldProblems({ email, password }) {
  const problems = {};
  if (!String(email ?? '').trim()) problems.email = LOGIN_COPY.emailRequired;
  if (!password) problems.password = LOGIN_COPY.passwordRequired;
  return problems;
}

/**
 * Where keyboard focus goes after a refused sign-in: back to the password field when retrying it is the fix,
 * otherwise to the error banner so a screen reader starts from the explanation.
 * @param {string} code Server code of the refusal.
 * @returns {'password' | 'alert'}
 */
export function signInFocusTarget(code) {
  return RETRY_PASSWORD_CODES.has(code) ? 'password' : 'alert';
}
