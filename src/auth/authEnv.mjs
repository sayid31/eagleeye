// src/auth/authEnv.mjs
/**
 * Reads the shared-login settings from the environment. Problems are reported
 * by env var NAME only; values leave this module only inside the returned
 * config, which stays server-side.
 *
 * @module auth/authEnv
 */

import path from 'node:path';

/** Better Auth refuses shorter secrets in spirit (it warns); this app refuses them outright. */
export const MIN_AUTH_SECRET_LENGTH = 32;
const DEFAULT_PORT = 4173;
/** Relative to the checkout root; `data/` is gitignored and created owner-only. */
export const DEFAULT_AUTH_DATABASE_FILE = 'data/auth.db';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Google client ids are plain ASCII (`<digits>-<hash>.apps.googleusercontent.com`).
// A pasted value with an inner space or a smart character is the classic
// `401 invalid_client` that Google reports without saying why.
const PRINTABLE_ASCII_NO_SPACE = /^[\x21-\x7E]+$/;

const text = (value) => String(value ?? '').trim();

/**
 * Comma-separated email list → lower-cased, trimmed, de-duplicated, valid emails only.
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseEmailList(raw) {
  return [...new Set(text(raw).split(',').map((item) => item.trim().toLowerCase()).filter((item) => EMAIL.test(item)))];
}

function resolveBaseUrl(raw, port) {
  const candidate = text(raw) || `http://localhost:${port}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {{port?: number, rootDir?: string}} [options] `port` is the port the
 *   server really listens on (default for BETTER_AUTH_URL); `rootDir` anchors a
 *   relative AUTH_DATABASE_FILE.
 * @returns {{ok: true, secret: string, baseURL: string, origin: string, secureCookies: boolean,
 *   superAdminEmails: string[], googleClientId: string, googleClientSecret: string,
 *   databaseFile: string, missing: [], invalid: [], warnings: string[]}
 *   | {ok: false, missing: string[], invalid: string[], warnings: string[], databaseFile: string}}
 */
export function readAuthEnv(env = process.env, { port, rootDir = process.cwd() } = {}) {
  const missing = [];
  const invalid = [];
  const warnings = [];

  const ownSecret = text(env.BETTER_AUTH_SECRET);
  const legacySecret = text(env.ADMIN_SESSION_SECRET);
  const secret = ownSecret || legacySecret;
  if (!secret) missing.push('BETTER_AUTH_SECRET');
  else if (secret.length < MIN_AUTH_SECRET_LENGTH) invalid.push(ownSecret ? 'BETTER_AUTH_SECRET' : 'ADMIN_SESSION_SECRET');
  else if (!ownSecret) warnings.push('BETTER_AUTH_SECRET is not set; using ADMIN_SESSION_SECRET for compatibility.');

  const listenPort = Number.isInteger(port) && port > 0 ? port : (parseInt(env.PORT, 10) || DEFAULT_PORT);
  const base = resolveBaseUrl(env.BETTER_AUTH_URL, listenPort);
  if (!base) invalid.push('BETTER_AUTH_URL');

  const ownList = text(env.SUPER_ADMIN_EMAILS);
  const superAdminEmails = parseEmailList(ownList || env.ADMIN_EMAIL);
  if (!superAdminEmails.length) {
    if (ownList) invalid.push('SUPER_ADMIN_EMAILS');
    else if (text(env.ADMIN_EMAIL)) invalid.push('ADMIN_EMAIL');
    else missing.push('SUPER_ADMIN_EMAILS');
  } else if (!ownList) {
    warnings.push('SUPER_ADMIN_EMAILS is not set; using ADMIN_EMAIL for compatibility.');
  }

  const googleClientId = text(env.GOOGLE_CLIENT_ID);
  if (!googleClientId) missing.push('GOOGLE_CLIENT_ID');
  else if (!PRINTABLE_ASCII_NO_SPACE.test(googleClientId)) invalid.push('GOOGLE_CLIENT_ID');
  const googleClientSecret = text(env.GOOGLE_CLIENT_SECRET);
  if (!googleClientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  else if (!PRINTABLE_ASCII_NO_SPACE.test(googleClientSecret)) invalid.push('GOOGLE_CLIENT_SECRET');

  const databaseFile = path.resolve(rootDir, text(env.AUTH_DATABASE_FILE) || DEFAULT_AUTH_DATABASE_FILE);
  if (missing.length || invalid.length) return { ok: false, missing, invalid, warnings, databaseFile };

  return {
    ok: true,
    secret,
    baseURL: base.origin,
    origin: base.origin,
    secureCookies: base.protocol === 'https:',
    superAdminEmails,
    googleClientId,
    googleClientSecret,
    databaseFile,
    missing: [],
    invalid: [],
    warnings,
  };
}
