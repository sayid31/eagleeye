// src/admin/users/adminLogQueries.mjs
/**
 * Read-only SQL over the auth database for /admin and /dev: the login log,
 * the account audit trail and the Ringkasan counters. Visibility is applied
 * IN the query (an admin's page can never contain a hidden row, so `total`
 * and paging stay honest):
 *  - admin: login rows of `user` accounts only; audit rows of `user.*`
 *    actions whose target is a `user` account;
 *  - super_admin: every row (including failed sign-ins for unknown emails).
 * Every list is paginated by the caller (`clampPage`). Dates are ISO strings
 * in this database, so they compare as text. No writes here (append-only logs).
 *
 * Indexes used: login_log(createdAt), login_log(userId), audit_log(createdAt),
 * audit_log(targetId) — declared in src/auth/authSchema.mjs.
 *
 * @module admin/users/adminLogQueries
 */

import { ROLE_USER } from '../../auth/authRoles.mjs';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Audit actions an admin may read (account actions on `user` accounts). */
export const ADMIN_AUDIT_PREFIX = 'user.';

const rows = (db, sql, args) => db.prepare(sql).all(...args).map((row) => ({ ...row }));
const one = (db, sql, args) => ({ ...(db.prepare(sql).get(...args) ?? {}) });
const placeholders = (list) => list.map(() => '?').join(', ');
const bool = (value) => value === 1 || value === true;

/**
 * @param {{prepare: (sql: string) => {all: Function, get: Function}}} db Raw node:sqlite / bun:sqlite handle.
 * @param {{now?: () => number}} [options]
 */
export function createAdminLogQueries(db, { now = () => Date.now() } = {}) {
  /**
   * @param {{roles: string[] | null, userId?: string, success?: boolean, limit: number, offset: number}} filter
   *   `roles: null` = every row (super_admin); otherwise only rows of accounts with those roles.
   */
  function loginLog({ roles, userId, success, limit, offset }) {
    const where = [];
    const args = [];
    if (roles) { where.push(`u.role IN (${placeholders(roles)})`); args.push(...roles); }
    if (userId) { where.push('l.userId = ?'); args.push(userId); }
    if (success !== undefined) { where.push('l.success = ?'); args.push(success ? 1 : 0); }
    const from = `FROM login_log l LEFT JOIN "user" u ON u.id = l.userId${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
    const entries = rows(db, `SELECT l.id, l.createdAt, l.userId, u.name AS userName, u.email AS userEmail, u.role AS userRole,
      u.deletedAt AS userDeletedAt, l.success, l.reason, l.ip, l.userAgent, l.method ${from}
      ORDER BY l.createdAt DESC, l.id DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
    const { total = 0 } = one(db, `SELECT COUNT(*) AS total ${from}`, args);
    return {
      entries: entries.map(({ userDeletedAt, ...entry }) => ({ ...entry, success: bool(entry.success), userDeleted: Boolean(userDeletedAt) })),
      total: Number(total),
    };
  }

  /**
   * @param {{scope: 'admin' | 'all', action?: string, targetId?: string, limit: number, offset: number}} filter
   */
  function accountAudit({ scope, action, targetId, limit, offset }) {
    const where = [];
    const args = [];
    if (scope === 'admin') {
      // substr, not LIKE: no wildcard semantics to get wrong.
      where.push('substr(a.action, 1, ?) = ?', 'a.targetId IN (SELECT id FROM "user" WHERE role = ?)');
      args.push(ADMIN_AUDIT_PREFIX.length, ADMIN_AUDIT_PREFIX, ROLE_USER);
    }
    if (action) { where.push('a.action = ?'); args.push(action); }
    if (targetId) { where.push('a.targetId = ?'); args.push(targetId); }
    const filter = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const entries = rows(db, `SELECT a.id, a.createdAt, a.actorId, a.actorRole, actor.name AS actorName, a.action, a.targetType,
      a.targetId, a.targetEmailMasked, target.name AS targetName, a.summary
      FROM audit_log a LEFT JOIN "user" actor ON actor.id = a.actorId LEFT JOIN "user" target ON target.id = a.targetId${filter}
      ORDER BY a.createdAt DESC, a.id DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
    const { total = 0 } = one(db, `SELECT COUNT(*) AS total FROM audit_log a${filter}`, args);
    return { entries, total: Number(total) };
  }

  /**
   * Ringkasan counters over the accounts (and their sign-ins) of `roles`; `includeUnknown`
   * also counts failed sign-ins for emails without an account (super_admin only).
   * @param {{roles: string[], includeUnknown: boolean}} scope
   */
  function stats({ roles, includeUnknown }) {
    const nowIso = new Date(now()).toISOString();
    const since = new Date(now() - DAY_MS).toISOString();
    const accounts = one(db, `SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN banned = 1 THEN 0 ELSE 1 END), 0) AS active,
      COALESCE(SUM(CASE WHEN banned = 1 THEN 1 ELSE 0 END), 0) AS inactive,
      COALESCE(SUM(CASE WHEN banned = 0 AND throttleUntil > ? THEN 1 ELSE 0 END), 0) AS throttled,
      COALESCE(SUM(CASE WHEN banned = 0 AND mustChangePassword = 1 THEN 1 ELSE 0 END), 0) AS mustChangePassword
      FROM "user" WHERE deletedAt IS NULL AND role IN (${placeholders(roles)})`, [nowIso, ...roles]);
    const owner = includeUnknown ? `(u.role IN (${placeholders(roles)}) OR l.userId IS NULL)` : `u.role IN (${placeholders(roles)})`;
    const logins = one(db, `SELECT COALESCE(SUM(CASE WHEN l.success = 1 THEN 1 ELSE 0 END), 0) AS logins24h,
      COALESCE(SUM(CASE WHEN l.success = 1 THEN 0 ELSE 1 END), 0) AS failed24h
      FROM login_log l LEFT JOIN "user" u ON u.id = l.userId WHERE l.createdAt >= ? AND ${owner}`, [since, ...roles]);
    return Object.fromEntries(Object.entries({ ...accounts, ...logins }).map(([key, value]) => [key, Number(value)]));
  }

  return { loginLog, accountAudit, stats };
}
