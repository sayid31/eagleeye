// src/admin/dev/logs/serverLogView.js
/**
 * View-model of the Server Log page: filter → API query, level badge, table rows and the detail-sheet facts. Pure — no
 * DOM, no network. Entries are already redacted server-side (no key, token or email), nothing here adds data.
 *
 * @module admin/dev/logs/serverLogView
 */
import { LOG_LEVEL_COPY, LOG_SOURCE_COPY, SERVER_LOG_COPY as T } from '../../../copy/id/systemLogs.js';
import { formatAbsolute, formatRelative } from '../lib/timeView.js';

/** Select values for "no filter" (a Radix Select item cannot have an empty value). */
export const ALL = 'all';

/** @type {{level: string, source: string, q: string}} */
export const EMPTY_FILTER = Object.freeze({ level: ALL, source: ALL, q: '' });

const LEVEL_PRESENTATION = Object.freeze({
  error: { tone: 'destructive', icon: 'x' },
  warn: { tone: 'warning', icon: 'warning' },
  info: { tone: 'info', icon: 'info' },
});

/** @returns {{level: string, tone: string, icon: string, label: string}} Unknown levels read as info. */
export function levelBadge(level) {
  const key = Object.hasOwn(LEVEL_PRESENTATION, level) ? level : 'info';
  return { level: key, ...LEVEL_PRESENTATION[key], label: LOG_LEVEL_COPY[key] };
}

/** Source label; unknown sources read as their key. */
export const sourceLabel = (source) => LOG_SOURCE_COPY[source] ?? source;

/**
 * Filter + page → the `GET /api/admin/log` query (sentinels and empty text dropped by logQueryString).
 * @param {{level: string, source: string, q: string}} filter
 * @param {{limit: number, offset: number}} page
 */
export function filterQuery(filter, { limit, offset }) {
  return {
    level: filter.level === ALL ? '' : filter.level,
    source: filter.source === ALL ? '' : filter.source,
    q: filter.q.trim(),
    limit,
    offset,
  };
}

/** Whether any filter is active (the empty state then says "no match" instead of "log is empty"). */
export const isFiltered = (filter) => filter.level !== ALL || filter.source !== ALL || filter.q.trim() !== '';

/** "tool=fly_to_location · seconds=3" from the entry's redacted detail fields. */
export function describeContext(entry) {
  return Object.entries(entry.detail ?? {}).map(([key, value]) => `${key}=${value}`).join(' · ');
}

/** "Chrome 141 · v0.1.1" or ''. */
export function describeClient(entry) {
  return [entry.client?.browser, entry.client?.version ? `v${entry.client.version}` : ''].filter(Boolean).join(' · ');
}

/**
 * @param {{id: string, level: string, source: string, code: string, message: string, count: number, firstAt: number, lastAt: number,
 *   detail?: object, client?: object}} entry
 * @param {number} now
 */
export function logRow(entry, now) {
  return {
    id: entry.id,
    entry,
    badge: levelBadge(entry.level),
    source: sourceLabel(entry.source),
    code: entry.code,
    message: entry.message,
    repeat: entry.count > 1 ? T.repeat(entry.count) : '',
    context: describeContext(entry),
    time: { iso: new Date(entry.lastAt).toISOString(), relative: formatRelative(entry.lastAt, now), absolute: formatAbsolute(entry.lastAt, { now }) },
  };
}

/** Rows of the detail sheet, in reading order; empty fields are left out. */
export function detailFacts(entry, now) {
  const rows = [
    { id: 'level', label: T.sheet.level, value: levelBadge(entry.level).label },
    { id: 'source', label: T.sheet.source, value: sourceLabel(entry.source) },
    { id: 'count', label: T.sheet.count, value: String(entry.count) },
    { id: 'firstAt', label: T.sheet.firstSeen, value: formatAbsolute(entry.firstAt, { now }) },
    { id: 'lastAt', label: T.sheet.lastSeen, value: formatAbsolute(entry.lastAt, { now }) },
    { id: 'client', label: T.sheet.client, value: describeClient(entry) },
  ];
  return rows.filter((row) => row.value);
}
