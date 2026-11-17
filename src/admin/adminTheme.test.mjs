import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTheme, resolveTheme } from './adminTheme.js';

test('a valid saved theme wins over the OS preference', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('a missing or invalid saved theme follows the OS preference', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(undefined, false), 'light');
  assert.equal(resolveTheme('<script>', true), 'dark');
});

test('nextTheme toggles between dark and light', () => {
  assert.equal(nextTheme('dark'), 'light');
  assert.equal(nextTheme('light'), 'dark');
});
