#!/usr/bin/env node
// scripts/auth-migrate.mjs — `npm run auth:migrate`
/**
 * Creates or upgrades the auth database (Better Auth core + login_log,
 * login_throttle, audit_log) and runs the idempotent data migration
 * (src/auth/authMigrations.mjs: role rename, banned from status, PRAGMA
 * user_version). Moves a phase-1a `data/auth.db` to `.gev-data/` once. The
 * dev/preview server runs the same steps at start. Prints table names, the
 * schema version and the database file name only.
 */

import path from 'node:path';
import { describeUnconfigured, openCheckoutAuth } from './authCheckout.mjs';

try {
  const { config, migrated } = await openCheckoutAuth();
  if (!migrated) {
    console.error(`[auth:migrate] ${describeUnconfigured(config)}`);
    process.exit(1);
  }
  console.log(`[auth:migrate] ${path.relative(process.cwd(), config.databaseFile) || config.databaseFile}: schema v${migrated.fromVersion} → v${migrated.toVersion}; tables created: ${migrated.created.join(', ') || 'none'}; columns added: ${migrated.added.join(', ') || 'none'}.`);
} catch (error) {
  console.error(`[auth:migrate] migration failed: ${error?.message || error}`);
  process.exit(1);
}
