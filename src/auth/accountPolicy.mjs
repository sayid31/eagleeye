// src/auth/accountPolicy.mjs
/**
 * Account-state rules shared by the guard and the sign-in hooks (plan/auth/03
 * §Throttle, 02 §mustChangePassword). Pure.
 *
 * Throttle, not lockout: after LOGIN_THROTTLE_THRESHOLD failed passwords the
 * account refuses sign-in for an exponentially growing, capped delay that
 * expires by itself — a stranger can slow an account down, never lock it.
 *
 * @module auth/accountPolicy
 */

export const LOGIN_THROTTLE_THRESHOLD = 5;
export const LOGIN_THROTTLE_BASE_MS = 60 * 1000;
export const LOGIN_THROTTLE_MAX_MS = 15 * 60 * 1000;

/** `/api/*` an account that must change its password may still call (exact paths). */
export const PASSWORD_CHANGE_OPEN_API = Object.freeze(['/api/me']);

/**
 * Throttle delay after the n-th consecutive failure: none below the threshold,
 * then 1, 2, 4, 8 minutes … capped at 15.
 * @param {number} failures
 * @returns {number} Milliseconds (0 = not throttled).
 */
export function throttleDelayMs(failures) {
  const count = Number.isFinite(failures) ? Math.floor(failures) : 0;
  if (count < LOGIN_THROTTLE_THRESHOLD) return 0;
  const exponent = count - LOGIN_THROTTLE_THRESHOLD;
  // 2^exponent overflows long before it matters; the cap applies from exponent 4 on.
  return Math.min(LOGIN_THROTTLE_BASE_MS * 2 ** Math.min(exponent, 30), LOGIN_THROTTLE_MAX_MS);
}

/**
 * @param {unknown} throttleUntil Date, ISO string or epoch ms (SQLite stores ISO strings).
 * @param {number} [now]
 * @returns {boolean}
 */
export function isThrottled(throttleUntil, now = Date.now()) {
  if (throttleUntil === null || throttleUntil === undefined || throttleUntil === '') return false;
  const until = throttleUntil instanceof Date ? throttleUntil.getTime() : new Date(throttleUntil).getTime();
  return Number.isFinite(until) && until > now;
}

/**
 * Whether an account is closed for good or for now: deactivated or deleted.
 * @param {{banned?: unknown, deletedAt?: unknown} | null | undefined} user
 * @returns {boolean}
 */
export function isAccountClosed(user) {
  return Boolean(user && (user.banned === true || user.banned === 1 || user.deletedAt));
}
