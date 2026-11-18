import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doctorItems, keyPresence, overviewCards } from './overviewView.js';

const NOW = 1_800_000_000_000;
const summary = (patch = {}) => ({
  generatedAt: NOW,
  app: { version: '1.2.3', runtime: { name: 'Bun', version: '1.2.8' }, startedAt: NOW - 3_900_000, uptimeSeconds: 3900 },
  auth: { configured: true, googleSignIn: false },
  killSwitches: [{ gate: 'layers', killed: false }, { gate: 'ai', killed: true }, { gate: 'premium', killed: false }],
  serverLog: { recentErrors: 2, windowHours: 24 },
  ...patch,
});

test('overviewCards: concise values with a sub-label per card', () => {
  const cards = overviewCards(summary());
  assert.deepEqual(cards.version, { value: 'v1.2.3', detail: 'Running on Bun 1.2.8' });
  assert.equal(cards.uptime.value, '1 h 05 min');
  assert.deepEqual(cards.gates, { status: 'warn', value: '2 of 3 on', detail: 'Turned off: Voice & AI' });
  assert.deepEqual(cards.errors, { status: 'error', value: '2', detail: 'errors in the last 24 hours' });
  assert.deepEqual(cards.login.rows.map((row) => [row.status, row.text]), [['ok', 'Ready'], ['off', 'Not active']]);
});

test('overviewCards: all gates on and no errors read as ok; unconfigured login is an error', () => {
  const calm = overviewCards(summary({ killSwitches: [{ gate: 'ai', killed: false }], serverLog: { recentErrors: 0, windowHours: 24 } }));
  assert.deepEqual([calm.gates.status, calm.gates.detail, calm.errors.status], ['ok', 'All paid features are on', 'ok']);
  assert.match(calm.errors.detail, /No errors/);
  const broken = overviewCards(summary({ auth: { configured: false, googleSignIn: true } }));
  assert.deepEqual([broken.login.status, broken.login.rows[0].text, broken.login.rows[1].status], ['error', 'Not ready', 'ok']);
});

test('keyPresence shows display names and presence only', () => {
  const view = keyPresence([{ id: 'openai', title: 'OPENAI', set: true }, { id: 'aisstream', title: 'AISSTREAM', set: false }]);
  assert.equal(view.summary, '1 of 2 keys set');
  assert.deepEqual(view.rows, [{ id: 'openai', name: 'OpenAI', set: true }, { id: 'aisstream', name: 'AISStream', set: false }]);
  assert.doesNotMatch(JSON.stringify(view), /sk-|value/);
});

test('doctorItems: plain-language title + text, level normalised, unknown ids fall back to the id', () => {
  const items = doctorItems([
    { id: 'auth.secret', level: 'error', params: { problem: 'missing' } },
    { id: 'auth.exposure', level: 'warn', params: { via: 'host', passwordOnlyAdmins: 2 } },
    { id: 'auth.future', level: 'info', params: {} },
  ]);
  assert.equal(items[0].level, 'error');
  assert.match(items[0].text, /BETTER_AUTH_SECRET is not set, so login cannot be used yet/);
  assert.match(items[1].text, /2 admins sign in with a password only.*reverse proxy/);
  assert.deepEqual([items[2].level, items[2].title, items[2].text], ['warn', 'auth.future', 'auth.future']);
});
