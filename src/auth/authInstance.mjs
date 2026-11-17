// src/auth/authInstance.mjs
/**
 * Builds the Better Auth instance: email+password with public sign-up OFF,
 * Google for super_admin only, NO admin plugin (account management goes
 * through `accountService.mjs` on the internal adapter). Field definitions
 * live in authSchema.mjs, hooks in authHooks.mjs.
 *
 * @module auth/authInstance
 */

import { betterAuth } from 'better-auth';
import { AUTH_BASE_PATH } from './authEndpointPolicy.mjs';
import { CLIENT_IP_HEADER, createAuthHooks } from './authHooks.mjs';
import { LOGIN_LOG_MODEL, USER_FIELDS, gevSchemaPlugin } from './authSchema.mjs';
import { createLoginRecorder } from './loginLog.mjs';
import { createLoginThrottle } from './loginThrottle.mjs';
import { PASSWORD_MAX, PASSWORD_MIN_USER } from './passwordPolicy.mjs';

export { AUTH_BASE_PATH, CLIENT_IP_HEADER, LOGIN_LOG_MODEL };
export { migrateAuthSchema } from './authMigrations.mjs';

/** Session lifetime for every role, sliding by a day of use (plan/auth/03 §Sesi). */
export const SESSION_EXPIRES_IN_S = 3 * 24 * 60 * 60;
export const SESSION_UPDATE_AGE_S = 24 * 60 * 60;
/** Cookies are `gev.session_token` etc.: localhost cookies are shared across ports, so name them. */
export const COOKIE_PREFIX = 'gev';

const EMAIL_PATTERN = /[^\s@<>"']+@[^\s@<>"']+\.[A-Za-z]{2,}/g;

/** Better Auth log lines → console, with anything email-shaped masked (logging rule). */
function authLogger(level, message, ...args) {
  const text = [message, ...args.map((arg) => (arg instanceof Error ? arg.message : typeof arg === 'string' ? arg : ''))]
    .filter(Boolean).join(' ').replace(EMAIL_PATTERN, '[email]');
  if (level === 'error') console.error(`[auth] ${text}`);
  else console.warn(`[auth] ${text}`);
}

/**
 * @param {object} options
 * @param {object} options.database `bun:sqlite` Database or `node:sqlite` DatabaseSync.
 * @param {ReturnType<import('./authEnv.mjs').readAuthEnv> & {ok: true}} options.config
 * @param {(row: object) => Promise<unknown>} [options.writeLoginLog] Override the login_log insert (tests).
 * @param {(message: string) => void} [options.warn]
 * @returns {ReturnType<typeof betterAuth>}
 */
export function createAuthInstance({ database, config, writeLoginLog, warn }) {
  let auth;
  const getContext = () => auth.$context;
  const write = writeLoginLog ?? (async (row) => (await getContext()).adapter.create({ model: LOGIN_LOG_MODEL, data: row }));
  const recordLogin = createLoginRecorder(write, warn);
  const throttle = createLoginThrottle({ getContext, secret: config.secret });
  const { hooks, databaseHooks } = createAuthHooks({ config, recordLogin, throttle, getContext });

  auth = betterAuth({
    appName: 'EagleEye View',
    baseURL: config.baseURL,
    basePath: AUTH_BASE_PATH,
    secret: config.secret,
    database,
    // Only the configured origin may drive state-changing auth endpoints; the
    // auth plugin additionally requires a matching Origin on every POST.
    trustedOrigins: [config.origin],
    telemetry: { enabled: false },
    logger: { level: 'warn', log: authLogger },
    emailAndPassword: {
      enabled: true,
      // No public sign-up: accounts come from an admin (accountService) or the CLI.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_USER,
      maxPasswordLength: PASSWORD_MAX,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
    },
    socialProviders: config.google ? {
      google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret, prompt: 'select_account' },
    } : {},
    // Google never attaches to an existing account with the same email (that
    // could be an admin-created password account whose password an admin knows).
    account: { accountLinking: { enabled: false } },
    user: { additionalFields: USER_FIELDS },
    session: { expiresIn: SESSION_EXPIRES_IN_S, updateAge: SESSION_UPDATE_AGE_S, cookieCache: { enabled: false } },
    // Per-IP limits in every environment (Better Auth enables them only in production by default).
    rateLimit: { enabled: true, storage: 'database' },
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      // Pinned: Better Auth otherwise turns its origin/callbackURL checks OFF
      // whenever NODE_ENV=test or TEST is truthy (`bun test` sets NODE_ENV=test).
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: config.secureCookies,
      // Set by the auth plugin from the socket (or AUTH_TRUSTED_PROXIES); a client value is overwritten.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    plugins: [gevSchemaPlugin()],
    hooks,
    databaseHooks,
  });
  return auth;
}
