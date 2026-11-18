import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const html = readFileSync(here('../../landing.html'), 'utf8');
const files = readdirSync(here('.'));
const cssFiles = files.filter((name) => name.endsWith('.css'));
const sourceFiles = files.filter((name) => name.endsWith('.js') && !name.endsWith('.test.mjs'));
const gz = (names) => names.reduce((sum, name) => sum + gzipSync(readFileSync(here(name))).length, 0);

/** Plan 05: landing <= 100 KB (gzip). Page CSS/JS plus the shared tokens, fonts rules, theme core and auth client it imports. */
const BUDGET_BYTES = 100 * 1024;

test('landing HTML + CSS + JS stay under the 100 KB gzip budget (excluding font files)', () => {
  const shared = ['../ui/tokens.css', '../ui/fonts.css', '../lib/themeCore.js', '../auth/authClientApi.js'];
  const total = gz(cssFiles) + gz(sourceFiles) + gz(shared) + gzipSync(html).length;
  assert.ok(total < BUDGET_BYTES, `${total} B gzip`);
  assert.ok(total < BUDGET_BYTES / 2, `well under budget, got ${total} B`);
});

test('landing CSS is plain CSS on the shared tokens: no Tailwind signature, no hex colours, no !important, no HUD leftovers', () => {
  for (const name of cssFiles) {
    const css = readFileSync(here(name), 'utf8');
    assert.doesNotMatch(css, /tailwindcss|@apply|@theme|@tailwind|--tw-/i, name);
    assert.doesNotMatch(css, /!important/, name);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, `${name}: hex colour`);
    assert.doesNotMatch(css, /text-shadow|letter-spacing:\s*0?\.[1-9]|text-transform:\s*uppercase/i, `${name}: HUD styling`);
  }
  assert.doesNotMatch(html, /ld-hud|ld-glow|ld-globe__/);
});

test('landmarks are unique: one header, one main, one footer, and every nav/region carries a distinct name', () => {
  for (const tag of ['header', 'main', 'footer']) assert.equal((html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length, 1, tag);
  const names = [...html.matchAll(/<(?:nav|[a-z]+ [^>]*role="region")[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(names).size, names.length, names.join(' | '));
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, 'one h1');
});

test('every icon class used in the markup has a mask definition in landing.icons.css', () => {
  const icons = readFileSync(here('./landing.icons.css'), 'utf8') + readFileSync(here('./landing.header.css'), 'utf8');
  const used = new Set([...html.matchAll(/\bld-i-([a-z-]+)\b/g)].map((match) => match[1]));
  assert.ok(used.size >= 15);
  for (const name of used) assert.match(icons, new RegExp(`\\.ld-i-${name}\\b`), name);
});
