// src/auth/authCapabilities.mjs
/**
 * The three per-user feature toggles (`user.capabilities`, stored as JSON):
 * `layers` (Layer data), `ai` (Voice & AI), `premium` (Peta premium & search).
 * Admins and super_admins hold every toggle implicitly. Pure; runs in the
 * server and the browser bundles.
 *
 * @module auth/authCapabilities
 */

import { isAdminRole } from './authRoles.mjs';

export const CAPABILITY_KEYS = Object.freeze(['layers', 'ai', 'premium']);

/** Toggles of a new account (owner default, plan/auth/08 #1). */
export const DEFAULT_CAPABILITIES = Object.freeze({ layers: true, ai: true, premium: false });

const ALL_ON = Object.freeze({ layers: true, ai: true, premium: true });
const ALL_OFF = Object.freeze({ layers: false, ai: false, premium: false });

/**
 * Stored value (JSON string, object, or junk) → exactly `{layers, ai, premium}` booleans.
 * Unknown keys are dropped; a missing or unreadable value means every toggle OFF
 * (least privilege) — new accounts get DEFAULT_CAPABILITIES explicitly.
 * @param {unknown} raw
 * @returns {{layers: boolean, ai: boolean, premium: boolean}}
 */
export function normalizeCapabilities(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      // A corrupt column is treated as "nothing granted"; the account still signs in.
      return { ...ALL_OFF };
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...ALL_OFF };
  return Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, value[key] === true]));
}

/**
 * What an account may use right now: admins everything, users their toggles.
 * @param {{role?: string, capabilities?: unknown} | null | undefined} account
 * @returns {{layers: boolean, ai: boolean, premium: boolean}}
 */
export function effectiveCapabilities(account) {
  if (!account) return { ...ALL_OFF };
  if (isAdminRole(account.role)) return { ...ALL_ON };
  return normalizeCapabilities(account.capabilities);
}

/**
 * Serialize toggles for the `capabilities` column.
 * @param {unknown} capabilities
 * @returns {string}
 */
export function serializeCapabilities(capabilities) {
  return JSON.stringify(normalizeCapabilities(capabilities));
}
