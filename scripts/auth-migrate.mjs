#!/usr/bin/env node
// scripts/auth-migrate.mjs — `npm run auth:migrate`
/**
 * Creates or upgrades the login tables (Better Auth core + login_log) in
 * AUTH_DATABASE_FILE (default data/auth.db). The dev/preview server runs the
 * same migration at start; this is for setting up or checking a database by
 * hand. Idempotent. Prints table names and the database file name only.
 */

import path from 'node:path';
import { migrateAuthSchema } from '../src/auth/authInstance.mjs';
import { describeUnconfigured, openCheckoutAuth } from './authCheckout.mjs';

const { config, auth } = await openCheckoutAuth();
if (!auth) {
  console.error(`[auth:migrate] ${describeUnconfigured(config)}`);
  process.exit(1);
}
try {
  const result = await migrateAuthSchema(auth);
  console.log(`[auth:migrate] ${path.relative(process.cwd(), config.databaseFile) || config.databaseFile}: tables created: ${result.created.join(', ') || 'none'}; columns added: ${result.added.join(', ') || 'none'}.`);
} catch (error) {
  console.error(`[auth:migrate] migration failed: ${error?.message || error}`);
  process.exit(1);
}
