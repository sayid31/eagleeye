import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { contrastRatio, parseOklch, resolveColor, toHex } from '../../scripts/ui-contrast/color.mjs';
import { REQUIRED_PAIRS, evaluatePairs } from '../../scripts/ui-contrast/pairs.mjs';
import { parseTokens } from '../../scripts/ui-contrast/tokens.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tokensPath = path.join(repoRoot, 'src/ui/tokens.css');
const tokensCss = fs.readFileSync(tokensPath, 'utf8');
const hex = (text) => toHex(resolveColor(text).linear);

test('oklch converts to the sRGB hex of the Tailwind neutral palette', () => {
  assert.equal(hex('oklch(1 0 0)'), '#ffffff');
  assert.equal(hex('oklch(0.145 0 0)'), '#0a0a0a');
  assert.equal(hex('oklch(0.269 0 0)'), '#262626');
  assert.equal(hex('oklch(0.556 0 0)'), '#737373');
  assert.equal(hex('oklch(0.546 0.245 262.881)'), '#155dfc');
});

test('parseOklch reads percentages, degrees and alpha, and rejects other syntaxes', () => {
  assert.deepEqual(parseOklch('oklch(50% 0.1 30deg / 25%)'), { l: 0.5, c: 0.1, h: 30, alpha: 0.25 });
  assert.equal(parseOklch('oklch(1 0 0)').alpha, 1);
  assert.throws(() => parseOklch('#fff'), /Not an oklch/);
});

test('contrast ratio: black on white is 21, identical colours are 1, alpha blends over the backdrop', () => {
  const white = resolveColor('oklch(1 0 0)').linear;
  const black = resolveColor('oklch(0 0 0)').linear;
  assert.equal(Math.round(contrastRatio(white, black) * 100) / 100, 21);
  assert.equal(contrastRatio(white, white), 1);
  assert.equal(hex('oklch(0 0 0 / 50%)'), '#7f7f7f', '50% black over the default white backdrop is mid grey');
  const blended = resolveColor('oklch(0 0 0 / 50%)', black).linear;
  assert.equal(toHex(blended), '#000000');
});

test('tokens.css has both themes, flat opaque custom properties and nothing Tailwind-specific (landing imports it as plain CSS)', () => {
  const { light, dark } = parseTokens(tokensCss);
  for (const name of ['background', 'foreground', 'primary', 'ring', 'input', 'border', 'success', 'warning', 'info', 'sidebar']) {
    assert.ok(light[name], `light --${name}`);
    assert.ok(dark[name], `dark --${name}`);
  }
  assert.notEqual(light.background, dark.background);
  assert.doesNotMatch(tokensCss.replace(/\/\*[\s\S]*?\*\//g, ''), /@apply|@import|@theme|@layer|oklch\([^)]*\/[^)]*\)/);
});

test('every required pair passes in both themes with the shipped tokens (the npm run qa:contrast gate)', () => {
  const { light, dark } = parseTokens(tokensCss);
  const rows = [...evaluatePairs(light, 'light'), ...evaluatePairs(dark, 'dark')];
  assert.equal(rows.length, REQUIRED_PAIRS.length * 2);
  const failures = rows.filter((row) => !row.pass).map((row) => `${row.theme} ${row.fg} on ${row.bg} ${row.ratio.toFixed(2)}`);
  assert.deepEqual(failures, []);
});

test('form control borders reach 3:1 on the page and on cards in both themes (stock shadcn does not)', () => {
  const { light, dark } = parseTokens(tokensCss);
  for (const [theme, tokens] of [['light', light], ['dark', dark]]) {
    for (const surface of ['background', 'card', 'popover']) {
      const row = evaluatePairs(tokens, theme).find((r) => r.fg === 'input' && r.bg === surface);
      assert.ok(row.ratio >= 3, `${theme} input on ${surface}: ${row.ratio}`);
    }
  }
});

test('a token that drops below its threshold is reported as a failure, and a missing token is not a pass', () => {
  const { light } = parseTokens(tokensCss);
  const weak = evaluatePairs({ ...light, 'muted-foreground': 'oklch(0.8 0 0)' }, 'light');
  assert.ok(weak.some((row) => row.fg === 'muted-foreground' && !row.pass));
  const { link, ...withoutLink } = light;
  assert.ok(link);
  const missing = evaluatePairs(withoutLink, 'light').filter((row) => row.missing);
  assert.ok(missing.length > 0 && missing.every((row) => !row.pass && row.missing === 'link'));
});

test('the CLI exits 0 for the shipped tokens and 1 when a pair fails', () => {
  const script = path.join(repoRoot, 'scripts/ui-contrast.mjs');
  const ok = spawnSync(process.execPath, [script, '--quiet'], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /contrast: \d+\/\d+ pairs pass/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-contrast-'));
  try {
    const bad = path.join(dir, 'tokens.css');
    fs.writeFileSync(bad, tokensCss.replace('--muted-foreground: oklch(0.5 0 0);', '--muted-foreground: oklch(0.8 0 0);'));
    const failed = spawnSync(process.execPath, [script, '--css', bad], { encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.match(failed.stdout, /FAIL light text {2}muted-foreground on background/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
