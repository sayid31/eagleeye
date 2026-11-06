// src/admin/audit/adminAuditLog.mjs
/**
 * Append-only owner audit trail (`.gev-cache/admin-audit.jsonl`): key changes,
 * connection tests and settings saves. It is the store the Audit Log page
 * (admin stage T7) will read; until then it is only written.
 *
 * Privacy rule enforced here, not by callers: an entry keeps only an allowlist
 * of fields whose values are short codes or ENV VAR NAMES. No key value, no
 * email, no request body can be recorded, whatever a caller passes.
 *
 * Writes never throw (an audit failure must not fail the change it records);
 * a failure is reported once per call on the console, without the entry.
 *
 * @module admin/audit/adminAuditLog
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Default location: `<repo>/.gev-cache/admin-audit.jsonl` (gitignored). */
export const DEFAULT_ADMIN_AUDIT_PATH = fileURLToPath(new URL('../../../.gev-cache/admin-audit.jsonl', import.meta.url));
/** Lines kept; older lines are dropped when the file grows past twice this. */
export const AUDIT_MAX_LINES = 2000;

const CODE = /^[A-Za-z0-9_.:-]{1,64}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
const FIELDS = {
  event: (v) => (CODE.test(String(v)) ? String(v) : null),
  source: (v) => (CODE.test(String(v)) ? String(v) : null),
  provider: (v) => (CODE.test(String(v)) ? String(v) : null),
  result: (v) => (CODE.test(String(v)) ? String(v) : null),
  httpStatus: (v) => (Number.isInteger(v) && v >= 100 && v < 600 ? v : null),
  saved: (v) => namesOnly(v),
  removed: (v) => namesOnly(v),
};

function namesOnly(value) {
  if (!Array.isArray(value)) return null;
  const names = value.filter((n) => typeof n === 'string' && ENV_NAME.test(n));
  return names.length ? names : null;
}

/**
 * Reduce a caller's event to the allowlisted, code-only shape.
 * @param {Record<string, unknown>} input
 * @param {Date} at
 * @returns {Record<string, unknown> | null} null when there is no valid `event`.
 */
export function sanitizeAuditEntry(input, at) {
  const entry = { at: at.toISOString() };
  for (const [field, clean] of Object.entries(FIELDS)) {
    if (input?.[field] === undefined) continue;
    const value = clean(input[field]);
    if (value !== null) entry[field] = value;
  }
  return entry.event ? entry : null;
}

/**
 * @param {{filePath?: string, fileSystem?: typeof fs, now?: () => Date, maxLines?: number,
 *   onRecord?: (entry: object) => void}} [options] `onRecord` receives each sanitized
 *   entry (the Server Log mirrors audit events until the Audit Log page exists).
 */
export function createAdminAuditLog({
  filePath = DEFAULT_ADMIN_AUDIT_PATH, fileSystem = fs, now = () => new Date(), maxLines = AUDIT_MAX_LINES, onRecord,
} = {}) {
  function trim() {
    const lines = fileSystem.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    if (lines.length <= maxLines * 2) return;
    fileSystem.writeFileSync(filePath, `${lines.slice(-maxLines).join('\n')}\n`, { mode: 0o600 });
  }

  /** @param {Record<string, unknown>} input */
  function record(input) {
    const entry = sanitizeAuditEntry(input, now());
    if (!entry) return false;
    onRecord?.(entry);
    try {
      fileSystem.mkdirSync(path.dirname(filePath), { recursive: true });
      fileSystem.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
      trim();
      return true;
    } catch (error) {
      console.warn(`[admin-audit] could not record ${entry.event}: ${error?.code || 'write failed'}`);
      return false;
    }
  }

  /** Newest first, at most `limit` entries; unreadable lines are skipped. */
  function list(limit = 100) {
    let text;
    try {
      text = fileSystem.readFileSync(filePath, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[admin-audit] could not read the audit log: ${error?.code || 'read failed'}`);
      return [];
    }
    return text.split('\n').filter(Boolean).reverse().slice(0, limit).flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
  }

  return { record, list, filePath };
}
