import test from 'node:test';
import assert from 'node:assert/strict';
import { needsUnbiasedCheck, pickGeocodeCandidate } from './geocodeCandidatePick.js';

// test-only: shapes and values copied from live Nominatim answers for "kupang".
const kotaKupang = { category: 'boundary', type: 'administrative', place_rank: 16, importance: 0.52, display_name: 'Kupang, NTT' };
const kupangKotaVillage = { category: 'place', type: 'village', place_rank: 19, importance: 0.17, display_name: 'Kupang Kota, Bandar Lampung' };
const tlkKupangRoad = { category: 'highway', type: 'residential', place_rank: 26, importance: 0.05, display_name: 'TLK Kupang, Jakarta' };

test('a far more important city beats a biased nearby village', () => {
  assert.equal(pickGeocodeCandidate([kupangKotaVillage, kotaKupang]), kotaKupang);
});

test('a far more important city beats a biased nearby street', () => {
  assert.equal(pickGeocodeCandidate([tlkKupangRoad, kupangKotaVillage, kotaKupang]), kotaKupang);
});

test('a top hit that is already a city is kept even if another city is more important', () => {
  const smallCity = { ...kotaKupang, importance: 0.2, display_name: 'small city' };
  assert.equal(pickGeocodeCandidate([smallCity, kotaKupang]), smallCity);
});

test('a major place that is only slightly more important does not override the bias', () => {
  const nearby = { ...kupangKotaVillage, importance: 0.3 };
  assert.equal(pickGeocodeCandidate([nearby, kotaKupang]), nearby);
});

test('streets keep the viewport order: an on-screen street beats a far-away city of the same name', () => {
  const sixthStreetHere = { category: 'highway', type: 'residential', place_rank: 26, importance: 0.05 };
  const sixthStreetElsewhere = { category: 'highway', type: 'residential', place_rank: 26, importance: 0.3 };
  assert.equal(pickGeocodeCandidate([sixthStreetHere, sixthStreetElsewhere]), sixthStreetHere);
});

test('missing importance counts as zero and never throws', () => {
  const unranked = { category: 'highway', place_rank: 26 };
  assert.equal(pickGeocodeCandidate([unranked, kotaKupang]), kotaKupang);
});

test('a null alternative (failed cross-check) keeps the top hit', () => {
  assert.equal(pickGeocodeCandidate([tlkKupangRoad, null]), tlkKupangRoad);
});

test('only non-city hits are worth cross-checking', () => {
  assert.equal(needsUnbiasedCheck(kotaKupang), false);
  assert.equal(needsUnbiasedCheck(kupangKotaVillage), true);
  assert.equal(needsUnbiasedCheck(tlkKupangRoad), true);
});

test('an empty or malformed list yields no candidate', () => {
  assert.equal(pickGeocodeCandidate([]), null);
  assert.equal(pickGeocodeCandidate(null), null);
});
