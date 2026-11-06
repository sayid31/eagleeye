// src/admin/log/serverLogStore.mjs
/**
 * The Server Log store: entries in memory, persisted to
 * `.gev-cache/server-log.json` (0600, atomic) a moment after each change.
 * Retention (30 days) is applied on load and at most once a day; a size cap
 * (`GEV_SERVER_LOG_MAX_MB`, default 5) drops the oldest rows first.
 * `GEV_SERVER_LOG_PATH` moves the file (e.g. for a scratch server).
 *
 * One store per server process (`getServerLog()`, memoized on globalThis) so
 * every producer — proxies, admin routes, the browser ingest — writes the same
 * log, and a Vite in-process restart does not fork it.
 *
 * Never throws to a producer: a failed write is reported once on the console
 * and as one `log.write_failed` entry in memory.
 *
 * @module admin/log/serverLogStore
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeJsonFileAtomic } from '../../server/atomicJsonFile.mjs';
import { mergeLogEvent, normalizeLogEvent, pruneLog, queryLog } from './serverLogCore.mjs';

export const DEFAULT_SERVER_LOG_PATH = fileURLToPath(new URL('../../../.gev-cache/server-log.json', import.meta.url));
export const DEFAULT_MAX_MB = 5;
const FLUSH_DELAY_MS = 1500;
const DAY_MS = 86_400_000;

/** `GEV_SERVER_LOG_MAX_MB` → bytes; junk or ≤0 falls back to the default. */
export function maxLogBytes(env = process.env) {
  const mb = Number(env.GEV_SERVER_LOG_MAX_MB);
  return Math.round((Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_MB) * 1024 * 1024);
}

/** Drop the oldest-touched rows until the serialized log fits `maxBytes`. */
export function capLogSize(entries, maxBytes) {
  let kept = entries;
  while (kept.length > 1 && Buffer.byteLength(JSON.stringify(kept)) > maxBytes) {
    const sorted = [...kept].sort((a, b) => a.lastAt - b.lastAt);
    const drop = new Set(sorted.slice(0, Math.max(1, Math.ceil(kept.length / 10))).map((e) => e.id));
    kept = kept.filter((e) => !drop.has(e.id));
  }
  return kept;
}

/**
 * @param {{filePath?: string, fileSystem?: typeof fs, now?: () => number, env?: object,
 *   setTimer?: (fn: Function, ms: number) => any}} [options]
 */
export function createServerLog({
  filePath = DEFAULT_SERVER_LOG_PATH, fileSystem = fs, now = () => Date.now(), env = process.env,
  setTimer = (fn, ms) => { const t = setTimeout(fn, ms); t?.unref?.(); return t; },
} = {}) {
  let entries = load();
  let lastPruneAt = now();
  let flushPending = false;
  let writeFailedReported = false;

  function load() {
    try {
      const parsed = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'));
      return pruneLog(Array.isArray(parsed?.entries) ? parsed.entries.filter((e) => e && e.id && Number.isFinite(e.lastAt)) : [], now());
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn(`[server-log] existing log unreadable, starting empty: ${error?.code || 'invalid JSON'}`);
      return [];
    }
  }

  function flush() {
    flushPending = false;
    entries = capLogSize(entries, maxLogBytes(env));
    try {
      writeJsonFileAtomic(filePath, { version: 1, entries }, { fileSystem, label: 'server log' });
      writeFailedReported = false;
    } catch (error) {
      if (writeFailedReported) return;
      writeFailedReported = true;
      console.warn(`[server-log] write failed: ${error?.message || error}`);
      entries = mergeLogEvent(entries, { level: 'error', source: 'log', code: 'log.write_failed', message: 'The server log could not be written to disk.' }, now());
    }
  }

  function scheduleFlush() {
    if (flushPending) return;
    flushPending = true;
    setTimer(flush, FLUSH_DELAY_MS);
  }

  /**
   * Record one event (validated + redacted by `normalizeLogEvent`).
   * @returns {boolean} whether it was accepted
   */
  function record(input, options) {
    const event = normalizeLogEvent(input, options);
    if (!event) return false;
    const t = now();
    if (t - lastPruneAt > DAY_MS) { entries = pruneLog(entries, t); lastPruneAt = t; }
    entries = mergeLogEvent(entries, event, t);
    scheduleFlush();
    return true;
  }

  /** Remove every entry, leaving one `log.cleared` row as the trace of it. */
  function clear() {
    const removed = entries.length;
    entries = [];
    record({ level: 'info', source: 'log', code: 'log.cleared', message: `Log cleared from the admin page (${removed} entries removed).` });
    return removed;
  }

  return {
    record,
    clear,
    query: (filter) => queryLog(entries, filter),
    flushNow: flush,
    size: () => entries.length,
    filePath,
  };
}

/** A store that keeps entries in memory and never touches the disk. */
function createMemoryServerLog() {
  // No existing file is read and the flush timer never fires, so nothing is written.
  const noDisk = { ...fs, readFileSync: () => { throw Object.assign(new Error('memory-only log'), { code: 'ENOENT' }); } };
  return createServerLog({ fileSystem: noDisk, setTimer: () => {} });
}

/**
 * The process-wide log every producer shares. Under `node --test`
 * (NODE_TEST_CONTEXT is set by the runner) it is memory-only, so a unit test
 * that exercises a producer can never write the owner's real log.
 */
export function getServerLog() {
  globalThis.__GEV_SERVER_LOG__ ??= process.env.NODE_TEST_CONTEXT
    ? createMemoryServerLog()
    : createServerLog({ filePath: process.env.GEV_SERVER_LOG_PATH || DEFAULT_SERVER_LOG_PATH });
  return globalThis.__GEV_SERVER_LOG__;
}

/** Fire-and-forget convenience for producers. Never throws. */
export function logServerEvent(event) {
  try {
    return getServerLog().record(event);
  } catch (error) {
    console.warn(`[server-log] could not record ${event?.code}: ${error?.message || error}`);
    return false;
  }
}
