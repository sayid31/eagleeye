import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inspectorMarkup } from './cameraInspectorMarkup.js';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const controller = readFileSync(new URL('./cameraInspector.js', import.meta.url), 'utf8');

test('buttons proxy to legacy controls that exist in index.html', () => {
  for (const id of ['cctv-focus-btn', 'cctv-adjust-btn', 'cctv-source-badge']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(controller, /click\('cctv-focus-btn'\)/);
  assert.match(controller, /click\('cctv-adjust-btn'\)/);
});

test('markup carries the mockup labels and accessible names', () => {
  const markup = inspectorMarkup();
  for (const text of ['Pusatkan di peta', 'Kalibrasi posisi', 'Kamera terdekat']) assert.match(markup, new RegExp(text));
  assert.match(markup, /id="cam-inspector-close"[^>]*aria-label=/);
  assert.match(markup, /id="cam-inspector-calibrate"[^>]*aria-pressed=/);
});

test('third-party camera text is written with textContent, never innerHTML', () => {
  assert.doesNotMatch(controller, /innerHTML/);
});

test('the legacy UNOFFICIAL SOURCE badge text is still produced by the panel mixin', () => {
  const mixin = readFileSync(new URL('../cctvPanelMixin.js', import.meta.url), 'utf8');
  assert.match(mixin, /⚠ UNOFFICIAL SOURCE/);
});
