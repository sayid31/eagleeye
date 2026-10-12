import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSyntheticCctvSvg } from './cctvSyntheticFrame.mjs';

test('synthetic frame is a deterministic SVG per camera', () => {
  const a = buildSyntheticCctvSvg({ cameraId: 'cam-1', label: 'Main St', city: 'Austin', status: 'live' });
  assert.match(a, /^<svg[\s\S]*<\/svg>\s*$/);
  assert.equal(a, buildSyntheticCctvSvg({ cameraId: 'cam-1', label: 'Main St', city: 'Austin', status: 'live' }));
  assert.notEqual(a, buildSyntheticCctvSvg({ cameraId: 'cam-2', label: 'Main St', city: 'Austin', status: 'live' }));
});

test('synthetic frame escapes markup in the camera label', () => {
  const svg = buildSyntheticCctvSvg({ cameraId: 'x', label: '<script>alert(1)</script> & co', city: 'c', status: 's' });
  assert.equal(svg.includes('<script>'), false);
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(svg.includes('&amp; co'));
});
