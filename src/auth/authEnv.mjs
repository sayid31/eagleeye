// src/auth/authEnv.mjs
/**
 * Reads the shared-login settings from the environment. Problems are reported
 * by env var NAME only; values leave this module only inside the returned
 * config, which stays server-side.
 *
 * @module auth/authEnv
 */

import path from 'node:path';
import { parseTrustedProxies } from './clientIp.mjs';

/** Better Auth refuses shorter secrets in spirit (it warns); this app refuses them outright. */
export const MIN_AUTH_SECRET_LENGTH = 32;
const DEFAULT_PORT = 4173;
/** Relative to the checkout root; `.gev-data/` is gitignored, denied to the static server and created owner-only. */
export const DEFAULT_AUTH_DATABASE_FILE = '.gev-data/auth.db';
/** Where phase 1a kept it; moved once to DEFAULT_AUTH_DATABASE_FILE (authDatabase.mjs). */
export const LEGACY_AUTH_DATABASE_FILE = 'data/auth.db';

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
 * Google sign-in (super_admin only) is optional: both values or neither. A
 * half or malformed pair disables it with a warning instead of blocking login.
 * @returns {{clientId: string, clientSecret: string} | null}
 */
function readGoogle(env, warnings) {
  const clientId = text(env.GOOGLE_CLIENT_ID);
  const clientSecret = text(env.GOOGLE_CLIENT_SECRET);
  if (!clientId && !clientSecret) return null;
  const bad = [];
  if (!clientId || !PRINTABLE_ASCII_NO_SPACE.test(clientId)) bad.push('GOOGLE_CLIENT_ID');
  if (!clientSecret || !PRINTABLE_ASCII_NO_SPACE.test(clientSecret)) bad.push('GOOGLE_CLIENT_SECRET');
  if (bad.length) {
    warnings.push(`Google sign-in disabled: ${bad.join(', ')} missing or invalid.`);
    return null;
  }
  return { clientId, clientSecret };
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {{port?: number, rootDir?: string}} [options] `port` is the port the
 *   server really listens on (default for BETTER_AUTH_URL); `rootDir` anchors a
 *   relative AUTH_DATABASE_FILE.
 * @returns {{ok: true, secret: string, baseURL: string, origin: string, secureCookies: boolean,
 *   superAdminEmails: string[], google: {clientId: string, clientSecret: string} | null,
 *   trustedProxies: ReturnType<typeof parseTrustedProxies>, databaseFile: string,
 *   legacyDatabaseFile: string | null, missing: [], invalid: [], warnings: string[]}
 *   | {ok: false, missing: string[], invalid: string[], warnings: string[], databaseFile: string, legacyDatabaseFile: string | null}}
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

  // No ADMIN_EMAIL fallback any more: super_admin is SUPER_ADMIN_EMAILS only.
  const ownList = text(env.SUPER_ADMIN_EMAILS);
  const superAdminEmails = parseEmailList(ownList);
  if (!superAdminEmails.length) (ownList ? invalid : missing).push('SUPER_ADMIN_EMAILS');
  if (!ownList && text(env.ADMIN_EMAIL)) warnings.push('ADMIN_EMAIL is no longer read; move the address to SUPER_ADMIN_EMAILS.');

  const google = readGoogle(env, warnings);
  const trustedProxies = parseTrustedProxies(env.AUTH_TRUSTED_PROXIES);
  if (trustedProxies.invalid.length) warnings.push(`AUTH_TRUSTED_PROXIES has ${trustedProxies.invalid.length} invalid entr${trustedProxies.invalid.length === 1 ? 'y' : 'ies'}; ignored.`);

  const usesDefaultFile = !text(env.AUTH_DATABASE_FILE);
  const databaseFile = path.resolve(rootDir, text(env.AUTH_DATABASE_FILE) || DEFAULT_AUTH_DATABASE_FILE);
  const legacyDatabaseFile = usesDefaultFile ? path.resolve(rootDir, LEGACY_AUTH_DATABASE_FILE) : null;
  if (missing.length || invalid.length) return { ok: false, missing, invalid, warnings, databaseFile, legacyDatabaseFile };

  return {
    ok: true,
    secret,
    baseURL: base.origin,
    origin: base.origin,
    secureCookies: base.protocol === 'https:',
    superAdminEmails,
    google,
    trustedProxies,
    databaseFile,
    legacyDatabaseFile,
    missing: [],
    invalid: [],
    warnings,
  };
}
