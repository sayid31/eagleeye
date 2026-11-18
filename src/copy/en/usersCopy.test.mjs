import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findGlossaryViolations } from './glossary.js';
import { ACTIVITY_COPY, OVERVIEW_COPY, USERS_COPY } from './users.js';

/** Every string of a copy tree, calling builders with plausible arguments. */
function strings(value, seen = new Set()) {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') return strings(value('contoh@contoh.test', 15, true));
  if (value && typeof value === 'object' && !seen.has(value)) { seen.add(value); return Object.values(value).flatMap((entry) => strings(entry, seen)); }
  return [];
}

test('users copy: glossary terms, no raw error codes or HTTP statuses, no empty strings', () => {
  const all = [...strings(USERS_COPY), ...strings(ACTIVITY_COPY), ...strings(OVERVIEW_COPY)];
  assert.ok(all.length > 100);
  for (const text of all) {
    assert.ok(text.trim().length > 0);
    assert.deepEqual(findGlossaryViolations(text), [], text);
    assert.doesNotMatch(text, /\b[A-Z]{3,}_[A-Z_]+\b/, text);
  }
  const source = readFileSync(new URL('./users.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.deepEqual(findGlossaryViolations(source), []);
});

test('users copy: every risky action names its subject and its consequence', () => {
  const name = 'Budi';
  for (const kind of ['deactivate', 'activate', 'revokeSessions', 'delete', 'promote', 'demote']) {
    const { title, impact, action } = USERS_COPY.confirm[kind];
    assert.match(impact(name), /Budi/, kind);
    assert.ok(action.length > 8 && !/^(Yes|OK|Continue)/.test(action), `specific action label for ${kind}`);
    assert.match(title, /\?$/);
  }
  assert.match(USERS_COPY.confirm.delete.impact(name), /cannot be undone/);
  assert.match(USERS_COPY.confirm.deactivate.impact(name), /can be activated again/);
  assert.match(USERS_COPY.confirm.delete.typeLabel('a@b.test'), /a@b\.test/);
});

test('users copy: each capability has a one-line cost or impact description', () => {
  for (const key of ['layers', 'ai', 'premium']) {
    const { title, short, description } = USERS_COPY.capabilities[key];
    assert.ok(title && short);
    assert.match(description, /\.$/);
    assert.ok(description.length < 120, 'one line');
  }
});

test('users copy: every audit action id the server writes has wording', async () => {
  const { AUDIT_ACTIONS } = await import('../../auth/auditLog.mjs');
  for (const action of AUDIT_ACTIONS) assert.ok(ACTIVITY_COPY.audit.actions[action], action);
});
