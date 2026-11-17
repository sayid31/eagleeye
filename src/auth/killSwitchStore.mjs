// src/auth/killSwitchStore.mjs
/**
 * Global kill switches per paid gate (`layers`, `ai`, `premium` — plan/auth/04
 * §Kill switch provider), stored in the auth database next to `audit_log`.
 *
 * Why the auth DB and not a JSON file: it is already owner-only (0600 in a
 * 0700 dir), denied to the static server, backed up with the accounts, and
 * written atomically by SQLite; a switch that stops spend must survive a
 * restart and must never be readable or writable through a served path.
 *
 * Reads for the login guard (`isKilled`) are synchronous (both `node:sqlite`
 * and `bun:sqlite` are) and cached for at most KILL_SWITCH_CACHE_MS; a write
 * from this process clears the cache, so the owner's own change applies on
 * the next request.
 *
 * @module auth/killSwitchStore
 */

import { KILLABLE_GATES, createKillSwitchCheck } from './apiGates.mjs';
import { maskEmail } from './auditLog.mjs';

/** Longest a cached switch state is trusted before re-reading the table. */
export const KILL_SWITCH_CACHE_MS = 2000;
export const MAX_KILL_REASON_LENGTH = 200;

const TABLE = 'kill_switch';

/**
 * Idempotent schema step (`IF NOT EXISTS`): the table is created on first boot
 * of a database that predates the kill switch; existing rows are never touched.
 * @param {{exec: (sql: string) => void}} db
 */
export function ensureKillSwitchSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    gate TEXT PRIMARY KEY NOT NULL,
    killed INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    updatedById TEXT,
    updatedByRole TEXT,
    updatedByEmailMasked TEXT,
    updatedAt INTEGER
  );`);
}

const publicRow = (gate, row) => ({
  gate,
  killed: Number(row?.killed ?? 0) === 1,
  reason: row?.reason ?? null,
  updatedBy: row?.updatedById ? { id: row.updatedById, role: row.updatedByRole ?? null, emailMasked: row.updatedByEmailMasked ?? null } : null,
  updatedAt: Number.isFinite(Number(row?.updatedAt)) && row?.updatedAt !== null ? Number(row.updatedAt) : null,
});

/**
 * @param {object} deps
 * @param {object} deps.db The raw `bun:sqlite` / `node:sqlite` handle of the auth database.
 * @param {() => number} [deps.now]
 * @param {number} [deps.cacheMs]
 * @param {(message: string) => void} [deps.error]
 * @returns {{list: () => object[], isKilled: (gate: string) => boolean, killedGates: () => string[],
 *   set: (gate: string, killed: boolean, by: {actor: {id: string, role?: string, email?: string}, reason?: string}) => object}}
 */
export function createKillSwitchStore({ db, now = () => Date.now(), cacheMs = KILL_SWITCH_CACHE_MS, error = (message) => console.error(message) }) {
  ensureKillSwitchSchema(db);
  let cached = null;

  function readKilled() {
    const at = now();
    if (cached && at - cached.at < cacheMs) return cached.state;
    try {
      const rows = db.prepare(`SELECT gate FROM ${TABLE} WHERE killed = 1`).all();
      cached = { at, state: Object.fromEntries(rows.map((row) => [row.gate, true])) };
    } catch (failure) {
      // Keep enforcing what we last knew rather than silently re-opening a killed gate.
      error(`[kill-switch] reading ${TABLE} failed; keeping the last known state: ${failure?.message || failure}`);
      cached = { at, state: cached?.state ?? {} };
    }
    return cached.state;
  }

  const isKilled = createKillSwitchCheck(readKilled);

  return {
    /** Every killable gate with its state, in KILLABLE_GATES order (uncached). */
    list() {
      const rows = new Map(db.prepare(`SELECT * FROM ${TABLE}`).all().map((row) => [row.gate, row]));
      return KILLABLE_GATES.map((gate) => publicRow(gate, rows.get(gate)));
    },
    isKilled,
    /** Gates switched off right now (cached like `isKilled`). */
    killedGates: () => KILLABLE_GATES.filter((gate) => isKilled(gate)),
    /** Switch one gate; validated input only (see killSwitchCore). */
    set(gate, killed, { actor, reason }) {
      if (!KILLABLE_GATES.includes(gate)) throw new Error(`kill switch: "${gate}" is not a killable gate`);
      const text = String(reason ?? '').trim().slice(0, MAX_KILL_REASON_LENGTH) || null;
      db.prepare(`INSERT INTO ${TABLE} (gate, killed, reason, updatedById, updatedByRole, updatedByEmailMasked, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gate) DO UPDATE SET killed = excluded.killed, reason = excluded.reason, updatedById = excluded.updatedById,
          updatedByRole = excluded.updatedByRole, updatedByEmailMasked = excluded.updatedByEmailMasked, updatedAt = excluded.updatedAt`)
        .run(gate, killed ? 1 : 0, text, String(actor.id), actor.role ?? null, maskEmail(actor.email), now());
      cached = null;
      return this.list().find((row) => row.gate === gate);
    },
  };
}
