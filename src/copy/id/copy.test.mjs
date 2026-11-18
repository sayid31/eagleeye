import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERROR_MESSAGES, GENERIC_ERROR, NETWORK_ERROR, STATUS_MESSAGES, errorMessage } from './errors.js';
import { GLOSSARY, findGlossaryViolations } from './glossary.js';
import * as copy from './index.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Every string a copy module exports, calling function entries with plausible arguments. */
function strings(value, seen = new Set()) {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') return strings(value('contoh', 12, 3));
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    return Object.values(value).flatMap((entry) => strings(entry, seen));
  }
  return [];
}

test('errorMessage: a known code maps to its Indonesian sentence', () => {
  assert.equal(errorMessage('FEATURE_DISABLED'), ERROR_MESSAGES.FEATURE_DISABLED);
  assert.equal(errorMessage({ error: 'EMAIL_TAKEN' }), 'Email ini sudah dipakai akun lain.');
  assert.equal(errorMessage(Object.assign(new Error('x'), { code: 'REAUTH_FAILED', status: 403 })), 'Password Anda salah.');
});

test('errorMessage: detail-bearing codes name the reason or the field', () => {
  assert.equal(errorMessage({ error: 'PASSWORD_WEAK', reason: 'too_short', min: 15 }), 'Password minimal 15 karakter.');
  assert.equal(errorMessage({ error: 'PASSWORD_WEAK', reason: 'matches_identity' }), 'Password tidak boleh sama dengan email atau nama.');
  assert.equal(errorMessage({ error: 'PASSWORD_WEAK' }), ERROR_MESSAGES.PASSWORD_WEAK);
  assert.equal(errorMessage({ error: 'INVALID_INPUT', field: 'email' }), 'Isian email tidak valid.');
  assert.equal(errorMessage({ error: 'INVALID_INPUT', field: 'nope' }), ERROR_MESSAGES.INVALID_INPUT);
});

test('errorMessage: unknown or missing codes fall back to the status class, then to a generic sentence', () => {
  assert.equal(errorMessage({ code: 'SOMETHING_NEW', status: 403 }), STATUS_MESSAGES[403]);
  assert.equal(errorMessage({ status: 429 }), ERROR_MESSAGES.RATE_LIMITED);
  assert.equal(errorMessage({ status: 502 }), ERROR_MESSAGES.INTERNAL_ERROR);
  assert.equal(errorMessage({ code: 'SOMETHING_NEW' }), GENERIC_ERROR);
  assert.equal(errorMessage(null), GENERIC_ERROR);
  assert.equal(errorMessage(undefined), GENERIC_ERROR);
  assert.equal(errorMessage('constructor'), GENERIC_ERROR, 'prototype keys are not codes');
  assert.equal(errorMessage(new TypeError('Failed to fetch')), NETWORK_ERROR);
});

test('no error sentence leaks a raw code or an HTTP status', () => {
  const all = [...Object.values(ERROR_MESSAGES), ...Object.values(STATUS_MESSAGES), GENERIC_ERROR, NETWORK_ERROR];
  for (const sentence of all) {
    assert.doesNotMatch(sentence, /\b[A-Z]{3,}_[A-Z_]+\b/, sentence);
    assert.doesNotMatch(sentence, /\b[1-5]\d\d\b/, sentence);
    assert.match(sentence, /[.]$/, 'ends like a sentence');
  }
});

test('every API error code the server and the older api modules know has a sentence', () => {
  const known = ['INVALID_INPUT', 'INVALID_JSON', 'BODY_TOO_LARGE', 'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'AUTH_REQUIRED', 'ADMIN_REQUIRED',
    'SUPER_ADMIN_REQUIRED', 'TARGET_FORBIDDEN', 'TARGET_IS_SUPER_ADMIN', 'CANNOT_ACT_ON_SELF', 'ROLE_NOT_ASSIGNABLE', 'EMAIL_TAKEN',
    'SUPER_ADMIN_EMAIL_RESERVED', 'PASSWORD_WEAK', 'REAUTH_FAILED', 'REAUTH_REQUIRED', 'CONFIRM_EMAIL_MISMATCH', 'AUTH_UNAVAILABLE',
    'INTERNAL_ERROR', 'FEATURE_DISABLED', 'CAPABILITY_REQUIRED', 'RATE_LIMITED'];
  for (const code of known) assert.ok(Object.hasOwn(ERROR_MESSAGES, code), code);
});

test('glossary: discouraged terms are found as whole phrases only, case-insensitively', () => {
  assert.deepEqual(findGlossaryViolations('Matikan Kill switch').map((row) => row.use), ['Sakelar darurat']);
  assert.deepEqual(findGlossaryViolations('buka server log sekarang').map((row) => row.use), ['Log server']);
  assert.deepEqual(findGlossaryViolations('Sakelar darurat dan Log server'), []);
  assert.deepEqual(findGlossaryViolations('killswitches'), []);
  assert.ok(GLOSSARY.length >= 2);
});

test('every string in src/copy/id respects the glossary and is written in Indonesian punctuation (no raw error codes)', () => {
  // GLOSSARY lists the discouraged terms themselves, so it is the one export that may contain them.
  const all = strings(Object.fromEntries(Object.entries(copy).filter(([name]) => name !== 'GLOSSARY')));
  assert.ok(all.length > 80);
  for (const text of all) assert.deepEqual(findGlossaryViolations(text), [], text);
  const files = readdirSync(dir).filter((name) => name.endsWith('.js') && name !== 'glossary.js');
  assert.ok(files.length >= 5);
  for (const file of files) {
    const source = readFileSync(path.join(dir, file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.deepEqual(findGlossaryViolations(source), [], file);
  }
});
