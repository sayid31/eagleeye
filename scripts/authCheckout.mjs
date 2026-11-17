// scripts/authCheckout.mjs
/**
 * Opens this checkout's auth database the way the dev server does (same
 * dotenv precedence, same AUTH_DATABASE_FILE, same secret), for scripts:
 * `npm run auth:migrate` and the `test:track` harness session. Prints nothing;
 * callers report env var NAMES only.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { loadCheckoutEnv } from '../src/config/dotenvPrecedence.mjs';
import { readAuthEnv } from '../src/auth/authEnv.mjs';
import { openAuthDatabase } from '../src/auth/authDatabase.mjs';
import { createAuthInstance } from '../src/auth/authInstance.mjs';
import { mintSessionCookie } from '../src/auth/authSessionMint.mjs';

/** Dedicated account the test:track harness signs in as (active `user`, never an admin). */
export const HARNESS_EMAIL = 'track-harness@example.invalid';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {{port?: number, mode?: string}} [options] `port` = the dev server's port (default BETTER_AUTH_URL).
 * @returns {Promise<{config: object, auth?: object, db?: object}>} `auth` only when configured.
 */
export async function openCheckoutAuth({ port, mode = 'development' } = {}) {
  loadCheckoutEnv({ target: process.env, loadEnv, mode, dir: REPO_ROOT });
  const config = readAuthEnv(process.env, { port, rootDir: REPO_ROOT });
  if (!config.ok) return { config };
  const { db } = await openAuthDatabase(config.databaseFile);
  return { config, db, auth: createAuthInstance({ database: db, config }) };
}

/**
 * One line naming what is missing/invalid (names only, never values).
 * @param {{missing: string[], invalid: string[]}} config
 * @returns {string}
 */
export function describeUnconfigured(config) {
  return `login is not configured — missing: ${config.missing.join(', ') || '-'}; invalid: ${config.invalid.join(', ') || '-'}`;
}

/**
 * A real session for the harness account, minted directly in the auth
 * database (needs this checkout's secret and database — the same power as
 * owning the server; the server itself has no bypass). Sessions left by an
 * earlier run that crashed before `revoke` are deleted first.
 * @param {{port?: number}} [options]
 * @returns {Promise<{cookieName: string, cookieValue: string, userId: string, revoke: () => Promise<void>}>}
 */
export async function mintHarnessSession({ port } = {}) {
  const { config, auth } = await openCheckoutAuth({ port });
  if (!auth) throw new Error(describeUnconfigured(config));
  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(HARNESS_EMAIL);
  if (existing?.user) await ctx.internalAdapter.deleteUserSessions(existing.user.id);
  const minted = await mintSessionCookie(auth, { email: HARNESS_EMAIL, name: 'test:track harness', role: 'user', status: 'active' });
  return {
    cookieName: minted.cookieName,
    cookieValue: minted.cookieValue,
    userId: minted.userId,
    revoke: () => ctx.internalAdapter.deleteSession(minted.token),
  };
}
