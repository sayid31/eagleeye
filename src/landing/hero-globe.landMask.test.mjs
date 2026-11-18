import test from 'node:test';
import assert from 'node:assert/strict';
import { LAND_MASK } from './hero-globe.landData.js';
import { decodeLandMask, isLand } from './hero-globe.landMask.js';
import { splitDots } from './hero-globe.dots.js';

test('decodeLandMask expands alternating water/land runs row by row', () => {
  // 4x2: row 0 = water 1, land 2, water 1; row 1 = water 0, land 4
  const mask = decodeLandMask({ width: 4, height: 2, runs: '01' + '02' + '01' + '00' + '04' });
  assert.deepEqual([...mask.cells], [0, 1, 1, 0, 1, 1, 1, 1]);
});

test('decodeLandMask rejects truncated or overlong data instead of returning a partial globe', () => {
  assert.throws(() => decodeLandMask({ width: 4, height: 2, runs: '04' }), /truncated in row 1/);
  assert.throws(() => decodeLandMask({ width: 4, height: 1, runs: '09' }), /out of range in row 0/);
  assert.throws(() => decodeLandMask({ width: 4, height: 1, runs: '!!' }), /out of range/);
});

test('isLand maps lat/lon to cells and clamps the edges', () => {
  const mask = decodeLandMask({ width: 4, height: 2, runs: '01' + '02' + '01' + '00' + '04' });
  assert.equal(isLand(mask, 45, 0), true);
  assert.equal(isLand(mask, 45, -170), false);
  assert.equal(isLand(mask, -45, -170), true);
  assert.equal(isLand(mask, 90, 180), false, 'upper-right corner clamps to the last column of row 0');
  assert.equal(isLand(mask, -90, -180), true, 'lower-left corner clamps to the first cell of row 1');
});

test('the bundled Natural Earth mask puts known places on land and known oceans on water', () => {
  const mask = decodeLandMask(LAND_MASK);
  const land = { Jakarta: [-6.2, 106.85], Sahara: [23, 10], Amazon: [-5, -60], Siberia: [62, 100], Antarctica: [-80, 0], Greenland: [75, -40], Sydney: [-33.9, 151.2] };
  const water = { 'mid Pacific': [0, -150], 'mid Atlantic': [0, -30], 'Indian Ocean': [-30, 80], 'Arctic Ocean': [85, 0], 'Java Sea': [-5, 110] };
  for (const [name, [lat, lon]] of Object.entries(land)) assert.equal(isLand(mask, lat, lon), true, name);
  for (const [name, [lat, lon]] of Object.entries(water)) assert.equal(isLand(mask, lat, lon), false, name);
});

test('the bundled mask is 720x360, about 29% land by cells (about 20% by sphere area is not asserted; Antarctica inflates the grid)', () => {
  const mask = decodeLandMask(LAND_MASK);
  assert.equal(mask.cells.length, 720 * 360);
  const share = mask.cells.reduce((sum, cell) => sum + cell, 0) / mask.cells.length;
  assert.ok(share > 0.22 && share < 0.34, `land share ${share}`);
});

test('splitDots: land and ocean partition the lattice, every dot is a unit vector', () => {
  const mask = decodeLandMask(LAND_MASK);
  const { land, ocean } = splitDots(mask, 3);
  assert.ok(land.length > 0 && ocean.length > land.length, 'more ocean than land');
  for (const buffer of [land, ocean]) {
    assert.equal(buffer.length % 3, 0);
    for (let i = 0; i < buffer.length; i += 3) assert.ok(Math.abs(Math.hypot(buffer[i], buffer[i + 1], buffer[i + 2]) - 1) < 1e-5);
  }
  const share = land.length / (land.length + ocean.length);
  assert.ok(share > 0.2 && share < 0.4, `dot land share ${share}`);
});
