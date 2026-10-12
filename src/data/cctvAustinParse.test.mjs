import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAustinCoords,
  isLikelyAustinCoordinate,
  rowArrayToObject,
} from './cctvAustinParse.mjs';

test('rowArrayToObject keys a Socrata row by normalised column names', () => {
  const columns = [{ fieldName: 'Camera ID' }, { name: 'Location Name' }, {}];
  assert.deepEqual(rowArrayToObject([7, 'Congress & 6th', 'x'], columns), {
    camera_id: 7,
    location_name: 'Congress & 6th',
    col_2: 'x',
  });
});

test('extractAustinCoords reads a POINT string, a GeoJSON-like object and scalar fields', () => {
  const fromPoint = extractAustinCoords({ location: 'POINT (-97.7431 30.2672)' });
  assert.ok(Math.abs(fromPoint.lat - 30.2672) < 1e-9 && Math.abs(fromPoint.lon + 97.7431) < 1e-9);
  const fromScalars = extractAustinCoords({ latitude: '30.1', longitude: '-97.5' });
  assert.deepEqual(fromScalars, { lat: 30.1, lon: -97.5 });
  const none = extractAustinCoords({});
  assert.ok(Number.isNaN(none.lat) && Number.isNaN(none.lon));
});

test('isLikelyAustinCoordinate accepts the Austin area and rejects swapped or distant points', () => {
  assert.equal(isLikelyAustinCoordinate(30.27, -97.74), true);
  assert.equal(isLikelyAustinCoordinate(-97.74, 30.27), false);
  assert.equal(isLikelyAustinCoordinate(51.5, -0.12), false);
  assert.equal(isLikelyAustinCoordinate(NaN, NaN), false);
});
