// src/log/clientLog.js
/**
 * Browser side of the Server Log: a small batching queue posted to
 * `/api/log`, plus capture of uncaught JS errors. Every entry is redacted
 * again on the server; this side only keeps the payload small.
 *
 * Never throws to a caller and never logs its own delivery failures to the
 * Server Log (no feedback loop) — a failed post is one console warning.
 *
 * @module log/clientLog
 */

export const CLIENT_LOG_URL = '/api/log';
const FLUSH_DELAY_MS = 4000;
const QUEUE_MAX = 40;
const BATCH_MAX = 20;
const MESSAGE_MAX = 300;

/** "Chrome 141" / "Firefox 133" / "Safari 18" / "Edge 141" from a user agent; never the full string. */
export function browserFamily(userAgent = '') {
  const ua = String(userAgent);
  const pick = (re, name) => { const m = ua.match(re); return m ? `${name} ${m[1]}` : null; };
  return pick(/Edg\/(\d+)/, 'Edge') || pick(/Firefox\/(\d+)/, 'Firefox') || pick(/Chrome\/(\d+)/, 'Chrome')
    || pick(/Version\/(\d+)[^ ]* Safari\//, 'Safari') || 'Other';
}

/** `https://host/src/ui.js?t=1:120:5` → `ui.js:120` (no origin, no query). */
export function shortLocation(file, line) {
  const name = String(file ?? '').split('?')[0].split('/').pop();
  return name ? `${name}${Number.isFinite(line) ? `:${line}` : ''}` : '';
}

/** Uncaught error / rejection → one Server Log event. */
export function jsErrorEvent({ kind, message, file, line }) {
  const where = shortLocation(file, line);
  return {
    level: 'error',
    source: 'browser',
    code: kind === 'rejection' ? 'browser.unhandled_rejection' : 'browser.js_error',
    message: `${String(message ?? 'Unknown error').slice(0, MESSAGE_MAX)}${where ? ` (${where})` : ''}`,
  };
}

/**
 * @param {{fetchImpl?: typeof fetch, setTimer?: (fn: Function, ms: number) => any,
 *   client?: {version?: string, browser?: string}}} [deps]
 */
export function createClientLog({ fetchImpl, setTimer = (fn, ms) => setTimeout(fn, ms), client = {} } = {}) {
  let queue = [];
  let timer = null;
  let warned = false;

  function flush() {
    timer = null;
    if (!queue.length) return Promise.resolve(false);
    const batch = queue.slice(0, BATCH_MAX);
    queue = queue.slice(BATCH_MAX);
    if (queue.length) timer = setTimer(flush, FLUSH_DELAY_MS);
    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!doFetch) return Promise.resolve(false);
    return doFetch(CLIENT_LOG_URL, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client, events: batch }),
    }).then((response) => response.ok, (error) => {
      if (!warned) { warned = true; console.warn(`[client-log] could not send log events: ${error?.message || error}`); }
      return false;
    });
  }

  /** Queue one event; identical events already queued are not duplicated. */
  function log(event) {
    if (!event?.code) return;
    const key = `${event.level}|${event.source}|${event.code}|${event.message ?? ''}`;
    if (queue.some((queued) => queued.__key === key)) return;
    if (queue.length >= QUEUE_MAX) queue.shift();
    queue.push(Object.defineProperty({ ...event }, '__key', { value: key, enumerable: false }));
    if (!timer) timer = setTimer(flush, FLUSH_DELAY_MS);
  }

  return { log, flush, pending: () => queue.length };
}

let shared = null;

/**
 * Start capturing uncaught errors and make `logClientEvent` live. Call once
 * from the app entry; later calls return the same logger.
 * @param {{version?: string}} [options]
 */
export function installClientLog({ version = '' } = {}) {
  if (shared || typeof window === 'undefined') return shared;
  shared = createClientLog({ client: { version, browser: browserFamily(navigator.userAgent) } });
  window.addEventListener('error', (event) => {
    shared.log(jsErrorEvent({ kind: 'error', message: event.message, file: event.filename, line: event.lineno }));
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    shared.log(jsErrorEvent({ kind: 'rejection', message: reason?.message ?? String(reason) }));
  });
  window.addEventListener('pagehide', () => { void shared.flush(); });
  return shared;
}

/** Report one event from anywhere in the app. A no-op until `installClientLog` ran. */
export function logClientEvent(event) {
  try {
    shared?.log(event);
  } catch (error) {
    console.warn(`[client-log] dropped an event: ${error?.message || error}`);
  }
}
