// Pure tuner/ranking/category math extracted from radio.test.mjs.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRadioTunerBand,
  buildRadioTunerTicks,
  buildRadioCategories,
  filterRadioStations,
  isEnglishRadioStation,
  normalizeRadioTag,
  radioCategoryColor,
  radioGlobeNeedsRecentering,
  radioGlobeRecenterHeight,
  radioClusterCategoryId,
  radioClusterBadgeText,
  rankRadioStationsForViewport,
  rankRadioStationsForRequest,
  radioRequestIsCurrent,
  radioStationIdFromPick,
  radioSelectionBracketSvg,
  radioStationCameraPlan,
  radioTunerCommitSlot,
  radioTunerPointerPosition,
  radioTunerSlot,
  radioTuningStaticShouldPlay,
  radioStationCategoryId,
  radioViewIsGlobal,
  stationMatchesRadioCategory,
} from './radio.js';

const stations = [
  { id: 'news', tags: ['News', 'Weather Radio', 'air traffic'] },
  { id: 'safety', tags: ['police scanner', 'emergency'] },
  { id: 'music', tags: ['jazz', 'soul'] },
  { id: 'other', tags: ['community'] },
];

test('station-level tags produce canonical and detected-genre categories', () => {
  const categories = buildRadioCategories(stations);
  assert.equal(categories.find((category) => category.id === 'all').count, 4);
  assert.equal(categories.find((category) => category.id === 'weather').count, 2);
  assert.equal(categories.find((category) => category.id === 'public-safety').count, 1);
  assert.equal(categories.find((category) => category.id === 'genre:jazz').count, 1);
  assert.equal(categories.find((category) => category.id === 'other').count, 1);
  assert.equal(categories.find((category) => category.id === 'music').color, '#54d17a');
  assert.equal(categories.find((category) => category.id === 'genre:jazz').color, '#54d17a');
});

test('station marker categories share the dropdown palette with stable overlap priority', () => {
  assert.equal(radioStationCategoryId(stations[0]), 'news');
  assert.equal(radioStationCategoryId(stations[1]), 'public-safety');
  assert.equal(radioStationCategoryId(stations[2]), 'music');
  assert.equal(radioStationCategoryId(stations[3]), 'other');
  assert.equal(radioCategoryColor('news'), '#44adff');
  assert.equal(radioCategoryColor('music'), '#54d17a');
  assert.equal(radioCategoryColor('genre:jazz'), '#54d17a');
});

test('cluster badges lead with a readable count and concise dominant category', () => {
  assert.equal(radioClusterBadgeText('news', 12), '12 BERITA');
  assert.equal(radioClusterBadgeText('public-safety', 7.9), '7 KEAMANAN');
  assert.equal(radioClusterBadgeText('genre:jazz', 4), '4 MUSIK');
  assert.equal(radioClusterBadgeText('unknown', -2), '0 LAINNYA');
});

test('active station tags own cluster labels even when overlapping tags have higher marker priority', () => {
  const overlapping = [
    { id: 'weather-news', tags: ['weather', 'news'] },
    { id: 'weather-only', tags: ['weather'] },
    { id: 'talk', tags: ['talk'] },
  ];
  assert.equal(radioStationCategoryId(overlapping[0]), 'news');
  assert.equal(radioClusterCategoryId(overlapping, 'weather'), 'weather');
  assert.equal(radioClusterCategoryId(overlapping, 'genre:jazz'), 'genre:jazz');
  assert.equal(radioClusterCategoryId(overlapping, 'all'), 'news');
});

test('filters do not rewrite inputs and overlapping operational tags remain discoverable', () => {
  const before = structuredClone(stations);
  assert.deepEqual(filterRadioStations(stations, 'public-safety').map((station) => station.id), ['safety']);
  assert.equal(stationMatchesRadioCategory(stations[0], 'aviation-marine'), true);
  assert.deepEqual(stations, before);
});

test('tag normalization is bounded and stable', () => {
  assert.equal(normalizeRadioTag('  Hip-Hop__Music  '), 'hip hop music');
  assert.equal(normalizeRadioTag('x'.repeat(100)).length, 80);
});

test('late directory responses cannot overwrite a disabled or newer generation', () => {
  assert.equal(radioRequestIsCurrent(4, 4, true), true);
  assert.equal(radioRequestIsCurrent(3, 4, true), false);
  assert.equal(radioRequestIsCurrent(4, 4, false), false);
});

test('local viewport ranking chooses geographic distance without a language override', () => {
  const ranked = rankRadioStationsForViewport([
    { id: 'english-far', lat: 30.5, lon: -97.7, languages: ['English'] },
    { id: 'spanish-near', lat: 30.2673, lon: -97.7430, languages: ['Spanish'] },
    { id: 'english-near', lat: 30.28, lon: -97.74, languages: ['en'] },
  ], { lat: 30.2672, lon: -97.7431 });
  assert.deepEqual(ranked.map((station) => station.id), ['spanish-near', 'english-near', 'english-far']);
});

test('global viewport ranking prefers English stations, then distance', () => {
  const ranked = rankRadioStationsForViewport([
    { id: 'spanish-nearest', lat: 0, lon: 0, languages: ['Spanish'] },
    { id: 'english-far', lat: 15, lon: 0, languages: ['English'] },
    { id: 'english-near', lat: 5, lon: 0, languages: ['eng'] },
  ], { lat: 0, lon: 0 }, { preferEnglish: true });
  assert.deepEqual(ranked.map((station) => station.id), ['english-near', 'english-far', 'spanish-nearest']);
  assert.equal(isEnglishRadioStation(ranked[0]), true);
});

test('explicit Radio requests combine category, country, station name, and distance', () => {
  const rows = [
    { id: 'music-austin', name: 'Austin Music', tags: ['music'], countryCode: 'US', country: 'United States', lat: 30.26, lon: -97.74 },
    { id: 'news-dallas', name: 'Texas News', tags: ['news'], countryCode: 'US', country: 'United States', lat: 32.77, lon: -96.79 },
    { id: 'news-austin', name: 'Austin Public News', tags: ['news'], countryCode: 'US', country: 'United States', lat: 30.27, lon: -97.75 },
    { id: 'news-mexico', name: 'Noticias', tags: ['news'], countryCode: 'MX', country: 'Mexico', lat: 25.68, lon: -100.31 },
  ];
  const ranked = rankRadioStationsForRequest(rows, {
    categoryId: 'news',
    country: 'US',
    anchor: { lat: 30.2672, lon: -97.7431 },
  });
  assert.deepEqual(ranked.map((station) => station.id), ['news-austin', 'news-dallas']);
  assert.equal(rankRadioStationsForRequest(rows, {
    categoryId: 'news',
    stationQuery: 'public',
  })[0].id, 'news-austin');
});

test('viewport ranking treats the antimeridian as adjacent', () => {
  const ranked = rankRadioStationsForViewport([
    { id: 'far', lat: 0, lon: 150, languages: ['English'] },
    { id: 'across-dateline', lat: 0, lon: -179.9, languages: ['English'] },
  ], { lat: 0, lon: 179.9 });
  assert.equal(ranked[0].id, 'across-dateline');
});

test('global-view threshold tolerates Cesium altitude round-off without widening the boundary', () => {
  assert.equal(radioViewIsGlobal(1_999_999.6), true);
  assert.equal(radioViewIsGlobal(1_999_998.4), false);
});

test('Radio picks resolve ordinary, selected, primitive, and clustered entity ids', () => {
  assert.equal(radioStationIdFromPick({ id: 'radio:alpha' }), 'alpha');
  assert.equal(radioStationIdFromPick({ primitive: { id: 'radio:beta' } }), 'beta');
  assert.equal(radioStationIdFromPick({ id: { id: 'radio:selected:gamma' } }), 'gamma');
  assert.equal(radioStationIdFromPick({ id: [{ id: 'other' }, { id: 'radio:delta' }] }), 'delta');
  assert.equal(radioStationIdFromPick({ primitive: { id: [{ id: 'radio:cluster-first' }, { id: 'radio:cluster-second' }] } }), 'cluster-first');
  assert.equal(radioStationIdFromPick({ id: 'flights:abc' }), null);
});

test('selected Radio station bracket is a transparent four-corner category-colored SVG', () => {
  const svg = radioSelectionBracketSvg('#44adff');
  assert.match(svg, /viewBox="0 0 40 40"/);
  assert.match(svg, /M2 13V2H13 M27 2H38V13 M38 27V38H27 M13 38H2V27/);
  assert.match(svg, /stroke="#44adff"/);
  assert.match(radioSelectionBracketSvg('bad-color'), /stroke="#9aa7b3"/);
});

test('directory tuner maps every absolute slot to an available station', () => {
  assert.deepEqual(radioTunerSlot(0, 4), {
    slot: 0, max: 3, locked: true, stationIndex: 0, leftIndex: 0, rightIndex: 0,
  });
  assert.deepEqual(radioTunerSlot(1, 4), {
    slot: 1, max: 3, locked: true, stationIndex: 1, leftIndex: 1, rightIndex: 1,
  });
  assert.deepEqual(radioTunerSlot(99, 4), {
    slot: 3, max: 3, locked: true, stationIndex: 3, leftIndex: 3, rightIndex: 3,
  });
  assert.equal(radioTunerSlot(0, 0).locked, false);
});

test('directory tuner pointer progress maps left, center, right, and midpoint ties exactly', () => {
  assert.deepEqual(radioTunerPointerPosition(7, 0, 114, 750), {
    ratio: 0, coordinate: 0, stationIndex: 0,
  });
  assert.deepEqual(radioTunerPointerPosition(57, 0, 114, 750), {
    ratio: 0.5, coordinate: 374.5, stationIndex: 375,
  });
  assert.deepEqual(radioTunerPointerPosition(107, 0, 114, 750), {
    ratio: 1, coordinate: 749, stationIndex: 749,
  });
  assert.deepEqual(radioTunerPointerPosition(50, 10, 80, 1), {
    ratio: 0.5, coordinate: 0, stationIndex: 0,
  });
  assert.equal(radioTunerPointerPosition(50, 10, 80, 0).stationIndex, -1);
  assert.deepEqual(radioTunerCommitSlot(2.5, 5), radioTunerSlot(3, 5));
});

test('directory tuner bands preserve stable filtered order without injecting outside selections', () => {
  const ranked = Array.from({ length: 800 }, (_, index) => ({ id: `station-${index}` }));
  const selected = { id: 'selected-outside-band' };
  const band = buildRadioTunerBand(ranked, selected, 750);
  assert.equal(band.length, 750);
  assert.deepEqual(band, ranked.slice(0, 750));
  assert.ok(!band.includes(selected));
  assert.deepEqual(buildRadioTunerBand(ranked, ranked[5], 24), ranked.slice(0, 24));
});

test('directory tuner virtual tape is bounded and moves opposite the needle', () => {
  const at100 = buildRadioTunerTicks(100, 750, 300);
  const at101 = buildRadioTunerTicks(101, 750, 300);
  assert.ok(at100.ticks.length <= Math.ceil(286 / at100.pitchPx) + 6);
  assert.ok(at101.needleX > at100.needleX);
  const sharedIndex = at100.ticks.find((tick) => at101.ticks.some((next) => next.stationIndex === tick.stationIndex));
  assert.ok(sharedIndex);
  const before = at100.ticks.find((tick) => tick.stationIndex === sharedIndex.stationIndex);
  const after = at101.ticks.find((tick) => tick.stationIndex === sharedIndex.stationIndex);
  assert.ok(after.xPx < before.xPx);
  assert.ok(Math.abs(after.xPx - before.xPx) >= 4 * (at101.needleX - at100.needleX) - 1e-9);
  const singleton = buildRadioTunerTicks(0, 1, 300);
  assert.equal(singleton.ratio, 0.5);
  assert.equal(singleton.ticks.length, 1);
  assert.equal(buildRadioTunerTicks(0, 0, 300).ticks.length, 0);
});

test('station camera plans preserve altitude and viewing orientation without zooming', () => {
  const nadir = radioStationCameraPlan({ lat: 30, lon: -97 }, {
    height: 600,
    heading: 0,
    pitch: -Math.PI / 2,
    roll: 0,
  });
  assert.ok(Math.abs(nadir.lat - 30) < 1e-9);
  assert.ok(Math.abs(nadir.lon + 97) < 1e-9);
  assert.equal(nadir.height, 600);
  assert.equal(nadir.heading, 0);
  assert.equal(nadir.pitch, -Math.PI / 2);
  assert.equal(nadir.roll, 0);
  const oblique = radioStationCameraPlan({ lat: 30, lon: -97 }, {
    height: 600,
    heading: 0,
    pitch: -Math.PI / 6,
    roll: 0.2,
  });
  assert.equal(oblique.height, 600);
  assert.equal(oblique.heading, 0);
  assert.equal(oblique.pitch, -Math.PI / 6);
  assert.equal(oblique.roll, 0.2);
  assert.ok(oblique.lat < 30);
  assert.ok(Math.abs(oblique.lon + 97) < 0.001);
});

test('Radio recenters clipped global and below-center closer Earth discs', () => {
  const centered = {
    earthCenterX: 600,
    earthCenterY: 400,
    earthRadius: 250,
    keyholeCenterX: 600,
    keyholeCenterY: 400,
    keyholeRadius: 420,
  };
  assert.equal(radioGlobeNeedsRecentering(centered), false);
  assert.equal(radioGlobeNeedsRecentering({ ...centered, earthCenterY: 560 }), true);
  assert.equal(radioGlobeNeedsRecentering({ ...centered, earthCenterX: 755 }), true);
  assert.equal(radioGlobeNeedsRecentering({ ...centered, earthRadius: 405 }), false);
  const closer = { ...centered, earthRadius: 900 };
  assert.equal(radioGlobeNeedsRecentering({ ...closer, earthCenterY: 800 }), false);
  assert.equal(radioGlobeNeedsRecentering({ ...closer, earthCenterY: 1_300 }), true);
  assert.equal(radioGlobeNeedsRecentering(null), false);
});

test('Radio recovery preserves closer altitude and caps extreme full-globe zoom', () => {
  assert.equal(radioGlobeRecenterHeight(2_915_647, false), 2_915_647);
  assert.equal(radioGlobeRecenterHeight(9_748_850, true), 9_748_850);
  assert.equal(radioGlobeRecenterHeight(97_488_500, true), 13_000_000);
  assert.equal(radioGlobeRecenterHeight(Number.NaN, true), null);
});

test('tuner static spans drag and broadcaster handoff but voice ducking silences it', () => {
  assert.equal(radioTuningStaticShouldPlay({ tuningActive: true, tuningStatic: true }), true);
  assert.equal(radioTuningStaticShouldPlay({ tuningStatic: true, awaitingStationId: 'news' }), true);
  assert.equal(radioTuningStaticShouldPlay({
    tuningStatic: true,
    awaitingStationId: 'news',
    voiceDucked: true,
  }), false);
  assert.equal(radioTuningStaticShouldPlay({ tuningStatic: false, awaitingStationId: 'news' }), false);
});
