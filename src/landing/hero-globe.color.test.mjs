import test from 'node:test';
import assert from 'node:assert/strict';
import { luminance, mixRgb, parseRgb, readPalette, resolveCssColor, withAlpha } from './hero-globe.color.js';

test('parseRgb reads comma, space and slash-alpha rgb() and color(srgb) forms', () => {
  assert.deepEqual(parseRgb('rgb(10, 20, 30)'), [10, 20, 30]);
  assert.deepEqual(parseRgb('rgba(10,20,30,0.5)'), [10, 20, 30]);
  assert.deepEqual(parseRgb('rgb(10 20 30 / 40%)'), [10, 20, 30]);
  assert.deepEqual(parseRgb(' color(srgb 1 0.5 0) '), [255, 128, 0]);
});

test('parseRgb returns null for colours it cannot read as sRGB (oklch, names, junk)', () => {
  for (const text of ['oklch(0.5 0.1 262)', 'red', '', '#fff']) assert.equal(parseRgb(text), null, text);
});

test('withAlpha formats rgba() and clamps alpha to 0..1', () => {
  assert.equal(withAlpha([1, 2, 3], 0.5), 'rgba(1, 2, 3, 0.5)');
  assert.equal(withAlpha([1, 2, 3], 7), 'rgba(1, 2, 3, 1)');
  assert.equal(withAlpha([1, 2, 3], -1), 'rgba(1, 2, 3, 0)');
});

test('mixRgb interpolates per channel and luminance tells light ink from dark ink', () => {
  assert.deepEqual(mixRgb([0, 100, 200], [100, 200, 0], 0.5), [50, 150, 100]);
  assert.deepEqual(mixRgb([0, 0, 0], [255, 255, 255], 0), [0, 0, 0]);
  assert.ok(luminance([250, 250, 250]) > 0.5);
  assert.ok(luminance([20, 20, 20]) < 0.5);
});

/** Probe double: paints the requested fill into one pixel, treating anything not starting with "good" as unparseable. */
function fakeProbe(paint) {
  let style = '';
  let pixel = [0, 0, 0, 0];
  return {
    clearRect() { pixel = [0, 0, 0, 0]; },
    set fillStyle(value) { if (value.startsWith('rgb(1, 2, 3)') || value.startsWith('good')) style = value; },
    fillRect() { pixel = paint(style); },
    getImageData: () => ({ data: pixel }),
  };
}

test('resolveCssColor returns the painted pixel, and the fallback when the browser rejects the colour', () => {
  const probe = fakeProbe((style) => (style.startsWith('good') ? [9, 8, 7, 255] : [1, 2, 3, 255]));
  assert.deepEqual(resolveCssColor(probe, 'good oklch', [5, 5, 5]), [9, 8, 7]);
  assert.deepEqual(resolveCssColor(probe, 'nonsense', [5, 5, 5]), [5, 5, 5]);
  assert.deepEqual(resolveCssColor(fakeProbe(() => [0, 0, 0, 0]), 'good transparent', [5, 5, 5]), [5, 5, 5]);
});

test('readPalette resolves --foreground and --primary; accent is the primary pulled toward the ink', () => {
  const probe = fakeProbe((style) => (style.includes('fg') ? [200, 200, 200, 255] : [100, 120, 240, 255]));
  const style = { getPropertyValue: (name) => (name === '--foreground' ? 'good fg' : 'good primary') };
  const palette = readPalette(probe, style);
  assert.deepEqual(palette.ink, [200, 200, 200]);
  assert.deepEqual(palette.accent, mixRgb([100, 120, 240], [200, 200, 200], 0.35));
});
