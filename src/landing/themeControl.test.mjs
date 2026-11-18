import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { themeControlModel, THEME_LABELS } from './themeControl.js';

test('exactly one button is pressed and it matches the stored preference', () => {
  for (const preference of ['light', 'dark', 'system']) {
    const pressed = themeControlModel(preference).filter((button) => button.pressed);
    assert.deepEqual(pressed.map((button) => button.value), [preference]);
  }
});

test('unknown, missing or tampered values fall back to Sistem', () => {
  for (const bad of [undefined, null, '', 'Dark', 'sepia', 42, {}]) {
    assert.equal(themeControlModel(bad).find((button) => button.pressed).value, 'system', String(bad));
  }
});

test('buttons come in the order Terang, Gelap, Sistem with Indonesian accessible names', () => {
  assert.deepEqual(themeControlModel('light').map((button) => button.label), ['Terang', 'Gelap', 'Sistem']);
  assert.deepEqual(Object.values(THEME_LABELS), ['Terang', 'Gelap', 'Sistem']);
});

test('landing.html carries the same three controls the model describes, with aria-pressed and a name each', () => {
  const html = readFileSync(fileURLToPath(new URL('../../landing.html', import.meta.url)), 'utf8');
  const buttons = [...html.matchAll(/<button type="button" data-theme-value="(\w+)" aria-pressed="(\w+)" aria-label="([^"]+)"/g)];
  assert.deepEqual(buttons.map((match) => [match[1], match[3]]), [['light', 'Terang'], ['dark', 'Gelap'], ['system', 'Sistem']]);
  assert.deepEqual(buttons.filter((match) => match[2] === 'true').map((match) => match[1]), ['system']);
});
