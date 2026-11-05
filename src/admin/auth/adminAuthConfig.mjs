// src/admin/auth/adminAuthConfig.mjs
/**
 * Reads the admin-login settings from the environment. Only variable NAMES
 * are ever reported back; values never leave this module except as the
 * returned config object used server-side.
 *
 * @module admin/auth/adminAuthConfig
 */

const MIN_SESSION_SECRET_LENGTH = 32;
const DEFAULT_PORT = 4173;
const DEFAULT_SESSION_TTL_HOURS = 24;
const MS_PER_HOUR = 3_600_000;
const CALLBACK_PATH = '/api/admin/auth/callback';

const text = (value) => String(value ?? '').trim();

function resolveRedirectUri(env) {
  const explicit = text(env.ADMIN_OAUTH_REDIRECT_URI);
  const uri = explicit || `http://localhost:${parseInt(env.PORT, 10) || DEFAULT_PORT}${CALLBACK_PATH}`;
  try {
    const parsed = new URL(uri);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} [env]
 * @returns {{ok: true, clientId: string, clientSecret: string, adminEmail: string,
 *   sessionSecret: string, redirectUri: string, allowedOrigin: string,
 *   secureCookies: boolean, sessionTtlMs: number}
 *   | {ok: false, missing: string[]}}
 */
export function readAdminAuthConfig(env = process.env) {
  const clientId = text(env.GOOGLE_CLIENT_ID);
  const clientSecret = text(env.GOOGLE_CLIENT_SECRET);
  const adminEmail = text(env.ADMIN_EMAIL).toLowerCase();
  const sessionSecret = text(env.ADMIN_SESSION_SECRET);
  const redirect = resolveRedirectUri(env);

  const missing = [];
  if (!clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) missing.push('ADMIN_EMAIL');
  if (sessionSecret.length < MIN_SESSION_SECRET_LENGTH) missing.push('ADMIN_SESSION_SECRET');
  if (!redirect) missing.push('ADMIN_OAUTH_REDIRECT_URI');
  if (missing.length) return { ok: false, missing };

  const hours = Number(env.ADMIN_SESSION_TTL_HOURS);
  return {
    ok: true,
    clientId,
    clientSecret,
    adminEmail,
    sessionSecret,
    redirectUri: redirect.href,
    allowedOrigin: redirect.origin,
    secureCookies: redirect.protocol === 'https:',
    sessionTtlMs: (hours > 0 ? hours : DEFAULT_SESSION_TTL_HOURS) * MS_PER_HOUR,
  };
}
