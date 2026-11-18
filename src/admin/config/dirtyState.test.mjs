import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDirty, isLeavingClick } from './dirtyState.js';
import { failureMessage } from './failureMessage.js';

test('isDirty compares deeply and ignores key order', () => {
  assert.equal(isDirty({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }), false);
  assert.equal(isDirty({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 3] } }), true);
  assert.equal(isDirty({ rows: [] }, { rows: [{ forbid: '', instead: '' }] }), true);
  assert.equal(isDirty({ name: '' }, { name: ' ' }), true, 'whitespace is a change the person made');
});

test('isLeavingClick catches plain same-origin link clicks only', () => {
  const link = (attrs = {}) => ({ getAttribute: (n) => attrs.href ?? null, hasAttribute: (n) => n in attrs, target: attrs.target ?? '' });
  const click = (extra = {}) => ({ defaultPrevented: false, button: 0, ...extra });
  const origin = 'http://localhost:4173';
  assert.equal(isLeavingClick(click(), link({ href: '/dev/persona' }), origin), true);
  assert.equal(isLeavingClick(click({ ctrlKey: true }), link({ href: '/dev/persona' }), origin), false);
  assert.equal(isLeavingClick(click({ button: 1 }), link({ href: '/dev/persona' }), origin), false);
  assert.equal(isLeavingClick(click(), link({ href: 'https://example.test/x' }), origin), false);
  assert.equal(isLeavingClick(click(), link({ href: '#main-content' }), origin), false);
  assert.equal(isLeavingClick(click(), link({ href: '/x', target: '_blank' }), origin), false);
  assert.equal(isLeavingClick(click(), null, origin), false);
});

test('failureMessage shows the server sentence for 4xx validation, a mapped sentence otherwise', () => {
  const failure = (status, detail) => Object.assign(new Error('x'), { status, detail });
  assert.equal(failureMessage(failure(400, 'Unknown key: FOO')), 'Unknown key: FOO');
  assert.equal(failureMessage(failure(422, 'Invalid settings: a; b')), 'Invalid settings: a; b');
  assert.match(failureMessage(failure(403, 'Access denied')), /permission/);
  assert.match(failureMessage(failure(500, 'boom')), /Server Log/);
  assert.match(failureMessage(failure(400, 'INVALID_INPUT')), /not valid/);
  assert.match(failureMessage(new TypeError('Failed to fetch')), /reach the server/);
});
