// src/admin/dev/logs/auditView.js
/**
 * Owner-facing wording of the key/AI audit trail. Entries hold only codes and env var names, so nothing here can leak a
 * value. Pure — no DOM, no network.
 *
 * @module admin/dev/logs/auditView
 */
import { AUDIT_COPY as T } from '../../../copy/id/systemLogs.js';
import { providerName } from '../lib/statusView.js';
import { formatAbsolute, formatRelative } from '../lib/timeView.js';

/** Select value of "all types" (a Radix Select item cannot have an empty value). */
export const ALL_TYPES = 'all';

const list = (names) => (names?.length ? names.join(', ') : '');
const result = (value) => T.results[value] ?? value ?? T.details.unknownReason;
const http = (entry) => (entry.httpStatus ? ` (${T.details.http(entry.httpStatus)})` : '');
const reasonOf = (entry) => T.details.reason(entry.result ?? T.details.unknownReason);

/** Per event: badge status (ok/warn/error/off) and the detail sentence. */
const DETAIL = {
  'keys.changed': (entry) => ({ status: 'ok', detail: [entry.saved?.length ? T.details.saved(list(entry.saved)) : '', entry.removed?.length ? T.details.removed(list(entry.removed)) : ''].filter(Boolean).join(' · ') }),
  'keys.change_failed': (entry) => ({ status: 'warn', detail: `${T.details.nothingSaved}${http(entry)}` }),
  'keys.tested': (entry) => ({
    status: { ok: 'ok', rejected: 'error', unreachable: 'warn' }[entry.result] ?? 'off',
    detail: `${T.details.tested(providerName(entry.provider, entry.provider ?? '?'), result(entry.result))}${http(entry)}`,
  }),
  'voice_settings.saved': (entry) => ({ status: 'ok', detail: entry.sections?.length ? T.details.sections(list(entry.sections)) : T.details.noSections }),
  'voice_settings.save_failed': () => ({ status: 'error', detail: T.details.saveFailed }),
  'admin.login': () => ({ status: 'ok', detail: T.details.googleLogin }),
  'admin.logout': () => ({ status: 'off', detail: '' }),
  'admin.login_denied': (entry) => ({ status: 'warn', detail: reasonOf(entry) }),
  'admin.login_failed': (entry) => ({ status: 'error', detail: reasonOf(entry) }),
  'log.cleared': () => ({ status: 'off', detail: T.details.fromAdmin }),
};

/**
 * @param {{event: string, source?: string, provider?: string, result?: string, httpStatus?: number,
 *   saved?: string[], removed?: string[], sections?: string[]}} entry
 * @returns {{title: string, detail: string, status: 'ok' | 'warn' | 'error' | 'off'}}
 */
export function describeAuditEntry(entry) {
  const known = Object.hasOwn(DETAIL, entry.event) ? DETAIL[entry.event](entry) : null;
  return {
    title: T.events[entry.event] ?? entry.event,
    detail: known ? known.detail : [entry.provider, entry.result].filter(Boolean).join(' · '),
    status: known?.status ?? 'off',
  };
}

/**
 * Table rows of the loaded entries (newest first, as the server sends them).
 * @param {object[]} entries
 * @param {number} now
 */
export function auditRows(entries, now) {
  return entries.map((entry, index) => {
    const at = Date.parse(entry.at);
    const view = describeAuditEntry(entry);
    return {
      id: `${entry.at}-${index}`,
      ...view,
      via: entry.source ? T.via(entry.source) : '',
      time: { iso: Number.isFinite(at) ? new Date(at).toISOString() : '', relative: formatRelative(at, now), absolute: formatAbsolute(at, { now }) },
    };
  });
}

/** Select value → API `type` (the "all" sentinel becomes no filter). */
export const auditTypeParam = (value) => (value === ALL_TYPES ? '' : value);
