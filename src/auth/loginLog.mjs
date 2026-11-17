// src/auth/loginLog.mjs
/**
 * `login_log` table: one row per session Better Auth creates (= one Google
 * sign-in). Declared as a Better Auth plugin schema so the same programmatic
 * migration that creates `user`/`session` creates it too (and a later
 * Postgres adapter gets it for free). No UI reads it yet (step 1b).
 *
 * A failed insert never fails the sign-in: it is reported once on the console
 * with the user id and the error code only — no email, no IP, no user agent.
 *
 * @module auth/loginLog
 */

export const LOGIN_LOG_MODEL = 'loginLog';
export const LOGIN_LOG_TABLE = 'login_log';
const MAX_USER_AGENT_LENGTH = 512;

/**
 * Better Auth plugin that only contributes the table definition.
 * @returns {import('better-auth').BetterAuthPlugin}
 */
export function loginLogSchemaPlugin() {
  return {
    id: 'gev-login-log',
    schema: {
      [LOGIN_LOG_MODEL]: {
        modelName: LOGIN_LOG_TABLE,
        fields: {
          userId: { type: 'string', required: true, index: true },
          createdAt: { type: 'date', required: true },
          ip: { type: 'string', required: false },
          userAgent: { type: 'string', required: false },
          method: { type: 'string', required: true },
        },
      },
    },
  };
}

/**
 * Better Auth session row → login_log row.
 * @param {{userId: string, ipAddress?: string | null, userAgent?: string | null, createdAt?: Date}} session
 * @param {() => Date} [now]
 * @returns {{userId: string, createdAt: Date, ip: string | null, userAgent: string | null, method: 'google'}}
 */
export function loginLogEntry(session, now = () => new Date()) {
  return {
    userId: String(session.userId),
    createdAt: session.createdAt instanceof Date ? session.createdAt : now(),
    ip: session.ipAddress ? String(session.ipAddress) : null,
    userAgent: session.userAgent ? String(session.userAgent).slice(0, MAX_USER_AGENT_LENGTH) : null,
    // Google is the only sign-in method in this phase.
    method: 'google',
  };
}

/**
 * Wraps a writer so the `session.create.after` hook can never throw.
 * @param {(entry: object) => Promise<unknown>} write
 * @param {(message: string) => void} [warn]
 * @returns {(session: object) => Promise<boolean>} true when the row was written.
 */
export function createLoginRecorder(write, warn = (message) => console.warn(message)) {
  return async (session) => {
    try {
      await write(loginLogEntry(session));
      return true;
    } catch (error) {
      warn(`[auth] login_log insert failed for user ${String(session?.userId ?? '?')}: ${error?.code || error?.message || 'unknown error'}`);
      return false;
    }
  };
}
