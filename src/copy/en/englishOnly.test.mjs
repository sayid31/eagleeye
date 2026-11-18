import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findIndonesianWords } from './indonesianVocabulary.mjs';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Every surface whose text a person reads. Voice persona / prompt rules (src/voice) are sent to the model and keep their
// own language on purpose; external data (CCTV names, place names) is not UI copy either, so neither is scanned.
const SCANNED = ['admin', 'login', 'components', 'lib', 'landing', 'copy/en'];
const EXEMPT = new Set(['copy/en/indonesianVocabulary.mjs', 'copy/en/glossary.js']);

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(jsx?|mjs)$/.test(name) && !/\.test\.(jsx?|mjs)$/.test(name)) yield full;
  }
}

const QUOTED = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const JSX_TEXT = />([^<>{}=;()]*[A-Za-z]{3,}[^<>{}=;()]*)</g;

/** String-literal contents and JSX text nodes of a source file, comments removed. */
function uiText(code) {
  const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  return [...[...bare.matchAll(QUOTED)].map((match) => match[2]), ...[...bare.matchAll(JSX_TEXT)].map((match) => match[1])];
}

const sources = SCANNED.flatMap((dir) => [...sourceFiles(path.join(srcRoot, dir))])
  .map((file) => ({ rel: path.relative(srcRoot, file).split(path.sep).join('/'), code: readFileSync(file, 'utf8') }))
  .filter(({ rel }) => !EXEMPT.has(rel));

test('the English-only scan finds the UI sources (guards against an empty glob passing silently)', () => {
  assert.ok(sources.length > 150, `only ${sources.length} files scanned`);
  assert.ok(sources.some(({ rel }) => rel.endsWith('.jsx')));
});

test('no UI source (copy modules, .jsx, view modules) holds an Indonesian word in a string or text node', () => {
  const offenders = [];
  for (const { rel, code } of sources) {
    for (const text of uiText(code)) {
      const words = findIndonesianWords(text);
      if (words.length) offenders.push(`${rel}: "${text.slice(0, 80)}" (${[...new Set(words)].join(', ')})`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the shipped HTML shells are English: lang="en" and an English title', () => {
  for (const name of ['index.html', 'landing.html', 'login.html', 'admin.html']) {
    const html = readFileSync(path.join(srcRoot, '..', name), 'utf8');
    assert.match(html, /<html lang="en">/, name);
    assert.deepEqual(findIndonesianWords(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''), [], name);
  }
});
