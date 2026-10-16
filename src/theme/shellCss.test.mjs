import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Comments are stripped so a leading comment is not read as part of a selector.
const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

const rulesFor = (selector) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter(([, sel]) => sel.split(',').some((s) => s.trim() === selector))
  .map(([, , body]) => body);

test('theme.css imports the shell layer', () => {
  assert.match(theme, /@import '\.\/shell\.css'/);
});

test('imagery attribution is never hidden by the shell', () => {
  for (const body of [...rulesFor('body.ee-shell #cesium-credits'), ...rulesFor('#cesium-credits')]) {
    assert.doesNotMatch(body, /display:\s*none|visibility:\s*hidden|opacity:\s*0\b/);
  }
  assert.match(css, /body\.ee-shell #cesium-credits/);
});

test('the layer name used by voice focus stays in the DOM, clipped not removed', () => {
  const [body] = rulesFor('body.ee-shell .data-toggle-left .data-name');
  assert.ok(body, 'rule exists');
  assert.doesNotMatch(body, /display:\s*none/);
});

test('the shell hides its chrome only in clean-view/recording modes', () => {
  assert.match(css, /body\.ui-clean-view #shell-topbar/);
  assert.match(css, /body\.recording-mode #shell-statusbar/);
});

test('the coordinate corners are hidden only outside cockpit mode', () => {
  assert.match(css, /body\.ee-shell:not\(\.cockpit-mode\) #intel-hud \.hud-bottom-left/);
});

test('no glowing text or neon box-shadows are introduced', () => {
  assert.doesNotMatch(css, /text-shadow:\s*0 0/);
  assert.doesNotMatch(css, /box-shadow:[^;]*0 0 \d+px (rgba\(0, ?2|#0)/);
});
