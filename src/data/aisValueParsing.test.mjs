import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampInt, normalizeAisTimestamp, normalizedHeading, numberValue, parseCsvOrJsonEnv, parseJsonEnv, stringValue,
} from './aisValueParsing.mjs';

test('env parsers fall back when unset, accept JSON, and parse CSV', () => {
  const key = 'GEV_TEST_AIS_ENV'; // test-only
  delete process.env[key];
  assert.deepEqual(parseJsonEnv(key, [1]), [1]);
  process.env[key] = '[[0,0],[1,1]]';
  assert.deepEqual(parseJsonEnv(key, null), [[0, 0], [1, 1]]);
  process.env[key] = 'PositionReport, ShipStaticData';
  assert.deepEqual(parseCsvOrJsonEnv(key, []), ['PositionReport', 'ShipStaticData']);
  process.env[key] = '{bad';
  const warn = console.warn;
  console.warn = () => {};
  try { assert.equal(parseJsonEnv(key, 'fallback'), 'fallback'); } finally { console.warn = warn; delete process.env[key]; }
});

test('value normalisers handle the loose AISStream field types', () => {
  assert.equal(clampInt('900', 1, 500, 10), 500);
  assert.equal(clampInt('x', 1, 500, 10), 10);
  assert.equal(stringValue('  MSC  '), 'MSC');
  assert.equal(stringValue(null), '');
  assert.equal(numberValue(''), null);
  assert.equal(numberValue('12.5'), 12.5);
  assert.equal(normalizedHeading(511), null);
  assert.equal(normalizedHeading(90), 90);
  assert.equal(normalizeAisTimestamp('2026-11-09 03:04:05.123 +0000 UTC'), '2026-11-09T03:04:05.123Z');
  assert.match(normalizeAisTimestamp(''), /^\d{4}-\d{2}-\d{2}T/);
});
