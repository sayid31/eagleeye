import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectorMarkup } from './cameraInspectorMarkup.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const controller = readFileSync(new URL('./cameraInspector.js', import.meta.url), 'utf8');

test('the legacy controls the search falls back to still exist in index.html', () => {
  for (const id of ['cctv-focus-btn', 'cctv-adjust-btn', 'cctv-source-badge', 'cctv-camera-trigger']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test('the detail block (name, badges, rows, nearby list) is gone', () => {
  const markup = inspectorMarkup();
  for (const id of ['cam-inspector-body', 'cam-inspector-name', 'cam-inspector-rows', 'cam-inspector-nearby']) {
    assert.doesNotMatch(markup, new RegExp(id), id);
  }
});

test('third-party camera text is written with textContent, never innerHTML', () => {
  assert.doesNotMatch(controller, /innerHTML/);
});

test('the legacy UNOFFICIAL SOURCE badge text is still produced by the panel mixin', () => {
  const mixin = readFileSync(new URL('../cctvPanelMixin.js', import.meta.url), 'utf8');
  assert.match(mixin, /⚠ UNOFFICIAL SOURCE/);
});

test('the camera search sits in the inspector and picks cameras through selectCamera', () => {
  const markup = inspectorMarkup();
  assert.match(markup, /id="cam-search-input"[^>]*aria-label="Cari kamera CCTV"/);
  assert.match(markup, /id="cam-search-results"/);
  assert.match(markup, /id="cam-inspector-advanced"[^>]*>Cari manual</);
  assert.match(controller, /searchCameras/);
  assert.match(controller, /callLayerMethod\('cctv', 'selectCamera'/);
});
