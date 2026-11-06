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
