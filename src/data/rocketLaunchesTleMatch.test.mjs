// Owner decision 2026-11-11: Space Missions no longer switches the Satellite
// layer on, so with Satellites off its orbit matches come only from the
// active TLE feed it fetches itself. These pin that path and the bounded wait
// that lets a cached feed's matches land in the first mission build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSatelliteOrbitTrackInTle } from './satelliteTleLookup.js';
import { settleWithin } from './rocketLaunchesUpdate.js';

// ISS element set re-labelled as a 2026 launch (designator 26067A, 2026 epoch).
const TLE = [
  'GAUNTLET PAYLOAD',
  '1 25544U 26067A   26315.51782528 -.00002182  00000-0 -11606-4 0  2927',
  '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537',
  'OTHER SAT',
  '1 43013U 17073A   26315.51782528  .00000044  00000-0  32373-4 0  9990',
  '2 43013  98.7400 300.0000 0001000  90.0000 270.0000 14.19500000 10001',
].join('\n');

test('a mission payload is matched from the active TLE feed alone', () => {
  const track = findSatelliteOrbitTrackInTle(TLE, 'Gauntlet Payload', { launchTime: '2026-11-10T12:00:00Z' });
  assert.ok(track, 'expected a match without the Satellite layer catalog');
  assert.equal(track.noradId, 25544);
  assert.equal(track.name, 'GAUNTLET PAYLOAD');
  assert.ok(track.orbitPath.length > 1, 'the matched orbit must be drawable');
});

test('a namesake from another launch year is rejected', () => {
  assert.equal(findSatelliteOrbitTrackInTle(TLE, 'Gauntlet Payload', { launchTime: '2025-03-01T00:00:00Z' }), null);
  assert.equal(findSatelliteOrbitTrackInTle(TLE, 'Unrelated Mission', { launchTime: '2026-11-10T12:00:00Z' }), null);
});

test('settleWithin returns as soon as the feed lands, and gives up at the bound', async () => {
  assert.equal(await settleWithin(Promise.resolve('tle'), 1000), true);
  assert.equal(await settleWithin(Promise.reject(new Error('down')), 1000), true, 'a failed lookup is not waited on');
  const started = Date.now();
  assert.equal(await settleWithin(new Promise(() => {}), 30), false);
  assert.ok(Date.now() - started < 500);
});
