// src/admin/log/serverLogCore.mjs
/**
 * Server Log model: what an entry may contain, redaction, merging of repeated
 * entries, retention and the paged query the /admin Server Log page reads.
 *
 * Privacy (checklist.md): an entry holds a level, a source, an event code, a
 * short redacted message and a few redacted detail fields — never a full
 * conversation, key, token, email or person's name. Redaction happens HERE,
 * for every producer, so a careless caller cannot leak through.
 *
 * Pure — no fs, no network, no DOM.
 *
 * @module admin/log/serverLogCore
 */

export const LOG_LEVELS = Object.freeze(['error', 'warn', 'info']);
export const LOG_SOURCES = Object.freeze(['browser', 'voice', 'judge', 'map', 'cctv', 'radio', 'layer', 'proxy', 'server', 'keys', 'admin', 'audit', 'log']);
/** Sources a browser may report through POST /api/log (server-only ones excluded). */
export const BROWSER_LOG_SOURCES = Object.freeze(['browser', 'voice', 'map', 'cctv', 'radio', 'layer']);
export const RETENTION_DAYS = 30;
/** Identical entries within this window become one row with a count. */
export const MERGE_WINDOW_MS = 60 * 60 * 1000;
export const MESSAGE_MAX = 240;
const DETAIL_MAX_KEYS = 8;
const DETAIL_VALUE_MAX = 120;
const DAY_MS = 86_400_000;

const CODE = /^[a-z][a-z0-9_.-]{1,63}$/;
const DETAIL_KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

/** Patterns that must never reach the log, in the order they are replaced. */
const REDACTIONS = [
  [/\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/g, '[email]'],
  [/\bBearer\s+[^\s"',]+/gi, 'Bearer [redacted]'],
  [/\b(?:sk|pk|rk|pmt)[-_][A-Za-z0-9_-]{8,}/g, '[key]'],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, '[key]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[token]'],
  [/([?&](?:key|api_key|apikey|token|access_token|map_key|client_secret|secret)=)[^&\s"']+/gi, '$1[redacted]'],
  [/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]'],
];

/** Remove secrets, emails and control characters; clamp length. */
export function redactText(value, max = MESSAGE_MAX) {
  let text = String(value ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').trim();
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function cleanDetail(detail) {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return undefined;
  const out = {};
  for (const [key, raw] of Object.entries(detail)) {
    if (Object.keys(out).length >= DETAIL_MAX_KEYS) break;
    if (!DETAIL_KEY.test(key) || /email|name|key|token|secret|password|transcript|text|answer|question/i.test(key)) continue;
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === 'boolean') out[key] = raw;
    else if (typeof raw === 'string' && raw.trim()) out[key] = redactText(raw, DETAIL_VALUE_MAX);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Validate and redact one event. Returns null for anything malformed.
 * @param {{level?: string, source?: string, code?: string, message?: string, detail?: object}} input
 * @param {{allowedSources?: readonly string[], client?: {version?: string, browser?: string}}} [options]
 */
export function normalizeLogEvent(input, { allowedSources = LOG_SOURCES, client } = {}) {
  if (!input || typeof input !== 'object') return null;
  const level = LOG_LEVELS.includes(input.level) ? input.level : null;
  const source = allowedSources.includes(input.source) ? input.source : null;
  const code = typeof input.code === 'string' && CODE.test(input.code) ? input.code : null;
  if (!level || !source || !code) return null;
  const event = { level, source, code, message: redactText(input.message ?? '') };
  const detail = cleanDetail(input.detail);
  if (detail) event.detail = detail;
  const clientInfo = cleanDetail(client);
  if (clientInfo) event.client = clientInfo;
  return event;
}

const sameEntry = (a, b) => a.level === b.level && a.source === b.source && a.code === b.code && a.message === b.message;

/**
 * Add an event, merging it into an identical entry seen within the window.
 * Returns a NEW array (newest entry last).
 * @param {Array<object>} entries
 * @param {object} event Output of `normalizeLogEvent`.
 * @param {number} nowMs
 */
export function mergeLogEvent(entries, event, nowMs) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (nowMs - entry.lastAt > MERGE_WINDOW_MS) break;
    if (sameEntry(entry, event)) {
      const merged = { ...entry, count: entry.count + 1, lastAt: nowMs };
      if (event.detail) merged.detail = event.detail;
      return [...entries.slice(0, i), ...entries.slice(i + 1), merged];
    }
  }
  return [...entries, { id: `${nowMs.toString(36)}-${entries.length.toString(36)}`, ...event, count: 1, firstAt: nowMs, lastAt: nowMs }];
}

/** Drop entries whose last occurrence is older than the retention window. */
export function pruneLog(entries, nowMs, retentionDays = RETENTION_DAYS) {
  const cutoff = nowMs - retentionDays * DAY_MS;
  return entries.filter((entry) => entry.lastAt >= cutoff);
}

/**
 * Newest-first page, filtered, offset-paged (a row merged meanwhile can move
 * to the top; that is acceptable for an owner log view).
 * @param {Array<object>} entries
 * @param {{level?: string, source?: string, q?: string, limit?: number, offset?: number}} [filter]
 */
export function queryLog(entries, { level, source, q, limit = 100, offset = 0 } = {}) {
  const needle = String(q ?? '').trim().toLowerCase();
  const matches = entries
    .filter((e) => (!level || e.level === level) && (!source || e.source === source))
    .filter((e) => !needle || `${e.code} ${e.message}`.toLowerCase().includes(needle))
    .sort((a, b) => b.lastAt - a.lastAt);
  const start = Math.max(0, Math.floor(offset) || 0);
  const page = matches.slice(start, start + limit);
  return {
    entries: page,
    total: matches.length,
    nextOffset: start + page.length < matches.length ? start + page.length : null,
    counts: Object.fromEntries(LOG_LEVELS.map((lvl) => [lvl, entries.filter((e) => e.level === lvl).length])),
  };
}
