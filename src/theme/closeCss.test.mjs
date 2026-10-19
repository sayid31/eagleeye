import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./close.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const mixin = readFileSync(new URL('../panelAdaptiveLayoutMixin.js', import.meta.url), 'utf8');

test('close.css is imported by the theme', () => {
  assert.match(theme, /@import '\.\/close\.css'/);
});

test('every side panel shows a close icon in place of the text glyph, keeping the button', () => {
  for (const id of ['data-panel', 'cctv-panel', 'scene-panel', 'pp-toggles', 'global-context-panel']) {
    assert.match(css, new RegExp(`#${id}`), id);
  }
  assert.match(css, /font-size:\s*0/);
  assert.match(css, /content:\s*'close'/);
  assert.match(css, /margin-left:\s*auto/);
});

test('the collapse button keeps its aria-label wiring', () => {
  assert.match(mixin, /btn\.setAttribute\('aria-label', `\$\{action\} \$\{panelName\}`\)/);
});
