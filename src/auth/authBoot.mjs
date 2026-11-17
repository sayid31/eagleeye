// src/auth/authBoot.mjs
/**
 * Boots the auth stack for one server: env → (one-time legacy DB move) →
 * SQLite → Better Auth → schema + data migration → services + resolver.
 * Runs once the server listens, so BETTER_AUTH_URL defaults to the real port.
 *
 * @module auth/authBoot
 */

import { toNodeHandler } from 'better-auth/node';
import { createActorResolver } from './actorResolver.mjs';
import { DEFAULT_CAPABILITIES, serializeCapabilities } from './authCapabilities.mjs';
import { relocateLegacyDatabase, sharedAuthDatabase } from './authDatabase.mjs';
import { readAuthEnv } from './authEnv.mjs';
import { CLIENT_IP_HEADER, LOGIN_LOG_MODEL, createAuthInstance } from './authInstance.mjs';
import { migrateAuthDatabase } from './authMigrations.mjs';
import { createAuthServices } from './authServices.mjs';
import { resolveClientIp } from './clientIp.mjs';
import { createLoginRecorder } from './loginLog.mjs';

/**
 * Overwrite the client-IP header Better Auth reads with the socket peer (or the
 * forwarded client when the peer is a trusted proxy). Returns the request.
 * @param {import('node:http').IncomingMessage} req
 * @param {{trustedProxies: object}} config
 */
export function withClientIp(req, config) {
  req.headers[CLIENT_IP_HEADER] = resolveClientIp(req.socket?.remoteAddress, req.headers['x-forwarded-for'], config.trustedProxies);
  return req;
}

/**
 * @param {{env: object, port: number, rootDir: string}} input
 * @returns {Promise<{config: object, auth?: object, handler?: Function, resolver?: object, services?: object,
 *   recordLogin?: Function, db?: object}>}
 */
export async function bootAuth({ env, port, rootDir }) {
  const config = readAuthEnv(env, { port, rootDir });
  for (const warning of config.warnings) console.warn(`[auth] ${warning}`);
  if (!config.ok) {
    console.warn(`[auth] login is not configured; pages show the login notice. Missing: ${config.missing.join(', ') || '-'}; invalid: ${config.invalid.join(', ') || '-'}.`);
    return { config };
  }
  if (relocateLegacyDatabase(config.legacyDatabaseFile, config.databaseFile)) console.info('[auth] moved the auth database from data/ to .gev-data/ (owner-only).');
  const { db, driver, journalMode } = await sharedAuthDatabase(config.databaseFile);
  const auth = createAuthInstance({ database: db, config });
  const migrated = await migrateAuthDatabase(auth, db, { defaultCapabilities: serializeCapabilities(DEFAULT_CAPABILITIES) });
  console.info(`[auth] ready on ${driver} (journal ${journalMode}, schema v${migrated.toVersion}); tables created: ${migrated.created.join(', ') || 'none'}, columns added: ${migrated.added.join(', ') || 'none'}.`);
  const services = createAuthServices(auth, config);
  const recordLogin = createLoginRecorder(async (row) => (await auth.$context).adapter.create({ model: LOGIN_LOG_MODEL, data: row }));
  return {
    config,
    auth,
    db,
    services,
    recordLogin,
    handler: toNodeHandler(auth),
    resolver: createActorResolver({ auth, superAdminEmails: config.superAdminEmails, audit: services.audit }),
  };
}
