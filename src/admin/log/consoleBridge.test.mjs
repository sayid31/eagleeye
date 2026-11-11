import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  callerLocation, consoleLogEvent, formatConsoleArgs, installConsoleBridge, splitConsoleTag,
} from './consoleBridge.mjs';
import { normalizeLogEvent } from './serverLogCore.mjs';

function fakeConsole() {
  const printed = [];
  return {
    printed,
    warn: (...args) => printed.push(['warn', args]),
    error: (...args) => printed.push(['error', args]),
  };
}

test('splitConsoleTag extracts a code-safe component from the [tag] prefix', () => {
  assert.deepEqual(splitConsoleTag('[celestrak-proxy] refresh failed'), { component: 'celestrak-proxy', text: 'refresh failed' });
  assert.deepEqual(splitConsoleTag('[Data:ais-live-vessels] timeout'), { component: 'data-ais-live-vessels', text: 'timeout' });
  assert.deepEqual(splitConsoleTag('[AISStream] down'), { component: 'aisstream', text: 'down' });
  assert.deepEqual(splitConsoleTag('plain message'), { component: null, text: 'plain message' });
  assert.equal(splitConsoleTag('[1234] x').component, null);
});

test('callerLocation skips the bridge and node internals', () => {
  const stack = [
    'Error',
    '    at Object.bridgedConsole [as warn] (file:///app/src/admin/log/consoleBridge.mjs:90:9)',
    '    at refresh (file:///app/src/data/celestrakProxy.mjs:97:15)',
    '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
  ].join('\n');
  assert.equal(callerLocation(stack), 'celestrakProxy.mjs:97');
  assert.equal(callerLocation(undefined), null);
  const bundled = [
    'Error',
    '    at bridgedConsole (file:///app/src/admin/log/consoleBridge.mjs:90:9)',
    '    at refresh (file:///app/vite.config.js.timestamp-1794370000000-8a7f3c2d1e0b9.mjs:8196:15)',
  ].join('\n');
  assert.equal(callerLocation(bundled), null, 'an unmapped config-bundle line names no real source');
  const mapped = '    at refresh (/app/src/data/celestrakProxy.mjs:97:15)';
  assert.equal(callerLocation(`Error\n${mapped}`), 'celestrakProxy.mjs:97');
});

test('formatConsoleArgs keeps an Error as name: message and strips ANSI colour', () => {
  assert.equal(formatConsoleArgs(['[x] failed', new TypeError('fetch failed')]), '[x] failed TypeError: fetch failed');
  assert.equal(formatConsoleArgs(['\u001B[31mred\u001B[39m %s', 'ok']), 'red ok');
});

test('consoleLogEvent builds a valid, redacted Server Log event', () => {
  const event = consoleLogEvent('error', ['[firms-proxy] upstream failed for ?map_key=abcdef123456 :', new Error('HTTP 403')], 'firmsProxy.mjs:88');
  assert.deepEqual(event, {
    level: 'error',
    source: 'server',
    code: 'server.firms-proxy',
    message: 'upstream failed for ?map_key=abcdef123456 : Error: HTTP 403',
    detail: { component: 'firms-proxy', where: 'firmsProxy.mjs:88' },
  });
  const normalized = normalizeLogEvent(event);
  assert.ok(normalized, 'event must pass Server Log validation');
  assert.match(normalized.message, /map_key=\[redacted\]/);
  assert.deepEqual(normalized.detail, { component: 'firms-proxy', where: 'firmsProxy.mjs:88' });
});

test('untagged warnings are logged under server.console; server-log plumbing is skipped', () => {
  assert.equal(consoleLogEvent('warn', ['something odd']).code, 'server.console');
  assert.equal(consoleLogEvent('warn', ['something odd']).level, 'warn');
  assert.equal(consoleLogEvent('warn', ['[server-log] write failed: EACCES']), null);
  assert.equal(consoleLogEvent('warn', ['']), null);
});

test('installConsoleBridge prints first, records with the caller location, and uninstalls', () => {
  const target = fakeConsole();
  const recorded = [];
  const uninstall = installConsoleBridge((event) => recorded.push(event), target);
  target.warn('[tomtom-proxy] tile failed', 503);
  assert.deepEqual(target.printed, [['warn', ['[tomtom-proxy] tile failed', 503]]]);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].code, 'server.tomtom-proxy');
  assert.equal(recorded[0].message, 'tile failed 503');
  assert.match(recorded[0].detail.where, /^consoleBridge\.test\.mjs:\d+$/);
  uninstall();
  target.warn('[tomtom-proxy] after uninstall');
  assert.equal(recorded.length, 1);
});

test('installConsoleBridge is idempotent and never re-enters from the recorder', () => {
  const target = fakeConsole();
  const recorded = [];
  const record = (event) => { recorded.push(event); target.warn('[store] nested warning'); };
  const uninstall = installConsoleBridge(record, target);
  assert.equal(installConsoleBridge(record, target), uninstall);
  target.error('[overpass] mirror failed');
  assert.equal(recorded.length, 1, 'a console call made while recording must not be bridged');
  assert.equal(target.printed.length, 2, 'the nested warning still prints');
  uninstall();
});

test('a throwing recorder never breaks the console call', () => {
  const target = fakeConsole();
  const uninstall = installConsoleBridge(() => { throw new Error('disk full'); }, target);
  assert.doesNotThrow(() => target.error('[x] boom'));
  assert.equal(target.printed[0][0], 'error');
  assert.match(target.printed[1][1][0], /console bridge dropped an event: disk full/);
  uninstall();
});

test('the plugin enables the bridge unless GEV_SERVER_LOG_CONSOLE switches it off', async () => {
  const { consoleBridgeEnabled } = await import('./serverLogPlugin.mjs');
  assert.equal(consoleBridgeEnabled({}), true);
  assert.equal(consoleBridgeEnabled({ GEV_SERVER_LOG_CONSOLE: '1' }), true);
  for (const off of ['0', 'false', 'OFF', ' no ']) assert.equal(consoleBridgeEnabled({ GEV_SERVER_LOG_CONSOLE: off }), false, off);
});
