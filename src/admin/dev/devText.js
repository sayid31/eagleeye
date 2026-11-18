// src/admin/dev/devText.js
/**
 * Messages of the `/dev` system API (devHttp.mjs: `{error: CODE, message}` replies). Server side only: the pages never
 * show these; they word an error with `errorMessage()` from src/copy/en/errors.js, and every other UI string of the
 * system pages lives in src/copy/en/system.js and systemLogs.js.
 *
 * @module admin/dev/devText
 */

/** API error code → message (server replies and client fallbacks). */
export const DEV_ERROR_MESSAGES = Object.freeze({
  INVALID_INPUT: 'Invalid input.',
  INVALID_JSON: 'Body is not valid JSON.',
  BODY_TOO_LARGE: 'Body is too large.',
  METHOD_NOT_ALLOWED: 'Method not supported.',
  NOT_FOUND: 'Endpoint does not exist.',
  REAUTH_FAILED: 'Wrong password.',
  REAUTH_REQUIRED: 'Enter your password, or sign in with Google again and retry within 10 minutes.',
  AUTH_UNAVAILABLE: 'Login is unavailable; see the Server Log.',
  INTERNAL_ERROR: 'A server error occurred; see the Server Log.',
  SUPER_ADMIN_REQUIRED: 'Only super admins can access this.',
  AUTH_REQUIRED: 'Session ended; sign in again.',
});
