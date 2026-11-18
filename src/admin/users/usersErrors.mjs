// src/admin/users/usersErrors.mjs
/**
 * Indonesian wording of every error code the account-management API answers
 * with (plan/auth/04 §Kontrak API). Server wording (`message` field) for API clients and
 * browser clients that read `message`; the admin UI itself renders copy/en/errors.js. Pure.
 *
 * @module admin/users/usersErrors
 */

export const USER_ERROR_MESSAGES = Object.freeze({
  INVALID_INPUT: 'The data sent is not valid.',
  INVALID_JSON: 'The request body must be valid JSON.',
  BODY_TOO_LARGE: 'The request body is too large.',
  NOT_FOUND: 'Account not found.',
  METHOD_NOT_ALLOWED: 'Method not supported for this address.',
  AUTH_REQUIRED: 'Login required.',
  ADMIN_REQUIRED: 'Only admins can access this.',
  SUPER_ADMIN_REQUIRED: 'Only super admins can do this.',
  TARGET_FORBIDDEN: 'You may not change this account.',
  TARGET_IS_SUPER_ADMIN: 'Super admin accounts are managed only through env and the CLI.',
  CANNOT_ACT_ON_SELF: 'This action cannot be performed on your own account.',
  ROLE_NOT_ASSIGNABLE: 'You may not grant this role.',
  EMAIL_TAKEN: 'Email is already used by another account.',
  SUPER_ADMIN_EMAIL_RESERVED: 'This email is reserved for super admins.',
  PASSWORD_WEAK: 'Password is too weak.',
  REAUTH_FAILED: 'Your password is incorrect.',
  REAUTH_REQUIRED: 'Sign in with Google again first (at most 10 minutes before this action), then try again.',
  CONFIRM_EMAIL_MISMATCH: 'The confirmation email does not match the account email.',
  AUTH_UNAVAILABLE: 'The login service is unavailable.',
  INTERNAL_ERROR: 'A server error occurred; see the Server Log.',
});

const PASSWORD_REASONS = Object.freeze({
  too_short: (min) => `Password must be at least ${min} characters.`,
  too_long: () => 'Password must be at most 128 characters.',
  matches_identity: () => 'Password cannot be the same as email or name.',
});

const FIELD_LABELS = Object.freeze({
  email: 'email', name: 'name', role: 'role', capabilities: 'feature permissions', password: 'password', generate: 'generate',
  currentPassword: 'your password', confirmEmail: 'confirmation email', q: 'search', status: 'status', userId: 'user',
  success: 'result', range: 'time range', action: 'action', targetId: 'account', source: 'source', id: 'account id',
});

/**
 * Message for an API error payload (`{error, field?, reason?, min?}`) or a bare code.
 * @param {string | {error?: string, code?: string, field?: string, reason?: string, min?: number}} problem
 * @returns {string}
 */
export function userErrorMessage(problem) {
  const detail = typeof problem === 'string' ? { error: problem } : (problem ?? {});
  const code = detail.error ?? detail.code ?? 'INTERNAL_ERROR';
  if (code === 'PASSWORD_WEAK' && PASSWORD_REASONS[detail.reason]) return PASSWORD_REASONS[detail.reason](detail.min);
  if (code === 'INVALID_INPUT' && FIELD_LABELS[detail.field]) return `The ${FIELD_LABELS[detail.field]} field is not valid.`;
  return USER_ERROR_MESSAGES[code] ?? 'Request failed.';
}
