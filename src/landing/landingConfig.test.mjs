import test from 'node:test';
import assert from 'node:assert/strict';
import { accessContactHref, LANDING_ACCESS_CONTACT } from './landingConfig.js';
import { landingCta } from './landingCta.js';

test('the shipped config has no contact, so "Minta akses" is hidden by default', () => {
  assert.equal(LANDING_ACCESS_CONTACT, '');
  assert.equal(accessContactHref(), null);
  assert.deepEqual(landingCta(null, { accessContact: accessContactHref() }).secondary, []);
});

test('empty or blank contacts are hidden', () => {
  for (const value of ['', '   ', undefined, null, 42]) assert.equal(accessContactHref(value), null, String(value));
});

test('mailto: and https: contacts are shown as configured (trimmed)', () => {
  assert.equal(accessContactHref('mailto:akses@example.test'), 'mailto:akses@example.test');
  assert.equal(accessContactHref('  https://example.test/akses  '), 'https://example.test/akses');
});

test('relative, plain-text and script/other-scheme contacts are rejected', () => {
  for (const value of ['akses@example.test', '/kontak', 'javascript:alert(1)', 'http://example.test', 'data:text/html,x']) {
    assert.equal(accessContactHref(value), null, value);
  }
});
