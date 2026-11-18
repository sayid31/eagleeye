import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { skipOnReactPages } from '../admin/adminRoute.mjs';

const html = readFileSync(fileURLToPath(new URL('../../landing.html', import.meta.url)), 'utf8');
const CSS_FILES = ['base', 'icons', 'header', 'hero', 'sections'];
const css = CSS_FILES.map((name) => readFileSync(fileURLToPath(new URL(`./landing.${name}.css`, import.meta.url)), 'utf8')).join('\n');

test('landing.html loads nothing from another origin (no CDN, no web fonts)', () => {
  const urls = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(urls.length > 0);
  const external = urls.filter((url) => /^(?:https?:)?\/\//i.test(url));
  assert.deepEqual(external, []);
  assert.doesNotMatch(css, /@import|url\(\s*['"]?(?:https?:)?\/\//i);
});

test('landing.html works without JS: the CTA slots default to "Masuk" → /login', () => {
  const slots = [...html.matchAll(/data-cta-slot="(\w+)"[^>]*>\s*<a [^>]*href="([^"]+)"[^>]*>([^<]+)</g)];
  assert.deepEqual(slots.map(([, slot, href, label]) => [slot, href, label]), [['nav', '/login', 'Sign in'], ['hero', '/login', 'Sign in']]);
  assert.match(html, /<p class="ld-muted" data-access-contact hidden>/, 'request-access contact is hidden until configured');
});

test('landing.html states the product boundary and the required page metadata', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>[^<]*EagleEye View[^<]*<\/title>/);
  assert.match(html, /<meta name="description" content="[^"]{50,}"/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/logo.svg"/);
  assert.match(html, /Not a people-tracking tool/);
  assert.match(html, /search by a person's name/);
  assert.match(html, /face recognition/);
  assert.doesNotMatch(html, />\s*Daftar\s*</, 'no sign-up button');
});

test('every in-page anchor points at an element that exists', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
  assert.ok(anchors.length >= 6);
  for (const anchor of anchors) assert.ok(ids.has(anchor), `#${anchor}`);
});

test('motion (transition, smooth scroll) runs only under prefers-reduced-motion: no-preference', () => {
  const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/g, '');
  assert.match(css, /prefers-reduced-motion: no-preference[\s\S]*transition:/);
  assert.doesNotMatch(outside, /animation:|transition:|scroll-behavior:/);
});

test('the Cesium html injection is skipped for landing.html like the other globe-less pages', () => {
  const tags = [{ tag: 'script' }];
  const wrapped = skipOnReactPages({ name: 'cesium', transformIndexHtml: () => tags });
  assert.equal(wrapped.transformIndexHtml('', { filename: '/repo/landing.html' }), undefined);
  assert.equal(wrapped.transformIndexHtml('', { path: '/landing.html' }), undefined);
  assert.equal(wrapped.transformIndexHtml('', { filename: '/repo/index.html' }), tags);
});
