import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OVERPASS_URL, buildOverpassQuery } from './trafficOverpassQuery.js';

test('OVERPASS_URL points at the local same-origin proxy route', () => {
  assert.equal(OVERPASS_URL, '/api/overpass');
});

test('buildOverpassQuery restricts to major highway classes when majorOnly is set', () => {
  const query = buildOverpassQuery(1, 2, 3, 4, { majorOnly: true, timeoutSec: 25 });
  assert.match(query, /\^\(motorway\|trunk\|primary\|secondary\)\$/);
  assert.doesNotMatch(query, /tertiary/);
});

test('buildOverpassQuery includes all drivable classes by default', () => {
  const query = buildOverpassQuery(1, 2, 3, 4);
  assert.match(query, /tertiary\|residential\|unclassified/);
});

test('buildOverpassQuery orders the bounding box as south,west,north,east', () => {
  const query = buildOverpassQuery(10, 20, 30, 40, { timeoutSec: 12 });
  assert.match(query, /\(10,20,30,40\)/);
  assert.match(query, /\[timeout:12\]/);
});

test('buildOverpassQuery defaults timeoutSec to 25', () => {
  const query = buildOverpassQuery(1, 2, 3, 4);
  assert.match(query, /\[timeout:25\]/);
});

test('buildOverpassQuery requests inline geometry sorted by quadtile', () => {
  const query = buildOverpassQuery(1, 2, 3, 4);
  assert.match(query, /out geom qt;$/);
});
