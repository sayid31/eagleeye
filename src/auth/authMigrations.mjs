// src/auth/authMigrations.mjs
/**
 * Schema + data migration of the auth database, idempotent, versioned with
 * `PRAGMA user_version` (plan/auth/03 §Migrasi DB 1a):
 *
 *  v2 (from the phase-1a Google login):
 *   - `login_log.userId` was NOT NULL → the table is rebuilt (rows kept, all
 *     marked successful Google sign-ins, which is all 1a recorded);
 *   - role `super-admin` → `super_admin`;
 *   - status `banned`/`pending` → `banned = 1` (a pending account never had
 *     access, so it stays closed; the `status` column is left in place, unread);
 *   - missing capabilities/flags get their defaults.
 *
 * Better Auth's `getMigrations` only ADDS tables and columns; the data steps
 * run in one transaction afterwards.
 *
 * @module auth/authMigrations
 */

export const AUTH_SCHEMA_VERSION = 2;
const LEGACY_LOGIN_LOG = 'login_log_v1';

const rowsOf = (db, sql) => db.prepare(sql).all().map((row) => ({ ...row }));
const columnsOf = (db, table) => rowsOf(db, `SELECT name, "notnull" AS required FROM pragma_table_info('${table}')`);
const userVersion = (db) => Number(Object.values(db.prepare('PRAGMA user_version;').get() ?? {})[0] ?? 0);

/**
 * Create or upgrade Better Auth's tables plus ours. Idempotent.
 * @param {object} auth Better Auth instance.
 * @returns {Promise<{created: string[], added: string[]}>}
 */
export async function migrateAuthSchema(auth) {
  const { getMigrations } = await import('better-auth/db/migration');
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  return { created: toBeCreated.map((t) => t.table), added: toBeAdded.map((t) => t.table) };
}

function runDataMigration(db, defaultCapabilities) {
  const userColumns = columnsOf(db, 'user').map((column) => column.name);
  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`UPDATE "user" SET role = 'super_admin' WHERE role = 'super-admin'`).run();
    if (userColumns.includes('status')) db.prepare(`UPDATE "user" SET banned = 1 WHERE status IN ('banned', 'pending')`).run();
    db.prepare('UPDATE "user" SET capabilities = ? WHERE capabilities IS NULL').run(defaultCapabilities);
    db.prepare('UPDATE "user" SET banned = 0 WHERE banned IS NULL').run();
    db.prepare('UPDATE "user" SET mustChangePassword = 0 WHERE mustChangePassword IS NULL').run();
    db.prepare('UPDATE "user" SET failedLoginCount = 0 WHERE failedLoginCount IS NULL').run();
    if (rowsOf(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${LEGACY_LOGIN_LOG}'`).length) {
      db.prepare(`INSERT INTO login_log (id, userId, createdAt, ip, userAgent, method, success)
        SELECT id, userId, createdAt, ip, userAgent, method, 1 FROM ${LEGACY_LOGIN_LOG}`).run();
      db.exec(`DROP TABLE ${LEGACY_LOGIN_LOG};`);
    }
    db.exec(`PRAGMA user_version = ${AUTH_SCHEMA_VERSION};`);
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw new Error(`Auth data migration to v${AUTH_SCHEMA_VERSION} failed (rolled back): ${error.message}`);
  }
}

/**
 * Full migration: schema (Better Auth) then data (once per version).
 * @param {object} auth Better Auth instance built on `db`.
 * @param {object} db The raw `bun:sqlite` / `node:sqlite` handle.
 * @param {{defaultCapabilities: string}} options Serialized default toggles.
 * @returns {Promise<{created: string[], added: string[], fromVersion: number, toVersion: number}>}
 */
export async function migrateAuthDatabase(auth, db, { defaultCapabilities }) {
  const fromVersion = userVersion(db);
  if (fromVersion < AUTH_SCHEMA_VERSION) {
    const loginLogUserId = columnsOf(db, 'login_log').find((column) => column.name === 'userId');
    if (loginLogUserId && Number(loginLogUserId.required) === 1) {
      db.exec(`ALTER TABLE login_log RENAME TO ${LEGACY_LOGIN_LOG};`);
      // Index names are global in SQLite and follow the renamed table; free them for the new one.
      for (const { name } of rowsOf(db, `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '${LEGACY_LOGIN_LOG}' AND sql IS NOT NULL`)) {
        db.exec(`DROP INDEX "${name}";`);
      }
    }
  }
  const schema = await migrateAuthSchema(auth);
  if (fromVersion < AUTH_SCHEMA_VERSION) runDataMigration(db, defaultCapabilities);
  return { ...schema, fromVersion, toVersion: Math.max(fromVersion, AUTH_SCHEMA_VERSION) };
}
