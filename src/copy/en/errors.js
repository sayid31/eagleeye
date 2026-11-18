// src/copy/en/errors.js
/**
 * One place that turns an API error into a sentence a person can act on. The UI never shows a raw code or an HTTP
 * status ("503 FEATURE_DISABLED"); it shows `errorMessage(...)`. Accepts a bare code, an API payload
 * (`{error|code, field?, reason?, min?}`), a `Response`-like `{status}`, or an Error carrying `.code`/`.status`/`.field`
 * (what the api modules throw). Resolution: known code → status class → generic sentence.
 *
 * @module copy/en/errors
 */

export const ERROR_MESSAGES = Object.freeze({
  INVALID_INPUT: 'The data sent is not valid. Check the fields and try again.',
  INVALID_JSON: 'The request could not be read. Reload the page and try again.',
  JSON_REQUIRED: 'The request could not be read. Reload the page and try again.',
  BAD_REQUEST: 'The request is not valid. Reload the page and try again.',
  FIELD_NOT_ALLOWED: 'Some fields cannot be changed.',
  BODY_TOO_LARGE: 'The data sent is too large.',
  RESPONSE_TOO_LARGE: 'The server response is too large to display.',
  NOT_FOUND: 'The data you looked for was not found. It may have been deleted.',
  PROVIDER_NOT_FOUND: 'This provider is not recognized.',
  UNKNOWN_ACTION: 'This action is not recognized.',
  METHOD_NOT_ALLOWED: 'This action is not supported. Reload the page and try again.',
  AUTH_REQUIRED: 'Your session has ended. Sign in again to continue.',
  UNAUTHORIZED: 'Your session has ended. Sign in again to continue.',
  FORBIDDEN: 'You do not have permission for this action.',
  ADMIN_REQUIRED: 'Only admins can open this.',
  SUPER_ADMIN_REQUIRED: 'Only super admins can do this.',
  CAPABILITY_REQUIRED: 'This feature has not been enabled for your account. Contact an admin.',
  FEATURE_DISABLED: 'This feature is temporarily turned off by an administrator.',
  TARGET_FORBIDDEN: 'You may not change this account.',
  TARGET_IS_SUPER_ADMIN: 'Super admin accounts are managed only through the server configuration.',
  CANNOT_ACT_ON_SELF: 'This action cannot be performed on your own account.',
  ROLE_NOT_ASSIGNABLE: 'You may not grant this role.',
  EMAIL_TAKEN: 'This email is already used by another account.',
  SUPER_ADMIN_EMAIL_RESERVED: 'This email is reserved for super admins.',
  PASSWORD_WEAK: 'Password is too weak.',
  REAUTH_FAILED: 'Your password is incorrect.',
  REAUTH_REQUIRED: 'Sign in with Google again first (within the last 10 minutes before this action), then try again.',
  CONFIRM_EMAIL_MISMATCH: 'The confirmation email does not match the account email.',
  PASSWORD_CHANGE_REQUIRED: 'You must change your password first.',
  INVALID_EMAIL_OR_PASSWORD: 'Incorrect email or password.',
  ACCOUNT_DISABLED: 'This account is inactive. Contact an admin.',
  GOOGLE_SIGN_IN_REQUIRED: 'This account signs in with Google.',
  GOOGLE_NOT_ALLOWED: 'This Google account is not allowed to sign in.',
  SOCIAL_SIGN_IN_REFUSED: 'Google login was denied.',
  SIGN_UP_DISABLED: 'Self-registration is not available. Ask an admin for an account.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
  ORIGIN_NOT_ALLOWED: 'The request was rejected because it came from an unrecognized address.',
  CROSS_SITE_REFUSED: 'The request was rejected because it came from another site.',
  AUTH_UNAVAILABLE: 'The login service is unavailable. Try again later.',
  AUTH_NOT_CONFIGURED: 'Login is not configured on this server.',
  INTERNAL_ERROR: 'Something went wrong on the server. See the Server Log for details.',
});

/** HTTP status class → sentence, used when the code is missing or unknown. */
export const STATUS_MESSAGES = Object.freeze({
  400: ERROR_MESSAGES.BAD_REQUEST,
  401: ERROR_MESSAGES.AUTH_REQUIRED,
  403: ERROR_MESSAGES.FORBIDDEN,
  404: ERROR_MESSAGES.NOT_FOUND,
  405: ERROR_MESSAGES.METHOD_NOT_ALLOWED,
  429: ERROR_MESSAGES.RATE_LIMITED,
  503: ERROR_MESSAGES.AUTH_UNAVAILABLE,
});

export const GENERIC_ERROR = 'Something went wrong. Try again in a moment.';
export const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';

const PASSWORD_REASONS = Object.freeze({
  too_short: (min) => (Number.isFinite(min) ? `Password must be at least ${min} characters.` : 'The password is too short.'),
  too_long: () => 'Password must be at most 128 characters.',
  matches_identity: () => 'Password cannot be the same as email or name.',
});

/** Field name (as the API reports it) → how the form labels it. */
export const FIELD_LABELS = Object.freeze({
  email: 'email', name: 'name', role: 'role', capabilities: 'feature permissions', password: 'password', generate: 'password choice',
  currentPassword: 'your password', confirmEmail: 'confirmation email', q: 'search', status: 'status', userId: 'user',
  success: 'result', action: 'action', targetId: 'account', source: 'source', id: 'account', reason: 'reason', gate: 'gate',
});

function normalize(problem) {
  if (typeof problem === 'string') return { code: problem };
  if (problem instanceof TypeError) return { code: null, network: true };
  if (!problem || typeof problem !== 'object') return {};
  return {
    code: problem.error ?? problem.code ?? null,
    status: Number.isInteger(problem.status) ? problem.status : null,
    field: problem.field ?? null,
    reason: problem.reason ?? null,
    min: problem.min,
  };
}

/**
 * Sentence for an API problem; never contains a raw code or HTTP status.
 * @param {unknown} problem See the module header for the accepted shapes.
 * @returns {string}
 */
export function errorMessage(problem) {
  const detail = normalize(problem);
  if (detail.network) return NETWORK_ERROR;
  if (detail.code === 'PASSWORD_WEAK' && PASSWORD_REASONS[detail.reason]) return PASSWORD_REASONS[detail.reason](detail.min);
  if (detail.code === 'INVALID_INPUT' && FIELD_LABELS[detail.field]) return `The ${FIELD_LABELS[detail.field]} field is not valid.`;
  if (detail.code && Object.hasOwn(ERROR_MESSAGES, detail.code)) return ERROR_MESSAGES[detail.code];
  if (detail.status && Object.hasOwn(STATUS_MESSAGES, detail.status)) return STATUS_MESSAGES[detail.status];
  if (detail.status && detail.status >= 500) return ERROR_MESSAGES.INTERNAL_ERROR;
  return GENERIC_ERROR;
}
