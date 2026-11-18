import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The React surfaces. src/components/ui is the vendored shadcn set (its strings already come from UI_COPY) and the
// hidden UI kit is a developer catalogue of sample data, so neither is scanned.
const SCANNED = ['admin', 'login', 'components/app', 'lib'];
const EXEMPT = new Set(['admin/dev/UiKitPage.jsx']);

function* jsxFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* jsxFiles(full);
    else if (name.endsWith('.jsx') && !name.endsWith('.test.jsx')) yield full;
  }
}

const sources = SCANNED.flatMap((dir) => [...jsxFiles(path.join(srcRoot, dir))])
  .map((file) => ({ rel: path.relative(srcRoot, file), code: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') }))
  .filter(({ rel }) => !EXEMPT.has(rel));

const JSX_TEXT = />([^<>{}=;()]*[A-Za-z]{3,}[^<>{}=;()]*)</g;
const TEXT_ATTRIBUTE = /\b(?:aria-label|aria-description|title|placeholder|alt|label|description)=(?:"[^"{}]*[A-Za-z]{3,}[^"{}]*"|'[^']*[A-Za-z]{3,}[^']*')/g;
const RAW_ERROR_OUTPUT = /\{[^{}]*\b(?:error|err|e|failure|payload)\.(?:message|code|status)\b[^{}]*\}/g;

test('the scan finds the React surfaces (guards against an empty glob passing silently)', () => {
  assert.ok(sources.length > 80, `only ${sources.length} files scanned`);
});

test('no JSX text node or text attribute is a literal: user-visible strings live in src/copy/en', () => {
  const offenders = [];
  for (const { rel, code } of sources) {
    for (const match of code.matchAll(JSX_TEXT)) {
      const text = match[1].trim();
      // `a ? b : c` / `x => y` fragments between a `>` operator and a `<` comparison are code, not text.
      if (text && !/[?:]|=>/.test(text)) offenders.push(`${rel}: text "${text}"`);
    }
    for (const match of code.matchAll(TEXT_ATTRIBUTE)) offenders.push(`${rel}: ${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test('the UI never prints a raw error message, code or HTTP status: errors go through errorMessage()', () => {
  const offenders = [];
  for (const { rel, code } of sources) {
    // console.warn diagnostics (developer-facing, never rendered) may carry the raw message.
    const rendered = code.split('\n').filter((line) => !/\bconsole\./.test(line)).join('\n');
    for (const match of rendered.matchAll(RAW_ERROR_OUTPUT)) offenders.push(`${rel}: ${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test('every API key the server offers has Indonesian name + purpose (the server "unlocks" text is English and never shown)', async () => {
  const { KEY_SETUP_KEYS } = await import('../../keySetupCore.mjs');
  const { PROVIDER_COPY, KEY_FIELD_LABELS } = await import('./config.js');
  for (const key of KEY_SETUP_KEYS) {
    const copy = PROVIDER_COPY[key.id];
    assert.ok(copy?.name && copy.purpose, `${key.id} has no PROVIDER_COPY entry`);
    assert.notEqual(copy.purpose, key.unlocks, key.id);
    assert.doesNotMatch(copy.purpose, /\b(the|and|with|more|live)\b/i, `${key.id}: purpose reads as English`);
  }
  for (const envVar of KEY_SETUP_KEYS.filter((key) => key.envVars.length > 1).flatMap((key) => key.envVars)) {
    assert.ok(KEY_FIELD_LABELS[envVar], `${envVar} has no field label`);
  }
});
