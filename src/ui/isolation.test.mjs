import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkIsolation, staticJsGraph } from '../../scripts/qa-ui/isolation.mjs';

const MAP_CSS = 'body{margin:0}.hud{color:#0ff}';
const TAILWIND_CSS = '/*! tailwindcss v4.3.5 | MIT License | https://tailwindcss.com */\n*,::after{--tw-border-style:solid}';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const baseline = { mapCss: { bytes: Buffer.byteLength(MAP_CSS), sha256: sha(MAP_CSS) } };

/** Build a miniature dist/ tree; `overrides` replace file contents. */
function fixture(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isolation-'));
  const files = {
    'index.html': '<link rel="stylesheet" href="/assets/main-a.css"><script type="module" src="/assets/main-a.js"></script><link rel="modulepreload" href="/assets/shared-a.js">',
    'admin.html': '<link rel="stylesheet" href="/assets/app-a.css">',
    'login.html': '<link rel="stylesheet" href="/assets/app-a.css">',
    'landing.html': '<link rel="stylesheet" href="/assets/landing-a.css">',
    'assets/main-a.css': MAP_CSS,
    'assets/main-a.js': 'import{h as x}from"./shared-a.js";import("./lazy-a.js");console.log(x)',
    'assets/shared-a.js': 'export const h=1;',
    'assets/lazy-a.js': 'export default Symbol.for("react.transitional.element")',
    'assets/app-a.css': TAILWIND_CSS,
    'assets/landing-a.css': ':root{--background:#000}',
    ...overrides,
  };
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}
const run = (overrides) => { const dir = fixture(overrides); try { return checkIsolation(dir, baseline); } finally { fs.rmSync(dir, { recursive: true, force: true }); } };

test('a clean build passes: map CSS identical, React only behind a dynamic import the map never loads statically', () => {
  assert.deepEqual(run().failures, []);
});

test('static graph follows import/export edges but not dynamic import()', () => {
  const dir = fixture();
  try {
    const graph = staticJsGraph(dir, ['/assets/main-a.js']);
    assert.deepEqual(graph.sort(), ['/assets/main-a.js', '/assets/shared-a.js']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Tailwind output in the map CSS is reported (banner or --tw- variables)', () => {
  assert.ok(run({ 'assets/main-a.css': MAP_CSS + TAILWIND_CSS }).failures.some((f) => /contains Tailwind output/.test(f)));
  assert.ok(run({ 'assets/main-a.css': `${MAP_CSS}a{--tw-x:1}` }).failures.some((f) => /contains Tailwind output/.test(f)));
});

test('any change to the map CSS (size or content) is reported against the base build', () => {
  const changed = run({ 'assets/main-a.css': `${MAP_CSS} ` });
  assert.ok(changed.failures.some((f) => /changed vs the base build/.test(f)));
  assert.ok(run({ 'assets/main-a.css': MAP_CSS.replace('0ff', '0fe') }).failures.some((f) => /changed vs the base build/.test(f)), 'same size, different bytes');
});

test('React or Radix reachable from the map entry is reported', () => {
  const leaked = run({ 'assets/shared-a.js': 'export const h=Symbol.for("react.transitional.element")' });
  assert.ok(leaked.failures.some((f) => /contains React\/Radix/.test(f)));
  assert.ok(run({ 'assets/shared-a.js': 'export const h="data-radix-popper"' }).failures.some((f) => /contains React\/Radix/.test(f)));
});

test('admin and login must link the Tailwind CSS; the landing must not', () => {
  assert.ok(run({ 'assets/app-a.css': 'a{}' }).failures.some((f) => /admin\.html does not link the Tailwind CSS/.test(f)));
  assert.ok(run({ 'assets/landing-a.css': TAILWIND_CSS }).failures.some((f) => /landing CSS .* contains Tailwind output/.test(f)));
});

test('third-party requests from the React pages and the landing are reported', () => {
  assert.ok(run({ 'admin.html': '<link rel="stylesheet" href="/assets/app-a.css"><link href="https://fonts.googleapis.com/css2">' }).failures.some((f) => /admin\.html loads from another origin/.test(f)));
  assert.ok(run({ 'assets/app-a.css': `${TAILWIND_CSS}@font-face{src:url(https://cdn.example/x.woff2)}` }).failures.some((f) => /requests another origin/.test(f)));
});
