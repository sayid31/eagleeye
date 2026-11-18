// src/auth/authReadiness.mjs
/**
 * Auth readiness checks shown by `npm run doctor` and `/dev` → Ringkasan
 * sistem (plan/auth/06 §Operasional). Pure: input is the environment plus
 * COUNTS read from the auth database (authReadinessFacts.mjs); output is a
 * list of `{id, level, params}` — never a secret, an email or a key value.
 * Messages are rendered by the caller (English in the CLI, English in /dev).
 *
 * @module auth/authReadiness
 */

import { readAuthEnv } from './authEnv.mjs';

export const READINESS_LEVELS = Object.freeze(['ok', 'warn', 'error']);
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::', '[::]']);
const LOOPBACK_HOSTS = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i;

const check = (id, level, params = {}) => ({ id, level, params });

/**
 * Whether the server is reachable beyond this machine: HOST binds every
 * interface, or BETTER_AUTH_URL names a non-loopback host.
 * @param {Record<string, string | undefined>} env
 * @returns {{exposed: boolean, via: 'host' | 'url' | null}}
 */
export function publicExposure(env) {
  if (WILDCARD_HOSTS.has(String(env.HOST ?? '').trim())) return { exposed: true, via: 'host' };
  const raw = String(env.BETTER_AUTH_URL ?? '').trim();
  if (!raw) return { exposed: false, via: null };
  try {
    return LOOPBACK_HOSTS.test(new URL(raw).hostname) ? { exposed: false, via: null } : { exposed: true, via: 'url' };
  } catch {
    // An unparsable URL is reported by the env check; it exposes nothing by itself.
    return { exposed: false, via: null };
  }
}

function envChecks(env) {
  const config = readAuthEnv(env, { port: 1, rootDir: '.' });
  const named = (name) => (config.missing.includes(name) ? 'missing' : config.invalid.includes(name) ? 'invalid' : null);
  const secretProblem = named('BETTER_AUTH_SECRET') ?? named('ADMIN_SESSION_SECRET');
  const legacySecret = !String(env.BETTER_AUTH_SECRET ?? '').trim() && Boolean(String(env.ADMIN_SESSION_SECRET ?? '').trim());
  const emails = named('SUPER_ADMIN_EMAILS');
  return [
    secretProblem ? check('auth.secret', 'error', { problem: secretProblem }) : check('auth.secret', legacySecret ? 'warn' : 'ok', { legacy: legacySecret }),
    emails ? check('auth.superAdminEmails', 'error', { problem: emails }) : check('auth.superAdminEmails', 'ok', { count: config.superAdminEmails?.length ?? 0 }),
    ...(named('BETTER_AUTH_URL') ? [check('auth.url', 'error', { problem: 'invalid' })] : []),
  ];
}

function databaseChecks(facts) {
  if (!facts?.available) return [check('auth.database', 'warn', { problem: facts?.reason ?? 'missing' })];
  const list = [check('auth.database', 'ok')];
  const { envEmails, ready, noAccount, blocked } = facts;
  list.push(check('auth.superAdminAccess', noAccount || blocked ? 'warn' : 'ok', { envEmails, ready, noAccount, blocked }));
  if (facts.reconcileBlocked > 0) list.push(check('auth.reconcileBlocked', 'warn', { count: facts.reconcileBlocked }));
  return list;
}

function exposureCheck(env, facts) {
  const { exposed, via } = publicExposure(env);
  if (!exposed) return check('auth.exposure', 'ok', { exposed: false });
  const passwordOnly = facts?.available ? facts.passwordOnlyAdmins : null;
  // Unknown counts while exposed are treated as the risky case.
  if (passwordOnly === 0) return check('auth.exposure', 'ok', { exposed: true, via, passwordOnlyAdmins: 0 });
  return check('auth.exposure', 'warn', { exposed: true, via, passwordOnlyAdmins: passwordOnly });
}

/**
 * @param {{env: Record<string, string | undefined>, facts?: {available: boolean, reason?: string, envEmails?: number,
 *   ready?: number, noAccount?: number, blocked?: number, passwordOnlyAdmins?: number, reconcileBlocked?: number} | null}} input
 * @returns {{id: string, level: 'ok' | 'warn' | 'error', params: object}[]}
 */
export function authReadinessChecks({ env, facts = null }) {
  const list = envChecks(env);
  // Without a usable config the database facts cannot be trusted (no env emails to compare).
  if (list.every((item) => item.level !== 'error')) list.push(...databaseChecks(facts));
  list.push(exposureCheck(env, facts));
  return list;
}

/** The checks worth showing as warnings (warn + error). */
export const readinessWarnings = (checks) => checks.filter((item) => item.level !== 'ok');

/** English one-liners for the CLI doctor (`/dev` renders its own English copy). */
export const READINESS_MESSAGES_EN = Object.freeze({
  'auth.secret': ({ problem, legacy }) => (problem === 'missing' ? 'BETTER_AUTH_SECRET is not set'
    : problem ? 'BETTER_AUTH_SECRET is shorter than 32 characters'
      : legacy ? 'only the legacy ADMIN_SESSION_SECRET is set; rename it to BETTER_AUTH_SECRET' : 'BETTER_AUTH_SECRET present (length ok)'),
  'auth.superAdminEmails': ({ problem, count }) => (problem === 'missing' ? 'SUPER_ADMIN_EMAILS is not set'
    : problem ? 'SUPER_ADMIN_EMAILS has no valid address' : `SUPER_ADMIN_EMAILS present (${count} address${count === 1 ? '' : 'es'})`),
  'auth.url': () => 'BETTER_AUTH_URL is not a plain http(s) origin',
  'auth.database': ({ problem }) => (problem === 'missing' ? 'auth database not created yet (created on first server start)'
    : problem ? `auth database unreadable (${problem})` : 'auth database readable'),
  'auth.superAdminAccess': ({ envEmails, ready, noAccount, blocked }) => (!noAccount && !blocked ? `${ready} of ${envEmails} super_admin email(s) can sign in (Google or CLI password)`
    : `${ready} of ${envEmails} super_admin email(s) can sign in; ${noAccount} without an account (run npm run auth:set-password), ${blocked} with an admin-set password only (not promoted)`),
  'auth.reconcileBlocked': ({ count }) => `${count} role.reconcile.blocked audit entr${count === 1 ? 'y' : 'ies'}: an env email was refused super_admin (see /dev → Audit)`,
  'auth.exposure': ({ exposed, via, passwordOnlyAdmins }) => (!exposed ? 'server bound to this machine only'
    : passwordOnlyAdmins === 0 ? `reachable beyond localhost (${via === 'host' ? 'HOST' : 'BETTER_AUTH_URL'}); no password-only admin`
      : `reachable beyond localhost (${via === 'host' ? 'HOST' : 'BETTER_AUTH_URL'}) while ${passwordOnlyAdmins ?? 'an unknown number of'} admin(s) sign in with a password only — restrict /admin, /dev and /api/admin/* at the reverse proxy (IP allowlist/VPN)`),
});
