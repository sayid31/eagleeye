/**
 * Pure decisions of the `/account` page: what it shows for the signed-in
 * account and how a display-name edit is checked.
 *
 * @module login/accountView
 */

import { loginUrlFor } from '../auth/nextPath.mjs';
import { MAX_NAME_LENGTH_CLIENT } from './accountApi.js';
import { ACCOUNT_COPY, ROLE_LABELS } from './loginCopy.js';
import { CHANGE_PASSWORD_PATH } from './loginView.js';

/**
 * Whether the account signs in with a password (and so gets the password
 * section). Every password is recorded with who set it (`cli`, `admin`,
 * `self`); an account Google created has none.
 * @param {{passwordSetBy?: string | null} | null | undefined} sessionUser User from `get-session`.
 * @returns {boolean}
 */
export function hasPasswordSignIn(sessionUser) {
  return typeof sessionUser?.passwordSetBy === 'string' && sessionUser.passwordSetBy.length > 0;
}

/**
 * @param {string | undefined} role
 * @returns {string}
 */
export function roleLabel(role) {
  return Object.hasOwn(ROLE_LABELS, role ?? '') ? ROLE_LABELS[role] : String(role ?? '');
}

/**
 * Same rule the server's update-user hook applies (trimmed, 1–80 characters).
 * @param {string} name
 * @returns {string | null} A message, or null when the name may be sent.
 */
export function nameProblem(name) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return ACCOUNT_COPY.nameRequired;
  if (trimmed.length > MAX_NAME_LENGTH_CLIENT) return ACCOUNT_COPY.nameTooLong(MAX_NAME_LENGTH_CLIENT);
  return null;
}

/**
 * What the `/account` page renders after loading.
 * @param {import('../auth/authClientApi.js').MePayload | null} me
 * @param {{passwordSetBy?: string | null} | null} sessionUser
 * @returns {{view: 'redirect', location: string} | {view: 'account', showPassword: boolean, home: string}}
 */
export function accountPageState(me, sessionUser) {
  if (!me?.signedIn) return { view: 'redirect', location: loginUrlFor('/account', '', 'session') };
  if (me.user?.mustChangePassword) return { view: 'redirect', location: CHANGE_PASSWORD_PATH };
  return { view: 'account', showPassword: hasPasswordSignIn(sessionUser), home: me.home || '/app' };
}
