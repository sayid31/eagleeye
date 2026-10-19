import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const tokens = read('tokens.css');
const base = read('base.css');
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const hud = readFileSync(new URL('../hud.js', import.meta.url), 'utf8');

/** Read one `--name: #rrggbb` token as [r, g, b]. */
function hex(name) {
  const m = tokens.match(new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i'));
  assert.ok(m, `${name} must be a 6-digit hex token`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

/** WCAG relative luminance. */
function lum([r, g, b]) {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('body text, muted text and the accent clear WCAG AA (4.5:1) on every surface', () => {
  for (const surface of ['--ee-bg', '--ee-surface', '--ee-surface-2']) {
    for (const fg of ['--ee-text', '--ee-text-muted', '--ee-text-dim', '--ee-accent']) {
      const ratio = contrast(hex(fg), hex(surface));
      assert.ok(ratio >= 4.5, `${fg} on ${surface} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('text on the accent fill (primary buttons, mic) clears AA', () => {
  assert.ok(contrast(hex('--ee-on-accent'), hex('--ee-accent')) >= 4.5);
});

test('status colors are readable on the surface', () => {
  for (const status of ['--ee-ok', '--ee-warn', '--ee-bad']) {
    assert.ok(contrast(hex(status), hex('--ee-surface')) >= 4.5, status);
  }
});

test('legacy tokens still resolve, so panels that were not redesigned follow the theme', () => {
  for (const legacy of ['--accent', '--accent-dim', '--text-primary', '--text-secondary', '--glass-bg', '--glass-border', '--panel-radius']) {
    assert.match(tokens, new RegExp(`${legacy}:\\s*[^;]+;`), `${legacy} must stay defined`);
  }
  assert.match(tokens, /--accent-glow:\s*transparent;/, 'the glow token is neutralised, not removed');
});

test('keyboard focus stays visible and cannot be cancelled by id-level outline:none rules', () => {
  assert.match(base, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ee-accent\) !important/);
});

test('numbers and coordinates use the monospace stack with tabular digits', () => {
  assert.match(tokens, /--ee-font-mono:[^;]*'JetBrains Mono'/);
  assert.match(base, /font-variant-numeric:\s*tabular-nums/);
});

test('the theme loads after style.css so it can override it', () => {
  const main = html.indexOf('href="/style.css"');
  const theme = html.indexOf('href="/src/theme/theme.css"');
  assert.ok(main > -1 && theme > main, 'theme.css must come after style.css');
});

test('the HUD no longer prints a classification banner', () => {
  assert.doesNotMatch(hud, /TOP SECRET|NOFORN/);
});
