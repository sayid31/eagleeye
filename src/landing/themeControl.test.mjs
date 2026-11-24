import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { themeControlModel, THEME_LABELS } from './themeControl.js';

const pressedOf = (preference, prefersDark) => themeControlModel(preference, prefersDark).filter((b) => b.pressed).map((b) => b.value);

test('an explicit choice is the pressed button whatever the OS asks for', () => {
  for (const prefersDark of [true, false]) {
    assert.deepEqual(pressedOf('light', prefersDark), ['light']);
    assert.deepEqual(pressedOf('dark', prefersDark), ['dark']);
  }
});

test('stored system, nothing stored or tampered values follow the OS: the painted theme is pressed', () => {
  for (const value of ['system', undefined, null, '', 'Dark', 'sepia', 42, {}]) {
    assert.deepEqual(pressedOf(value, true), ['dark'], `${String(value)} on a dark OS`);
    assert.deepEqual(pressedOf(value, false), ['light'], `${String(value)} on a light OS`);
  }
});

test('there are exactly two buttons, Light then Dark, with English accessible names', () => {
  assert.deepEqual(themeControlModel('light', false).map((button) => button.label), ['Light', 'Dark']);
  assert.deepEqual(Object.values(THEME_LABELS), ['Light', 'Dark']);
});

test('landing.html carries exactly the two controls the model describes, each with aria-pressed and a name', () => {
  const html = readFileSync(fileURLToPath(new URL('../../landing.html', import.meta.url)), 'utf8');
  const buttons = [...html.matchAll(/<button type="button" data-theme-value="(\w+)" aria-pressed="(\w+)" aria-label="([^"]+)"/g)];
  assert.deepEqual(buttons.map((match) => [match[1], match[3]]), [['light', 'Light'], ['dark', 'Dark']]);
  assert.equal((html.match(/data-theme-value=/g) || []).length, 2, 'no other theme button');
  assert.equal(html.includes('ld-i-monitor'), false, 'the System (monitor) icon is gone');
});
