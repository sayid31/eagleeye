import test from 'node:test';
import assert from 'node:assert/strict';
import { angleBetween, arcPoint, latLonToVec, latticePoints, project, rotateView } from './hero-globe.math.js';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
const length = (v) => Math.hypot(v[0], v[1], v[2]);

test('latLonToVec: lat/lon 0,0 faces the viewer, the north pole is +y, 90E is +x, all unit length', () => {
  const [x, y, z] = latLonToVec(0, 0);
  assert.deepEqual([x, y, z].map((n) => Math.round(n)), [0, 0, 1]);
  assert.deepEqual(latLonToVec(90, 0).map((n) => Math.round(n)), [0, 1, 0]);
  assert.deepEqual(latLonToVec(0, 90).map((n) => Math.round(n)), [1, 0, 0]);
  for (const [lat, lon] of [[-33.9, 151.2], [51.5, -0.1], [-6.2, 106.85]]) near(length(latLonToVec(lat, lon)), 1, `${lat},${lon}`);
});

test('rotateView: a positive yaw moves features to the right, a quarter turn puts lon -90 in front, tilt brings the pole forward', () => {
  const east = rotateView(latLonToVec(0, 10), 0.1, 0);
  assert.ok(east[0] > latLonToVec(0, 10)[0], 'feature moved right');
  const front = rotateView(latLonToVec(0, -90), Math.PI / 2, 0);
  near(front[2], 1, 'lon -90 faces the viewer after a +90 degree yaw');
  const pole = rotateView([0, 1, 0], 0, 0.5);
  near(pole[2], Math.sin(0.5), 'pole depth');
  near(length(rotateView(latLonToVec(20, 30), 1.1, 0.4)), 1, 'rotation keeps unit length');
});

test('rotateView writes into the provided output array (no allocation in the frame loop)', () => {
  const out = [0, 0, 0];
  assert.equal(rotateView([1, 0, 0], 0, 0, out), out);
  assert.deepEqual(out, [1, 0, 0]);
});

test('project: orthographic, y is flipped to canvas space and the depth axis is dropped', () => {
  assert.deepEqual(project([0, 0, 1], 100, 100, 50), [100, 100]);
  assert.deepEqual(project([1, 0, 0], 100, 100, 50), [150, 100]);
  assert.deepEqual(project([0, 1, 0], 100, 100, 50), [100, 50]);
});

test('arcPoint: starts and ends on the endpoints, the midpoint is on the great circle and lifted by `lift`', () => {
  const a = latLonToVec(0, 0);
  const b = latLonToVec(0, 90);
  assert.deepEqual(arcPoint(a, b, 0).map((n) => Math.round(n * 1e6) / 1e6), a.map((n) => Math.round(n * 1e6) / 1e6));
  assert.deepEqual(arcPoint(a, b, 1, 0.3).map((n) => Math.round(n * 1e6) / 1e6), b.map((n) => Math.round(n * 1e6) / 1e6));
  const flat = arcPoint(a, b, 0.5);
  near(length(flat), 1, 'on the sphere without lift');
  near(flat[0], Math.SQRT1_2, 'midpoint x');
  near(length(arcPoint(a, b, 0.5, 0.2)), 1.2, 'lifted by 20%');
});

test('arcPoint handles identical endpoints without NaN', () => {
  const a = latLonToVec(10, 10);
  const same = arcPoint(a, a, 0.5, 0.1);
  assert.ok(same.every(Number.isFinite));
  assert.ok(angleBetween(a, a) < 1e-6, 'zero angle');
  near(angleBetween(latLonToVec(0, 0), latLonToVec(0, 90)), Math.PI / 2, 'quarter circle');
});

test('latticePoints: staggered rings, near-uniform density, every point inside lat/lon bounds', () => {
  const points = latticePoints(2);
  const expected = (4 * Math.PI) / (((2 * Math.PI) / 180) ** 2);
  assert.ok(points.length > expected * 0.95 && points.length < expected * 1.05, `${points.length} vs ~${Math.round(expected)}`);
  for (const [lat, lon] of points) assert.ok(lat > -90 && lat < 90 && lon >= -180 && lon < 180);
  const rows = new Map();
  for (const [lat, lon] of points) rows.set(lat, [...(rows.get(lat) ?? []), lon]);
  assert.equal(rows.size, 90);
  const equatorStep = 360 / [...rows.entries()].sort((x, y) => Math.abs(x[0]) - Math.abs(y[0]))[0][1].length;
  assert.ok(Math.abs(equatorStep - 2) < 0.1, `equator step ${equatorStep}`);
});
