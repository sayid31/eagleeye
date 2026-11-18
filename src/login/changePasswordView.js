/**
 * Client-side checks and messages of the change-password form. Pure. The
 * server enforces the same policy (`validatePassword` in the change-password
 * before-hook, which also forces `revokeOtherSessions`); this only gives the
 * precise message, next to the right field, before a round-trip.
 *
 * @module login/changePasswordView
 */

import { normalizeEmail } from '../auth/authRoles.mjs';
import { minPasswordLength, validatePassword } from '../auth/passwordPolicy.mjs';
import { PASSWORD_COPY, PASSWORD_ERRORS } from '../copy/id/login.js';

/** @typedef {'current' | 'next' | 'confirm'} PasswordField */
/** @typedef {{field: PasswordField | null, message: string}} PasswordIssue `field` null = a form-level message. */

/**
 * Same identity rule as `validatePassword`, checked on its own so the checklist is right even while the password is
 * still too short (validatePassword reports only the first failing rule).
 */
function equalsIdentity(password, { email, name } = {}) {
  const lowered = password.trim().toLowerCase();
  const identities = [normalizeEmail(email), normalizeEmail(email).split('@')[0], String(name ?? '').trim().toLowerCase()];
  return identities.some((identity) => identity && lowered === identity);
}

/**
 * The live checklist under the new-password field: each requirement and whether the current input meets it.
 * The minimum comes from the shared policy (12 for user, 15 for admin and super_admin).
 * @param {{currentPassword: string, newPassword: string, confirm: string}} input
 * @param {{email?: string, name?: string, role?: string}} [identity]
 * @returns {Array<{id: 'length' | 'identity' | 'different' | 'match', label: string, met: boolean}>}
 */
export function passwordRequirements({ currentPassword, newPassword, confirm }, identity = {}) {
  const typed = newPassword.length > 0;
  return [
    { id: 'length', label: PASSWORD_COPY.requirementLength(minPasswordLength(identity.role)), met: [...newPassword].length >= minPasswordLength(identity.role) },
    { id: 'identity', label: PASSWORD_COPY.requirementIdentity, met: typed && !equalsIdentity(newPassword, identity) },
    { id: 'different', label: PASSWORD_COPY.requirementDifferent, met: typed && newPassword !== currentPassword },
    { id: 'match', label: PASSWORD_COPY.requirementMatch, met: typed && confirm === newPassword },
  ];
}

/**
 * @param {{currentPassword: string, newPassword: string, confirm: string}} input
 * @param {{email?: string, name?: string, role?: string}} [identity] The signed-in account.
 * @returns {PasswordIssue | null} The first problem and its field, or null when the form may be sent.
 */
export function changePasswordIssue({ currentPassword, newPassword, confirm }, identity = {}) {
  if (!currentPassword) return { field: 'current', message: PASSWORD_ERRORS.CURRENT_REQUIRED };
  const verdict = validatePassword(newPassword, identity);
  if (!verdict.ok) {
    if (verdict.reason === 'too_short') return { field: 'next', message: PASSWORD_ERRORS.TOO_SHORT(verdict.min) };
    if (verdict.reason === 'too_long') return { field: 'next', message: PASSWORD_ERRORS.TOO_LONG };
    return { field: 'next', message: PASSWORD_ERRORS.MATCHES_IDENTITY };
  }
  if (newPassword === currentPassword) return { field: 'next', message: PASSWORD_ERRORS.SAME_AS_CURRENT };
  if (newPassword !== confirm) return { field: 'confirm', message: PASSWORD_ERRORS.MISMATCH };
  return null;
}

/**
 * A refused change-password call, placed on the field it is about (a wrong current password) or on the form.
 * @param {{status?: number, code?: string}} failure From `changePassword()` in authClientApi.
 * @returns {PasswordIssue}
 */
export function changePasswordFailure({ status, code } = {}) {
  if (status === 401) return { field: null, message: PASSWORD_ERRORS.SESSION_EXPIRED };
  if (status === 429) return { field: null, message: PASSWORD_ERRORS.RATE_LIMITED };
  if (code === 'INVALID_PASSWORD') return { field: 'current', message: PASSWORD_ERRORS.INVALID_PASSWORD };
  if (code === 'PASSWORD_TOO_LONG') return { field: 'next', message: PASSWORD_ERRORS.TOO_LONG };
  if (code === 'PASSWORD_WEAK' || code === 'PASSWORD_TOO_SHORT') return { field: 'next', message: PASSWORD_ERRORS.PASSWORD_WEAK };
  if (code === 'CREDENTIAL_ACCOUNT_NOT_FOUND') return { field: null, message: PASSWORD_ERRORS.CREDENTIAL_ACCOUNT_NOT_FOUND };
  return { field: null, message: PASSWORD_ERRORS.GENERIC };
}
