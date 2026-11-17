/**
 * Client-side checks and messages of the change-password form. Pure. The
 * server enforces the same policy (`validatePassword` in the change-password
 * before-hook, which also forces `revokeOtherSessions`); this only gives the
 * precise message before a round-trip.
 *
 * @module login/changePasswordView
 */

import { minPasswordLength, validatePassword } from '../auth/passwordPolicy.mjs';
import { PASSWORD_COPY, PASSWORD_ERRORS } from './loginCopy.js';

/**
 * The length hint under the new-password field (12 for user, 15 for admin and super_admin).
 * @param {string | undefined} role
 * @returns {string}
 */
export function passwordHint(role) {
  return PASSWORD_COPY.hint(minPasswordLength(role));
}

/**
 * @param {{currentPassword: string, newPassword: string, confirm: string}} input
 * @param {{email?: string, name?: string, role?: string}} [identity] The signed-in account.
 * @returns {string | null} A message, or null when the form may be sent.
 */
export function changePasswordProblem({ currentPassword, newPassword, confirm }, identity = {}) {
  if (!currentPassword) return PASSWORD_ERRORS.CURRENT_REQUIRED;
  const verdict = validatePassword(newPassword, identity);
  if (!verdict.ok) {
    if (verdict.reason === 'too_short') return PASSWORD_ERRORS.TOO_SHORT(verdict.min);
    if (verdict.reason === 'too_long') return PASSWORD_ERRORS.TOO_LONG;
    return PASSWORD_ERRORS.MATCHES_IDENTITY;
  }
  if (newPassword === currentPassword) return PASSWORD_ERRORS.SAME_AS_CURRENT;
  if (newPassword !== confirm) return PASSWORD_ERRORS.MISMATCH;
  return null;
}

/**
 * Message for a refused change-password call.
 * @param {{status?: number, code?: string}} failure From `changePassword()` in authClientApi.
 * @returns {string}
 */
export function changePasswordErrorText({ status, code } = {}) {
  if (status === 401) return PASSWORD_ERRORS.SESSION_EXPIRED;
  if (status === 429) return PASSWORD_ERRORS.RATE_LIMITED;
  const known = ['INVALID_PASSWORD', 'PASSWORD_WEAK', 'CREDENTIAL_ACCOUNT_NOT_FOUND'];
  if (known.includes(code)) return PASSWORD_ERRORS[code];
  if (code === 'PASSWORD_TOO_SHORT') return PASSWORD_ERRORS.PASSWORD_WEAK;
  if (code === 'PASSWORD_TOO_LONG') return PASSWORD_ERRORS.TOO_LONG;
  return PASSWORD_ERRORS.GENERIC;
}
