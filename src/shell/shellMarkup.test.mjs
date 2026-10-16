import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RAIL_ITEMS, railMarkup, statusBarMarkup, topBarMarkup } from './shellMarkup.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

test('every rail target resolves to an element that already exists in index.html', () => {
  for (const item of RAIL_ITEMS) {
    const id = /#([\w-]+)$/.exec(item.target)?.[1];
    const collapse = /data-collapse-target="([\w-]+)"/.exec(item.target)?.[1];
    if (collapse) assert.match(html, new RegExp(`class="panel-collapse-btn[^"]*" data-collapse-target="${collapse}"`), item.id);
    else assert.match(html, new RegExp(`id="${id}"`), item.id);
  }
});

test('rail buttons are labelled for assistive tech', () => {
  const markup = railMarkup();
  for (const item of RAIL_ITEMS) assert.match(markup, new RegExp(`aria-label="${item.label}"`));
});

test('top bar has search, a live-region health chip and a UTC clock', () => {
  const markup = topBarMarkup();
  assert.match(markup, /id="shell-search-input"[^>]*aria-label=/);
  assert.match(markup, /id="shell-health"[^>]*role="status"/);
  assert.match(markup, /id="shell-clock"/);
});

test('search is for locations only and the rail reaches every collapsed panel', () => {
  assert.match(topBarMarkup(), /placeholder="Cari lokasi"/);
  assert.doesNotMatch(topBarMarkup(), /kamera|perintah/i);
  const ids = RAIL_ITEMS.map((item) => item.id);
  for (const id of ['layers', 'camera', 'scenes', 'display', 'context']) assert.ok(ids.includes(id), id);
});

test('status bar carries coordinates, MGRS and altitude, and never the attribution', () => {
  const markup = statusBarMarkup();
  for (const id of ['shell-coords', 'shell-mgrs', 'shell-alt']) assert.match(markup, new RegExp(`id="${id}"`));
  assert.doesNotMatch(markup, /cesium-credits/);
});

test('the shell is mounted from main.js after the layer panel is built', () => {
  assert.match(main, /initShell\(\{ viewer, dataManager \}\)/);
  assert.ok(main.indexOf("buildTogglePanel(document.getElementById('data-toggles'))") < main.indexOf('initShell('));
});
