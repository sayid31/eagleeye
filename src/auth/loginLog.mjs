// src/auth/loginLog.mjs
/**
 * `login_log` v2: one row per sign-in attempt, successful or not (plan/auth/06
 * §Login log). A known account is recorded by id; an unknown email only as a
 * keyed hash (HMAC with the auth secret), so the table never holds an address
 * someone merely typed. No API deletes rows.
 *
 * A failed insert never fails the sign-in: it is reported on the console with
 * the user id and the error code only — no email, no IP, no user agent.
 *
 * @module auth/loginLog
 */

import { createHmac } from 'node:crypto';
import { normalizeEmail } from './authRoles.mjs';

export const LOGIN_METHODS = Object.freeze(['password', 'google']);
export const LOGIN_FAILURE_REASONS = Object.freeze(['bad_credentials', 'throttled', 'disabled', 'rate_limited', 'google_only', 'google_denied']);
const MAX_USER_AGENT_LENGTH = 512;

/**
 * Keyed hash of a normalized email (same input → same hash, not reversible without the secret).
 * @param {string} email
 * @param {string} secret
 * @returns {string} hex
 */
export function hashEmail(email, secret) {
  return createHmac('sha256', secret).update(`login-email:${normalizeEmail(email)}`).digest('hex');
}

/**
 * @param {{userId?: string | null, emailHash?: string | null, success: boolean, reason?: string | null,
 *   method: string, ip?: string | null, userAgent?: string | null}} attempt
 * @param {() => Date} [now]
 * @returns {object} A login_log row.
 */
export function loginLogEntry(attempt, now = () => new Date()) {
  if (!LOGIN_METHODS.includes(attempt.method)) throw new Error(`login_log: unknown method "${attempt.method}"`);
  if (!attempt.success && !LOGIN_FAILURE_REASONS.includes(attempt.reason)) throw new Error(`login_log: unknown reason "${attempt.reason}"`);
  return {
    userId: attempt.userId ? String(attempt.userId) : null,
    emailHash: attempt.userId ? null : (attempt.emailHash ?? null),
    success: Boolean(attempt.success),
    reason: attempt.success ? null : attempt.reason,
    createdAt: now(),
    ip: attempt.ip ? String(attempt.ip) : null,
    userAgent: attempt.userAgent ? String(attempt.userAgent).slice(0, MAX_USER_AGENT_LENGTH) : null,
    method: attempt.method,
  };
}

/**
 * Wrap a row writer so callers on the sign-in path can never throw.
 * @param {(row: object) => Promise<unknown>} write
 * @param {(message: string) => void} [warn]
 * @returns {(attempt: object) => Promise<boolean>} true when the row was written.
 */
export function createLoginRecorder(write, warn = (message) => console.warn(message)) {
  return async (attempt) => {
    try {
      await write(loginLogEntry(attempt));
      return true;
    } catch (error) {
      warn(`[auth] login_log insert failed for user ${String(attempt?.userId ?? '-')}: ${error?.code || error?.message || 'unknown error'}`);
      return false;
    }
  };
}
