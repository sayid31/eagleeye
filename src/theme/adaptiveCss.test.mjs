import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./adaptive.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

test('adaptive.css is imported by the theme', () => {
  assert.match(theme, /@import '\.\/adaptive\.css'/);
});

test('chrome colours flip with the basemap tone', () => {
  assert.match(css, /body\.ee-shell\[data-map-tone='light'\]\s*\{[^}]*--ee-chrome-fg:\s*#0b1220/);
  assert.match(css, /--ee-chrome-outline:\s*rgba\(255, 255, 255/);
});

test('globe action icons have no plate', () => {
  const [body] = [...css.matchAll(/body\.ee-shell #top-center-actions button\s*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.match(body, /background:\s*transparent/);
  assert.match(body, /border-color:\s*transparent/);
  assert.match(body, /backdrop-filter:\s*none/);
});

test('attribution is recoloured, never hidden', () => {
  assert.match(css, /#cesium-credits/);
  assert.doesNotMatch(css, /display:\s*none|visibility:\s*hidden|opacity:\s*0\s*(;|$)/);
});
