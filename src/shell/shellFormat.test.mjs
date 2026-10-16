import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDms, formatMgrs, formatAltitude, formatUtcClock, healthLabels } from './shellFormat.js';

test('formatDms matches the mockup style and hemispheres', () => {
  assert.equal(formatDms(-6.175, 'lat'), '6°10′30″S');
  assert.equal(formatDms(106.8275, 'lon'), '106°49′39″E');
  assert.equal(formatDms(-0.5, 'lon'), '0°30′0″W');
});

test('formatDms carries a rounded 60 seconds instead of printing it', () => {
  assert.equal(formatDms(10 + 59 / 60 + 59.9 / 3600, 'lat'), '11°0′0″N');
});

test('formatMgrs spaces the grid reference', () => {
  assert.equal(formatMgrs('48MYU04111311'), '48M YU 0411 1311');
  assert.equal(formatMgrs('garbage'), 'garbage');
  assert.equal(formatMgrs(''), '---');
});

test('formatAltitude groups thousands with a dot', () => {
  assert.equal(formatAltitude(1245.4), '1.245 m');
  assert.equal(formatAltitude(-15), '-15 m');
  assert.equal(formatAltitude(NaN), '—');
});

test('formatUtcClock zero-pads', () => {
  assert.equal(formatUtcClock(new Date(Date.UTC(2026, 0, 1, 6, 2, 8))), 'UTC 06:02:08');
});

test('healthLabels omits the degraded chip text at zero', () => {
  assert.deepEqual(healthLabels({ live: 9, degraded: 1 }), { live: '9 sumber live', degraded: '1 terganggu' });
  assert.equal(healthLabels({ live: 2, degraded: 0 }).degraded, '');
});
