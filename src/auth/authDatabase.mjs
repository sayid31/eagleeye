// src/auth/authDatabase.mjs
/**
 * Runtime-neutral SQLite handle for Better Auth: `bun:sqlite` under Bun,
 * `node:sqlite` (`DatabaseSync`) under Node. Both are passed to Better Auth
 * as-is (its built-in Kysely SQLite dialect accepts either), so the same code
 * runs on today's Node launcher and on the planned Bun runtime.
 *
 * The file is created owner-only (0600) inside an owner-only directory (0700
 * when this module creates it) and opened with WAL, a busy timeout and foreign keys.
 *
 * @module auth/authDatabase
 */

import fs from 'node:fs';
import path from 'node:path';

const BUSY_TIMEOUT_MS = 5000;
// Held in variables so the Vite config bundler (esbuild) never tries to
// resolve `bun:sqlite` while running under Node.
const BUN_SQLITE = 'bun:sqlite';
const NODE_SQLITE = 'node:sqlite';

/** @returns {boolean} */
export function isBunRuntime() {
  return Boolean(process.versions?.bun);
}

/**
 * Create the parent directory (0700 when it did not exist) and an empty 0600 file.
 * An existing directory chosen by the operator is left as it is.
 * @param {string} file Absolute path.
 */
export function prepareDatabaseFile(file) {
  const dir = path.dirname(file);
  const created = fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (created) fs.chmodSync(dir, 0o700);
  const fd = fs.openSync(file, 'a', 0o600);
  fs.closeSync(fd);
  fs.chmodSync(file, 0o600);
}

const SQLITE_SIDE_FILES = ['', '-wal', '-shm'];

/**
 * One-time move of the phase-1a database (`data/auth.db`, served by the static
 * server before the allowlist guard) to its owner-only home. Runs only when the
 * old file exists and the new one does not; the SQLite side files move with it.
 * @param {string | null} legacyFile Absolute path, or null when AUTH_DATABASE_FILE is set explicitly.
 * @param {string} file Absolute target path.
 * @returns {boolean} true when a file was moved.
 */
export function relocateLegacyDatabase(legacyFile, file) {
  if (!legacyFile || legacyFile === file || !fs.existsSync(legacyFile) || fs.existsSync(file)) return false;
  const dir = path.dirname(file);
  if (fs.mkdirSync(dir, { recursive: true, mode: 0o700 })) fs.chmodSync(dir, 0o700);
  for (const suffix of SQLITE_SIDE_FILES) {
    if (!fs.existsSync(`${legacyFile}${suffix}`)) continue;
    try {
      fs.renameSync(`${legacyFile}${suffix}`, `${file}${suffix}`);
    } catch (error) {
      throw new Error(`Moving the auth database ${path.basename(legacyFile)}${suffix} to ${path.basename(dir)}/ failed: ${error.code || error.message}`);
    }
    fs.chmodSync(`${file}${suffix}`, 0o600);
  }
  return true;
}

/**
 * Open (creating if needed) the auth database on the current runtime.
 * @param {string} file Absolute path to the SQLite file.
 * @returns {Promise<{db: object, driver: 'bun:sqlite' | 'node:sqlite', journalMode: string}>}
 */
export async function openAuthDatabase(file) {
  try {
    prepareDatabaseFile(file);
  } catch (error) {
    throw new Error(`Auth database ${path.basename(file)} could not be prepared: ${error.code || error.message}`);
  }
  let db;
  let driver;
  if (isBunRuntime()) {
    const { Database } = await import(/* @vite-ignore */ BUN_SQLITE);
    db = new Database(file, { create: true });
    driver = 'bun:sqlite';
  } else {
    const { DatabaseSync } = await import(/* @vite-ignore */ NODE_SQLITE);
    db = new DatabaseSync(file);
    driver = 'node:sqlite';
  }
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
  db.exec('PRAGMA foreign_keys = ON;');
  const journalMode = String(db.prepare('PRAGMA journal_mode;').get()?.journal_mode ?? '');
  return { db, driver, journalMode };
}

/**
 * Same handle for the same file across Vite in-process restarts (a key save or
 * a `.env` edit re-evaluates the config); a second handle per restart would leak.
 * @param {string} file
 * @param {(file: string) => Promise<object>} [open]
 * @returns {Promise<{db: object, driver: string, journalMode: string}>}
 */
export function sharedAuthDatabase(file, open = openAuthDatabase) {
  globalThis.__GEV_AUTH_DATABASES__ ??= new Map();
  const cache = globalThis.__GEV_AUTH_DATABASES__;
  if (!cache.has(file)) {
    const opening = open(file);
    // A failed open must not poison later attempts (e.g. after fixing permissions).
    opening.catch(() => cache.delete(file));
    cache.set(file, opening);
  }
  return cache.get(file);
}
