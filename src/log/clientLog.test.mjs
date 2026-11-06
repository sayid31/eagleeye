import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_LOG_URL, browserFamily, createClientLog, jsErrorEvent, logClientEvent, shortLocation } from './clientLog.js';

test('browserFamily reports family + major version only', () => {
  assert.equal(browserFamily('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'), 'Chrome 141');
  assert.equal(browserFamily('Mozilla/5.0 ... Chrome/141.0 Safari/537.36 Edg/141.0'), 'Edge 141');
  assert.equal(browserFamily('Mozilla/5.0 (X11; rv:133.0) Gecko/20100101 Firefox/133.0'), 'Firefox 133');
  assert.equal(browserFamily('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15'), 'Safari 18');
  assert.equal(browserFamily('curl/8'), 'Other');
});

test('jsErrorEvent keeps the file name and line, not the origin or query', () => {
  assert.equal(shortLocation('http://localhost:4173/src/ui.js?t=123', 120), 'ui.js:120');
  assert.deepEqual(jsErrorEvent({ kind: 'error', message: 'x is undefined', file: 'http://localhost:4173/src/ui.js?t=1', line: 9 }),
    { level: 'error', source: 'browser', code: 'browser.js_error', message: 'x is undefined (ui.js:9)' });
  assert.equal(jsErrorEvent({ kind: 'rejection', message: 'boom' }).code, 'browser.unhandled_rejection');
});

test('events are batched, de-duplicated and posted as same-origin JSON with client info', async () => {
  const posts = [];
  const timers = [];
  const log = createClientLog({
    fetchImpl: async (url, opts) => { posts.push({ url, opts }); return { ok: true }; },
    setTimer: (fn) => timers.push(fn),
    client: { version: '0.1.1', browser: 'Chrome 141' },
  });
  const ev = { level: 'warn', source: 'voice', code: 'voice.tool_failed', message: 'fly_to_location' };
  log.log(ev);
  log.log(ev);
  log.log({ ...ev, message: 'other' });
  assert.equal(log.pending(), 2);
  assert.equal(timers.length, 1);
  await timers.shift()();
  assert.equal(posts[0].url, CLIENT_LOG_URL);
  assert.equal(posts[0].opts.keepalive, true);
  assert.equal(posts[0].opts.headers['Content-Type'], 'application/json');
  const body = JSON.parse(posts[0].opts.body);
  assert.deepEqual(body.client, { version: '0.1.1', browser: 'Chrome 141' });
  assert.equal(body.events.length, 2);
  assert.ok(!('__key' in body.events[0]));
});

test('a failed post warns once and never throws', async () => {
  const warned = [];
  const warn = console.warn;
  console.warn = (m) => warned.push(m);
  try {
    const log = createClientLog({ fetchImpl: async () => { throw new Error('offline'); }, setTimer: () => {} });
    log.log({ level: 'error', source: 'browser', code: 'browser.js_error' });
    assert.equal(await log.flush(), false);
    log.log({ level: 'error', source: 'browser', code: 'browser.js_error', message: 'again' });
    assert.equal(await log.flush(), false);
  } finally { console.warn = warn; }
  assert.equal(warned.length, 1);
});

test('logClientEvent is a safe no-op before install', () => {
  assert.doesNotThrow(() => logClientEvent({ level: 'info', source: 'map', code: 'map.x' }));
});
