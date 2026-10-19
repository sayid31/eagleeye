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

test('interactive inspector controls have a visible keyboard focus ring', () => {
  assert.match(css, /\.cam-nearby-btn:focus-visible/);
});

test('no glowing text or neon box-shadows', () => {
  assert.doesNotMatch(css, /text-shadow:\s*0 0/);
  assert.doesNotMatch(css, /box-shadow:[^;]*0 0 \d+px/);
});

test('main.js mounts the inspector after the shell', () => {
  assert.ok(main.indexOf('initCameraInspector({') > main.indexOf('initShell({'));
  assert.match(main, /initCameraInspector\(\{ dataManager, styleManager \}\)/);
});

test('the title row sits above the camera screen, which sits ahead of the search', () => {
  assert.match(css, /#cctv-panel \.panel-header \{ order: -5; \}/);
  assert.match(css, /#cctv-panel \.cctv-frame-wrap \{ order: -4; \}/);
  assert.match(css, /#cctv-panel \.cam-inspector \{ order: -1; \}/);
});

test('CCTV control rows wrap so longer Indonesian labels never squeeze the camera picker', () => {
  assert.match(css, /#cctv-panel \.cctv-controls\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /#cctv-panel \.cctv-controls \.scene-btn\s*\{[^}]*white-space:\s*normal/);
  assert.match(css, /#cctv-panel \.cctv-controls \.cctv-camera-picker\s*\{[^}]*flex:\s*1 1 100%/);
});

test('the CCTV camera picker shows a chevron that flips while the list is open', () => {
  assert.match(css, /\.cctv-camera-picker::after\s*\{[^}]*content:\s*'expand_more'[^}]*pointer-events:\s*none/);
  assert.match(css, /\.cctv-camera-picker:has\(\.cctv-camera-trigger\[aria-expanded='true'\]\)::after\s*\{[^}]*rotate\(180deg\)/);
  assert.match(css, /\.cctv-camera-trigger\s*\{[^}]*padding-right:\s*34px/);
});

test('CCTV power controls live in a closed "Opsi lanjutan" disclosure but keep their ids', async () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const block = html.match(/<details class="cctv-advanced">[\s\S]*?<\/details>/)?.[0];
  assert.ok(block, 'advanced disclosure exists');
  assert.doesNotMatch(block, /<details[^>]*\sopen/);
  for (const id of ['cctv-focus-btn', 'cctv-coverage-btn', 'cctv-auto-hop-btn', 'cctv-projection-btn', 'cctv-quality-chip']) {
    assert.ok(block.includes(`id="${id}"`), id);
  }
  assert.match(css, /#cctv-panel \.cctv-advanced > summary/);
});
