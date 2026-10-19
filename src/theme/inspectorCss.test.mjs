import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./inspector.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

test('theme.css imports the inspector layer', () => {
  assert.match(theme, /@import '\.\/inspector\.css'/);
});

test('every --ee-* token used by the inspector is defined', () => {
  const used = new Set([...css.matchAll(/var\((--ee-[\w-]+)/g)].map((m) => m[1]));
  for (const name of used) assert.match(tokens, new RegExp(`${name}:`), name);
});

test('the unofficial-source badge is restyled, never hidden', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, sel]) => sel.includes('#cctv-source-badge'));
  assert.ok(rules.length > 0);
  for (const [, , body] of rules) assert.doesNotMatch(body, /display:\s*none|visibility:\s*hidden|opacity:\s*0\b/);
});

test('legacy controls are hidden from layout only, and only while advanced is closed', () => {
  assert.match(css, /#cctv-panel:not\(\.ee-advanced-open\) \.cctv-controls/);
  assert.match(css, /#cctv-panel:not\(\.ee-advanced-open\) \.cctv-calibration-block/);
});

test('interactive inspector controls have a visible keyboard focus ring', () => {
  assert.match(css, /\.cam-inspector-btn:focus-visible/);
  assert.match(css, /\.cam-nearby-btn:focus-visible/);
});

test('no glowing text or neon box-shadows', () => {
  assert.doesNotMatch(css, /text-shadow:\s*0 0/);
  assert.doesNotMatch(css, /box-shadow:[^;]*0 0 \d+px/);
});

test('main.js mounts the inspector after the shell', () => {
  assert.ok(main.indexOf('initCameraInspector({') > main.indexOf('initShell({'));
});

test('the camera screen is ordered first, ahead of the search and details', () => {
  assert.match(css, /#cctv-panel \.cctv-frame-wrap \{ order: -4; \}/);
  assert.match(css, /#cctv-panel \.cam-inspector \{ order: -1; \}/);
});
