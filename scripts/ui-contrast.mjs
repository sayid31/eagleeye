#!/usr/bin/env node
// scripts/ui-contrast.mjs
/**
 * WCAG contrast gate for the design tokens (src/ui/tokens.css): every pair in scripts/ui-contrast/pairs.mjs must
 * meet its threshold in the light AND dark theme. Prints a table, exits 1 on any failure. `npm run qa:contrast`.
 * Usage: node scripts/ui-contrast.mjs [--quiet] [--css path/to/tokens.css]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePairs } from './ui-contrast/pairs.mjs';
import { parseTokens } from './ui-contrast/tokens.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Evaluate tokens.css in both themes.
 * @param {string} [cssPath]
 * @returns {{rows: ReturnType<typeof evaluatePairs>, failures: ReturnType<typeof evaluatePairs>, outOfGamut: ReturnType<typeof evaluatePairs>}}
 */
export function checkTokenContrast(cssPath = path.join(repoRoot, 'src/ui/tokens.css')) {
  const { light, dark } = parseTokens(fs.readFileSync(cssPath, 'utf8'));
  const rows = [...evaluatePairs(light, 'light'), ...evaluatePairs(dark, 'dark')];
  return { rows, failures: rows.filter((row) => !row.pass), outOfGamut: rows.filter((row) => !row.inGamut && !row.missing) };
}

function formatRow(row) {
  const status = row.pass ? 'ok  ' : 'FAIL';
  const detail = row.missing ? `missing token: ${row.missing}` : `${row.ratio.toFixed(2)}:1 (need ${row.min})  ${row.fgHex} on ${row.bgHex}`;
  return `${status} ${row.theme.padEnd(5)} ${row.kind.padEnd(5)} ${row.fg} on ${row.bg}  ${detail}`;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const cssIndex = args.indexOf('--css');
  const { rows, failures, outOfGamut } = checkTokenContrast(cssIndex >= 0 ? path.resolve(args[cssIndex + 1]) : undefined);
  const shown = args.includes('--quiet') ? failures : rows;
  for (const row of shown) console.log(formatRow(row));
  if (outOfGamut.length) {
    const names = [...new Set(outOfGamut.map((row) => `${row.theme}:${row.fg}`))].join(', ');
    console.log(`note: outside sRGB (clipped by browsers; ratios use the clipped colour): ${names}`);
  }
  console.log(`contrast: ${rows.length - failures.length}/${rows.length} pairs pass${failures.length ? `, ${failures.length} FAIL` : ''}`);
  process.exit(failures.length ? 1 : 0);
}
