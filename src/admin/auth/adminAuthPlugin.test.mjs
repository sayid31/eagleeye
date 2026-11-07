import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTH_LOG_EVENTS } from './adminAuthPlugin.mjs';

test('every auth route event maps to a Server Log entry with a level and a code', () => {
  for (const event of ['login_ok', 'logout', 'login_rejected', 'login_failed']) {
    const entry = AUTH_LOG_EVENTS[event];
    assert.ok(['info', 'warn', 'error'].includes(entry.level), event);
    assert.match(entry.code, /^admin\./);
    assert.ok(!/@/.test(entry.message), 'no account detail in the fixed message');
  }
  assert.equal(AUTH_LOG_EVENTS.login_rejected.level, 'warn');
});

test('auth events go to the Server Log and to the audit trail with a reason code only', async () => {
  const { createAuthEventSink } = await import('./adminAuthPlugin.mjs');
  const logged = [];
  const audited = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    const sink = createAuthEventSink({ record: (e) => audited.push(e) }, (e) => logged.push(e));
    sink('login_ok');
    sink('login_rejected', { reason: 'not_admin' });
    sink('unknown_event');
  } finally { console.warn = warn; }
  assert.deepEqual(logged.map((e) => e.code), ['admin.login', 'admin.login_denied']);
  assert.deepEqual(audited, [
    { event: 'admin.login', source: 'google', result: 'ok' },
    { event: 'admin.login_denied', source: 'google', result: 'not_admin' },
  ]);
});
