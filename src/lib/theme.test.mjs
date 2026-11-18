import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createJsxLoader } from '../testing/jsxLoader.mjs';
import {
  THEME_INIT_SCRIPT, THEME_PREFERENCES, THEME_STORAGE_KEY, applyTheme, normalizePreference, readStoredPreference, resolveTheme, writeStoredPreference,
} from './themeCore.js';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

/** Run the anti-flash script in a simulated browser and return what it did to <html>. */
function runInitScript({ stored, osDark, storageThrows = false, noMatchMedia = false }) {
  const classes = new Set();
  const root = { classList: { toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)) }, style: {} };
  const sandbox = {
    document: { documentElement: root },
    localStorage: { getItem: (key) => { if (storageThrows) throw new Error('blocked'); return key === THEME_STORAGE_KEY ? stored ?? null : null; } },
  };
  if (!noMatchMedia) sandbox.matchMedia = (query) => ({ matches: query === '(prefers-color-scheme: dark)' && osDark });
  vm.runInNewContext(THEME_INIT_SCRIPT, sandbox);
  return { dark: classes.has('dark'), colorScheme: root.style.colorScheme };
}

test('one shared storage key and three preferences, system by default', () => {
  assert.equal(THEME_STORAGE_KEY, 'gev-theme');
  assert.deepEqual([...THEME_PREFERENCES], ['light', 'dark', 'system']);
  assert.equal(normalizePreference(undefined), 'system');
  assert.equal(normalizePreference('purple'), 'system');
  assert.equal(normalizePreference('dark'), 'dark');
});

test('resolveTheme: an explicit choice wins over the OS; system follows it', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('garbage', true), 'dark', 'an invalid value behaves like system');
});

test('stored preference: read falls back to system, write reports failure instead of throwing', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readStoredPreference(storage), 'system');
  assert.equal(writeStoredPreference(storage, 'dark'), true);
  assert.equal(store.get('gev-theme'), 'dark');
  assert.equal(readStoredPreference(storage), 'dark');
  assert.equal(writeStoredPreference(storage, 'nonsense'), true);
  assert.equal(store.get('gev-theme'), 'system', 'only valid values are stored');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readStoredPreference(broken), 'system');
  assert.equal(writeStoredPreference(broken, 'dark'), false);
  assert.equal(readStoredPreference(null), 'system');
});

test('applyTheme toggles the dark class and sets color-scheme', () => {
  const classes = new Set();
  const root = { classList: { toggle: (n, f) => (f ? classes.add(n) : classes.delete(n)) }, style: {} };
  applyTheme(root, 'dark');
  assert.deepEqual([classes.has('dark'), root.style.colorScheme], [true, 'dark']);
  applyTheme(root, 'light');
  assert.deepEqual([classes.has('dark'), root.style.colorScheme], [false, 'light']);
});

test('anti-flash script: stored choice beats the OS, system follows the OS, broken or missing APIs fall back safely', () => {
  assert.deepEqual(runInitScript({ stored: 'dark', osDark: false }), { dark: true, colorScheme: 'dark' });
  assert.deepEqual(runInitScript({ stored: 'light', osDark: true }), { dark: false, colorScheme: 'light' });
  assert.deepEqual(runInitScript({ stored: 'system', osDark: true }), { dark: true, colorScheme: 'dark' });
  assert.deepEqual(runInitScript({ stored: undefined, osDark: true }), { dark: true, colorScheme: 'dark' });
  assert.deepEqual(runInitScript({ stored: undefined, osDark: false }), { dark: false, colorScheme: 'light' });
  assert.deepEqual(runInitScript({ stored: 'rubbish', osDark: true }), { dark: true, colorScheme: 'dark' });
  assert.deepEqual(runInitScript({ osDark: true, storageThrows: true }), { dark: true, colorScheme: 'dark' });
  assert.deepEqual(runInitScript({ stored: 'dark', osDark: false, noMatchMedia: true }), { dark: true, colorScheme: 'dark' });
  assert.deepEqual(runInitScript({ osDark: true, noMatchMedia: true }), { dark: false, colorScheme: 'light' });
});

test('the script agrees with resolveTheme for every preference × OS combination', () => {
  for (const stored of ['light', 'dark', 'system']) {
    for (const osDark of [true, false]) {
      assert.equal(runInitScript({ stored, osDark }).dark, resolveTheme(stored, osDark) === 'dark', `${stored}/${osDark}`);
    }
  }
});

test('admin.html, login.html and landing.html embed exactly this script, before any stylesheet or module script', () => {
  for (const file of ['admin.html', 'login.html', 'landing.html']) {
    const html = read(file);
    const head = html.slice(0, html.indexOf('</head>'));
    const at = head.indexOf(`<script>${THEME_INIT_SCRIPT}</script>`);
    assert.ok(at > 0, `${file} embeds THEME_INIT_SCRIPT verbatim`);
    for (const later of ['rel="stylesheet"', 'type="module"']) {
      const index = head.indexOf(later);
      assert.ok(index === -1 || index > at, `${file}: the script comes before ${later}`);
    }
  }
  assert.doesNotMatch(read('login.html'), /data-admin-theme/, 'the hard-coded dark attribute is gone');
  assert.doesNotMatch(read('admin.html'), /data-admin-theme/);
});

test('admin.html and login.html make no third-party request and declare lang="en"', () => {
  for (const file of ['admin.html', 'login.html']) {
    const html = read(file);
    assert.match(html, /<html lang="en">/);
    assert.doesNotMatch(html, /(?:src|href)="(?:https?:)?\/\//, `${file}: no CDN/font host`);
  }
});

const loader = await createJsxLoader();
after(() => loader.close());

test('useTheme outside a ThemeProvider fails loudly; the provider renders its children on the server', async () => {
  const { ThemeProvider, useTheme } = await loader.load('src/lib/theme.jsx');
  const Probe = () => createElement('i', null, useTheme().theme);
  assert.throws(() => renderToStaticMarkup(createElement(Probe)), /ThemeProvider/);
  assert.equal(renderToStaticMarkup(createElement(ThemeProvider, null, createElement(Probe))), '<i>system</i>');
});
