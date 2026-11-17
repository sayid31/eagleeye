// src/auth/authInstance.mjs
/**
 * Builds the Better Auth instance of the shared login (Google only) and runs
 * its schema migration. Inputs come from `readAuthEnv` (src/auth/authEnv.mjs)
 * and `openAuthDatabase` (src/auth/authDatabase.mjs).
 *
 * @module auth/authInstance
 */

import { betterAuth } from 'better-auth';
import { initialAccount } from './authRoles.mjs';
import { LOGIN_LOG_MODEL, createLoginRecorder, loginLogSchemaPlugin } from './loginLog.mjs';

export const AUTH_BASE_PATH = '/api/auth';
/**
 * Request header the auth plugin sets from the TCP socket before Better Auth
 * sees the request (any client-sent value is overwritten), so session rows
 * and login_log carry the real peer address without trusting X-Forwarded-For.
 */
export const CLIENT_IP_HEADER = 'x-gev-client-ip';

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
 * @param {(entry: object) => Promise<unknown>} [options.writeLoginLog] Override the
 *   login_log insert (tests inject failures here).
 * @param {(message: string) => void} [options.warn]
 * @returns {ReturnType<typeof betterAuth>}
 */
export function createAuthInstance({ database, config, writeLoginLog, warn }) {
  let auth;
  const write = writeLoginLog ?? (async (entry) => (await auth.$context).adapter.create({ model: LOGIN_LOG_MODEL, data: entry }));
  const recordLogin = createLoginRecorder(write, warn);

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
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        prompt: 'select_account',
      },
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'user', input: false },
        status: { type: 'string', required: false, defaultValue: 'pending', input: false },
      },
    },
    advanced: {
      useSecureCookies: config.secureCookies,
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    plugins: [loginLogSchemaPlugin()],
    databaseHooks: {
      user: {
        create: {
          // Role and status are decided here, never by the client: env
          // super-admins start active, everyone else waits for approval.
          before: async (user) => ({ data: { ...user, ...initialAccount(user.email, config.superAdminEmails) } }),
        },
      },
      session: {
        create: {
          after: async (session) => { await recordLogin(session); },
        },
      },
    },
  });
  return auth;
}

/**
 * Create or upgrade every table (Better Auth core + login_log). Idempotent:
 * a second run finds nothing to do.
 * @param {ReturnType<typeof betterAuth>} auth
 * @returns {Promise<{created: string[], added: string[]}>} Table names touched.
 */
export async function migrateAuthSchema(auth) {
  const { getMigrations } = await import('better-auth/db/migration');
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  return { created: toBeCreated.map((t) => t.table), added: toBeAdded.map((t) => t.table) };
}
