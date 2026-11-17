// src/auth/passwordPolicy.mjs
/**
 * Password policy (plan/auth/03 §Kebijakan password): length only, no
 * composition rules (NIST SP 800-63B rev-4). Admins and super_admins need a
 * longer password because it is their only factor. Pure; runs in the server
 * (create, reset, change-password hook) and the browser (form hints).
 *
 * @module auth/passwordPolicy
 */

import { isAdminRole, normalizeEmail } from './authRoles.mjs';

export const PASSWORD_MIN_USER = 12;
export const PASSWORD_MIN_ADMIN = 15;
export const PASSWORD_MAX = 128;
/** Length of a generated temporary password (shown once to the admin). */
export const GENERATED_PASSWORD_LENGTH = 20;
// No 0/O/1/l/I: the admin reads it out or pastes it into a chat.
const GENERATED_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Minimum length for a role.
 * @param {unknown} role
 * @returns {number}
 */
export function minPasswordLength(role) {
  return isAdminRole(role) ? PASSWORD_MIN_ADMIN : PASSWORD_MIN_USER;
}

/**
 * @param {unknown} password
 * @param {{email?: string, name?: string, role?: string}} [identity]
 * @returns {{ok: true} | {ok: false, code: 'PASSWORD_WEAK', reason: 'too_short' | 'too_long' | 'matches_identity', min: number}}
 */
export function validatePassword(password, { email, name, role } = {}) {
  const min = minPasswordLength(role);
  const value = typeof password === 'string' ? password : '';
  const weak = (reason) => ({ ok: false, code: 'PASSWORD_WEAK', reason, min });
  if ([...value].length < min) return weak('too_short');
  if ([...value].length > PASSWORD_MAX) return weak('too_long');
  const lowered = value.trim().toLowerCase();
  const identities = [normalizeEmail(email), normalizeEmail(email).split('@')[0], String(name ?? '').trim().toLowerCase()];
  if (identities.some((identity) => identity && lowered === identity)) return weak('matches_identity');
  return { ok: true };
}

/**
 * A random temporary password from a crypto RNG (Web Crypto: Node, Bun and browsers).
 * Rejection sampling keeps every character equally likely.
 * @param {number} [length]
 * @returns {string}
 */
export function generatePassword(length = GENERATED_PASSWORD_LENGTH) {
  const alphabetSize = GENERATED_ALPHABET.length;
  const limit = Math.floor(256 / alphabetSize) * alphabetSize;
  let out = '';
  while (out.length < length) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte < limit && out.length < length) out += GENERATED_ALPHABET[byte % alphabetSize];
    }
  }
  return out;
}
