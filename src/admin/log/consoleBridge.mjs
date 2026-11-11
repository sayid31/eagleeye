// src/admin/log/consoleBridge.mjs
/**
 * Mirror the server's own `console.warn` / `console.error` into the Server Log.
 *
 * Every proxy and server module already reports its failures on the console
 * ("[celestrak-proxy] refresh failed: …"), but on a pm2 host nobody reads that
 * stream, so the /admin Server Log showed only the handful of producers that
 * called `logServerEvent` directly. Bridging the console covers all of them at
 * once: each entry carries the component (the `[tag]` prefix), the calling
 * file:line, and the message — redacted by serverLogCore like every producer.
 *
 * @module admin/log/consoleBridge
 */

import { format } from 'node:util';

/** Tags whose messages are the Server Log's own plumbing (would only echo). */
const SKIPPED_COMPONENTS = new Set(['server-log', 'client-log']);
const ANSI = /\u001B\[[0-9;]*[A-Za-z]/g;
const TAG = /^\[([A-Za-z][\w:. -]{0,40})\]\s*/;
const BRIDGE_FILE = 'consoleBridge.mjs';
const INSTALLED = Symbol.for('gev.serverLog.consoleBridge');

/** `[celestrak-proxy] refresh failed` → `{ component: 'celestrak-proxy', text: 'refresh failed' }`. */
export function splitConsoleTag(text) {
  const match = String(text).match(TAG);
  if (!match) return { component: null, text: String(text) };
  const component = match[1].toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return { component: /^[a-z]/.test(component) ? component : null, text: String(text).slice(match[0].length) };
}

/**
 * Vite bundles vite.config.js and every proxy it imports into one temporary
 * `vite.config.js.timestamp-<ms>-<hash>.mjs`; a line in it names no source
 * file. Run with `--enable-source-maps` and frames map back to real modules.
 */
const BUNDLED_CONFIG = /\.timestamp-\d+-[0-9a-f]+\.mjs$/;

/**
 * First stack frame outside this module and Node internals, as `file.mjs:line`.
 * Null when that frame is inside the unmapped config bundle.
 * @param {string|undefined} stack
 * @returns {string|null}
 */
export function callerLocation(stack) {
  for (const line of String(stack ?? '').split('\n').slice(1)) {
    const match = line.match(/\(?((?:file:\/\/)?[^\s()]+):(\d+):\d+\)?\s*$/);
    if (!match || match[1].startsWith('node:') || match[1].includes(BRIDGE_FILE)) continue;
    const file = match[1].split('?')[0].split('/').pop();
    if (BUNDLED_CONFIG.test(file)) return null;
    if (file) return `${file}:${match[2]}`;
  }
  return null;
}

/** Console arguments → one line. An Error contributes its name and message, not its stack. */
export function formatConsoleArgs(args) {
  const parts = args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : arg));
  try {
    return format(...parts).replace(ANSI, '').trim();
  } catch {
    // format() calls each object's inspect hook; a hostile one must not drop the event.
    return parts.map((part) => (typeof part === 'string' ? part : typeof part)).join(' ');
  }
}

/**
 * Build the Server Log event for one console call, or null when it should not be logged.
 * @param {'warn'|'error'} method
 * @param {unknown[]} args
 * @param {string|null} [where] Caller file:line.
 */
export function consoleLogEvent(method, args, where = null) {
  const { component, text } = splitConsoleTag(formatConsoleArgs(args));
  if (!text || (component && SKIPPED_COMPONENTS.has(component))) return null;
  const detail = { component: component ?? 'console' };
  if (where) detail.where = where;
  return {
    level: method === 'error' ? 'error' : 'warn',
    source: 'server',
    code: `server.${component ?? 'console'}`,
    message: text,
    detail,
  };
}

/**
 * Wrap `target.warn` / `target.error` so each call is also recorded. The
 * original output is unchanged and always happens first. Idempotent per
 * target (a Vite in-process restart re-runs plugins); a console call made
 * while recording — e.g. the store reporting its own failure — is not bridged.
 * @param {(event: object) => unknown} record
 * @param {Console} [target]
 * @returns {() => void} Restores the original methods.
 */
export function installConsoleBridge(record, target = console) {
  if (target[INSTALLED]) return target[INSTALLED];
  const originals = { warn: target.warn, error: target.error };
  let recording = false;
  for (const method of ['warn', 'error']) {
    target[method] = function bridgedConsole(...args) {
      originals[method].apply(target, args);
      if (recording) return;
      recording = true;
      try {
        const event = consoleLogEvent(method, args, callerLocation(new Error().stack));
        if (event) record(event);
      } catch (error) {
        originals.warn.call(target, `[server-log] console bridge dropped an event: ${error?.message || error}`);
      } finally {
        recording = false;
      }
    };
  }
  const uninstall = () => {
    target.warn = originals.warn;
    target.error = originals.error;
    delete target[INSTALLED];
  };
  target[INSTALLED] = uninstall;
  return uninstall;
}
