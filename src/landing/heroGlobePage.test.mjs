import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const html = readFileSync(here('../../landing.html'), 'utf8');
const heroCss = readFileSync(here('./landing.hero.css'), 'utf8');
const mainJs = readFileSync(here('./main.js'), 'utf8');
const globeFiles = readdirSync(here('.')).filter((name) => name.startsWith('hero-globe') && name.endsWith('.js'));
const hero = html.slice(html.indexOf('<section class="ld-hero"'), html.indexOf('</section>'));

test('the hero visual is one decorative canvas: aria-hidden, no role=img figure, no text inside', () => {
  const canvases = [...hero.matchAll(/<canvas\b[^>]*>/g)];
  assert.equal(canvases.length, 1);
  assert.match(canvases[0][0], /aria-hidden="true"/);
  assert.match(canvases[0][0], /data-hero-globe/);
  assert.doesNotMatch(hero, /<figure|<svg|role="img"/, 'the old illustration is gone');
  assert.match(hero, /<h1 id="hero-title">/, 'the headline still carries the hero meaning');
});

test('the legend card and every class only it or the old globe used are gone from markup and CSS', () => {
  assert.doesNotMatch(html, /ld-visual|ld-dot|ld-v-|Layer data|Pesawat<b>/);
  assert.doesNotMatch(heroCss, /ld-visual|ld-dot|ld-v-|orbit|\.ld-v/);
  assert.doesNotMatch(readFileSync(here('./landing.sections.css'), 'utf8') + readFileSync(here('./landing.base.css'), 'utf8'), /ld-visual|ld-dot|ld-v-/);
});

test('the canvas box is frameless and reserves its space: aspect-ratio, no border or card background', () => {
  const box = /\.ld-earth \{([^}]*)\}/.exec(heroCss)[1];
  assert.match(box, /aspect-ratio:\s*1/);
  assert.doesNotMatch(box, /border|background|box-shadow/);
  assert.match(heroCss, /\.ld-earth__canvas \{[^}]*mask-image:\s*radial-gradient/, 'soft vignette into the page background');
  assert.match(heroCss, /\.ld-hero \{[^}]*overflow:\s*clip/, 'the bleeding globe never causes horizontal scroll');
});

test('main.js starts the globe on the canvas marked data-hero-globe', () => {
  assert.match(mainJs, /import \{ mountHeroGlobe \} from '\.\/hero-globe\.js'/);
  assert.match(mainJs, /querySelector\('\[data-hero-globe\]'\)/);
  assert.match(mainJs, /mountHeroGlobe\(globe\)/);
});

test('the globe code is dependency-free: no network, no eval, only same-folder and theme imports', () => {
  assert.ok(globeFiles.length >= 8);
  for (const name of globeFiles) {
    const source = readFileSync(here(`./${name}`), 'utf8');
    assert.doesNotMatch(source, /\beval\s*\(|new Function|fetch\(|XMLHttpRequest|https?:\/\//, name);
    for (const [, spec] of source.matchAll(/^import .* from '([^']+)'/gm)) assert.match(spec, /^\.\/hero-globe\.|^\.\.\/lib\/themeCore\.js$/, `${name} imports ${spec}`);
  }
});

test('size: the generated land mask is <= 15 KB and the whole globe (JS + data) adds <= 30 KB gzip', () => {
  assert.ok(readFileSync(here('./hero-globe.landData.js')).length <= 15 * 1024);
  const gz = globeFiles.reduce((sum, name) => sum + gzipSync(readFileSync(here(`./${name}`))).length, 0);
  assert.ok(gz <= 30 * 1024, `${gz} B gzip`);
});
