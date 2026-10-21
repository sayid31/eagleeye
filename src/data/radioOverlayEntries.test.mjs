// Overlay entry construction, cluster identity, and horizon helpers.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRadioClusterOverlayEntry,
  createRadioSelectedOverlayEntry,
  createRadioSingletonOverlayEntry,
  radioGlobeLabel,
  RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M,
  RADIO_OVERLAY_COHORT_LIMIT,
  RADIO_OVERLAY_SOURCE_OPTIONS,
  RADIO_SINGLETON_GLOBAL_LIMIT,
  RADIO_SINGLETON_MID_LIMIT,
  RADIO_SINGLETON_NEAR_LIMIT,
  radioCameraPositionChanged,
  radioEntityHorizonVisible,
  reconcileRadioClusterCandidates,
  retainRadioClusterIdentitiesForStations,
  selectRadioClusterCandidates,
  selectRadioSingletonCandidates,
  radioSingletonLabelLimit,
} from './radio.js';

const stations = [
  { id: 'news', tags: ['News', 'Weather Radio', 'air traffic'] },
  { id: 'safety', tags: ['police scanner', 'emergency'] },
  { id: 'music', tags: ['jazz', 'soul'] },
  { id: 'other', tags: ['community'] },
];

test('Radio globe labels are compact and frequency-first without misreading names', () => {
  assert.equal(
    radioGlobeLabel({ name: 'La Zeta (Hermosillo) - 93.9 FM - XHHY - Uniradio' }),
    '93.9 FM — La Zeta',
  );
  assert.equal(
    radioGlobeLabel({ name: '100.3 The River - WQRV - Meridianville/Huntsville, AL' }),
    '100.3 FM — The River',
  );
  assert.equal(radioGlobeLabel({ name: "80's New Wave Radio" }), "80's New Wave Radio");
  assert.equal(radioGlobeLabel({ name: "100 GREATEST OF THE 80'S" }), "100 GREATEST OF THE 80'S");
  assert.doesNotMatch(radioGlobeLabel({ name: 'Movie Soundtracks Hits Radio @ 1.fm' }), /^1 FM/);
  assert.equal(
    radioGlobeLabel({ name: '  La   Zeta - 93.9 fm - XHHY  ' }),
    '93.9 FM — La Zeta',
  );
  assert.equal(radioGlobeLabel({ name: '93.9 FM ---' }), '93.9 FM');
  assert.equal(radioGlobeLabel({ name: 'Radio One 93.9 FM / 94.1 FM' }), '93.9 FM — Radio One');
  const truncated = radioGlobeLabel({ name: 'Christian Power Praise Dot Net Worldwide Service' });
  assert.equal(truncated.length, 30);
  assert.ok(truncated.endsWith('…'));
  const unicodeTruncated = radioGlobeLabel({ name: `${'a'.repeat(28)}📻 more` });
  assert.equal(unicodeTruncated, `${'a'.repeat(28)}📻…`);
  assert.doesNotMatch(unicodeTruncated, /�/);
});

test('Radio ranks and caps cluster candidates before shared-host entry construction', () => {
  const candidates = Array.from({ length: 90 }, (_, index) => ({
    id: `cluster-${String(index).padStart(2, '0')}`,
    stationCount: index % 17,
  }));
  const selected = selectRadioClusterCandidates(candidates);
  assert.equal(selected.length, RADIO_OVERLAY_COHORT_LIMIT);
  assert.ok(selected.every((candidate) => candidates.includes(candidate)));
  for (let index = 1; index < selected.length; index += 1) {
    assert.ok(selected[index - 1].stationCount >= selected[index].stationCount);
  }
  assert.deepEqual(selectRadioClusterCandidates([
    { id: 'z', stationCount: 5 },
    { id: 'a', stationCount: 5 },
  ], 1).map(({ id }) => id), ['a']);
});

test('Radio preserves one-to-one cluster identity across substantial membership churn', () => {
  const previous = [
    { id: 'stable:north', identityId: 'stable:north', stationIds: ['a', 'b', 'c', 'd'] },
    { id: 'stable:south', identityId: 'stable:south', stationIds: ['w', 'x', 'y', 'z'] },
  ];
  const generated = [];
  const reconciled = reconcileRadioClusterCandidates([
    { id: 'b:e:4', stationIds: ['a', 'b', 'c', 'e'], text: '4 BERITA' },
    { id: 'new:weak:3', stationIds: ['d', 'm', 'n'], text: '3 LAINNYA' },
    { id: 'x:q:4', stationIds: ['w', 'x', 'y', 'q'], text: '4 MUSIK' },
  ], previous, (candidate) => {
    const id = `new:${candidate.id}`;
    generated.push(id);
    return id;
  });
  assert.equal(reconciled[0].id, 'stable:north');
  assert.equal(reconciled[0].text, '4 BERITA');
  assert.equal(reconciled[2].id, 'stable:south');
  assert.equal(reconciled[2].text, '4 MUSIK');
  assert.equal(reconciled[1].id, 'new:new:weak:3');
  assert.deepEqual(generated, ['new:new:weak:3']);
  assert.deepEqual(previous[0].stationIds, ['a', 'b', 'c', 'd']);
});

test('directory refresh retains only identities whose represented stations still exist', () => {
  const previous = [
    { id: 'stable:unchanged', stationIds: ['a', 'b', 'c'] },
    { id: 'stable:invalid', stationIds: ['x', 'y', 'z'] },
  ];
  const unchangedRefresh = retainRadioClusterIdentitiesForStations(previous, [
    { id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'x' }, { id: 'y' }, { id: 'z' },
  ]);
  assert.deepEqual(unchangedRefresh, previous);
  const changedRefresh = retainRadioClusterIdentitiesForStations(previous, [
    { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'x' }, { id: 'z' },
  ]);
  assert.deepEqual(changedRefresh.map(({ id }) => id), ['stable:unchanged']);
});

test('Radio cluster identity inheritance is deterministic for splits and disjoint replacements', () => {
  const previous = [{
    id: 'stable:whole',
    identityId: 'stable:whole',
    stationIds: ['a', 'b', 'c', 'd', 'e', 'f'],
  }];
  const reconciled = reconcileRadioClusterCandidates([
    { id: 'a:c:3', stationIds: ['a', 'b', 'c'] },
    { id: 'd:f:3', stationIds: ['d', 'e', 'f'] },
    { id: 'x:z:3', stationIds: ['x', 'y', 'z'] },
  ], previous, (candidate) => `new:${candidate.id}`);
  assert.deepEqual(reconciled.map(({ id }) => id), [
    'stable:whole',
    'new:d:f:3',
    'new:x:z:3',
  ]);
  assert.equal(new Set(reconciled.map(({ id }) => id)).size, reconciled.length);
});

test('Radio allocates fresh disjoint cluster identities in canonical membership order', () => {
  const current = [
    { id: 'z-membership', stationIds: ['z2', 'z1'] },
    { id: 'a-membership', stationIds: ['a2', 'a1'] },
  ];
  const reconcile = (input) => {
    let sequence = 0;
    return reconcileRadioClusterCandidates(input, [], () => `stable:${++sequence}`);
  };
  const identities = (result) => Object.fromEntries(
    result.map(({ membershipId, identityId }) => [membershipId, identityId]),
  );

  assert.deepEqual(identities(reconcile(current)), {
    'z-membership': 'stable:2',
    'a-membership': 'stable:1',
  });
  assert.deepEqual(identities(reconcile([...current].reverse())), identities(reconcile(current)));
});

test('Radio split competition never falls through from a consumed majority to a historical minority', () => {
  const previous = [
    { id: 'stable:majority', stationIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] },
    { id: 'stable:minority', stationIds: ['x'] },
  ];
  const current = [
    { id: 'strong-child', stationIds: ['a', 'b', 'c', 'd', 'e'] },
    { id: 'later-child', stationIds: ['f', 'g', 'h', 'i', 'x'] },
  ];
  const reconcile = (currentInput, previousInput) => reconcileRadioClusterCandidates(
    currentInput,
    previousInput,
    (candidate) => `new:${candidate.id}`,
  );
  const forward = reconcile(current, previous);
  const permuted = reconcile([...current].reverse(), [...previous].reverse());
  const identities = (result) => Object.fromEntries(
    result.map(({ membershipId, identityId }) => [membershipId, identityId]),
  );

  assert.deepEqual(identities(forward), {
    'strong-child': 'stable:majority',
    'later-child': 'new:later-child',
  });
  assert.deepEqual(identities(permuted), identities(forward));
});

test('Radio split identities cannot migrate to weaker children to increase inherited count', () => {
  const previous = [
    { id: 'stable:alpha', stationIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9'] },
    { id: 'stable:beta', stationIds: ['b1', 'b2', 'b3', 'b4', 'b5'] },
  ];
  const reconciled = reconcileRadioClusterCandidates([
    {
      id: 'strong-tie',
      stationIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'b1', 'b2', 'b3', 'b4', 'b5'],
    },
    { id: 'weaker-alpha-child', stationIds: ['a6', 'a7', 'a8', 'a9'] },
  ], previous, (candidate) => `new:${candidate.id}`);

  assert.deepEqual(reconciled.map(({ id }) => id), [
    'stable:beta',
    'new:weaker-alpha-child',
  ]);
});

test('Radio duplicate prior records cannot assign one stable identity twice', () => {
  const previous = [
    { id: 'stable:duplicate', stationIds: ['a', 'b'] },
    { identityId: 'stable:duplicate', stationIds: ['c', 'd'] },
  ];
  const current = [
    { id: 'a-child', stationIds: ['a', 'b'] },
    { id: 'z-child', stationIds: ['c', 'd'] },
  ];
  const reconcile = (currentInput, previousInput) => reconcileRadioClusterCandidates(
    currentInput,
    previousInput,
    (candidate) => `new:${candidate.id}`,
  );
  const forward = reconcile(current, previous);
  const permuted = reconcile([...current].reverse(), [...previous].reverse());
  const identities = (result) => Object.fromEntries(
    result.map(({ membershipId, identityId }) => [membershipId, identityId]),
  );

  assert.deepEqual(identities(forward), {
    'a-child': 'stable:duplicate',
    'z-child': 'new:z-child',
  });
  assert.deepEqual(identities(permuted), identities(forward));
  assert.equal(forward.filter(({ identityId }) => identityId === 'stable:duplicate').length, 1);
});

test('Radio cluster merges preserve the larger contributor over a fully retained minority', () => {
  const previous = [
    { id: 'stable:minority', stationIds: ['a', 'b'] },
    { id: 'stable:majority', stationIds: ['c', 'd', 'e', 'f', 'g', 'h'] },
  ];
  const [merged] = reconcileRadioClusterCandidates([
    { id: 'merged', stationIds: ['a', 'b', 'c', 'd', 'e'] },
  ], previous, () => 'new:merged');

  assert.equal(merged.id, 'stable:majority');
});

test('Radio cluster inheritance never discards the greatest low-ratio contributor', () => {
  const previous = [
    { id: 'stable:four', stationIds: ['a', 'b', 'c', 'd', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w'] },
    { id: 'stable:two', stationIds: ['e', 'f'] },
  ];
  const [merged] = reconcileRadioClusterCandidates([{
    id: 'merged',
    stationIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
  }], previous, () => 'new:merged');

  assert.equal(merged.id, 'stable:four');
});

test('Radio cluster inheritance permits a unique one-member overlap', () => {
  const [reconciled] = reconcileRadioClusterCandidates([
    { id: 'current', stationIds: ['a', 'x', 'y'] },
  ], [
    { id: 'stable:single-overlap', stationIds: ['a', 'b', 'c'] },
  ], () => 'new:current');

  assert.equal(reconciled.id, 'stable:single-overlap');
});

test('Radio cluster majority ties are deterministic across input permutations', () => {
  const previous = [
    { id: 'stable:zulu', stationIds: ['a', 'b', 'x'] },
    { id: 'stable:alpha', stationIds: ['c', 'd', 'y'] },
  ];
  const current = [{ id: 'merged', stationIds: ['a', 'b', 'c', 'd'] }];
  const forward = reconcileRadioClusterCandidates(current, previous, () => 'new:merged');
  const reversed = reconcileRadioClusterCandidates(current, [...previous].reverse(), () => 'new:merged');

  assert.equal(forward[0].id, 'stable:alpha');
  assert.equal(reversed[0].id, 'stable:alpha');
  assert.equal(new Set(forward.map(({ id }) => id)).size, forward.length);
});

test('Radio text uses protected selected and bounded ambient WorldOverlay entries', () => {
  const position = { x: 1, y: 2, z: 3 };
  const selected = createRadioSelectedOverlayEntry({
    id: 'station-a',
    name: 'Austin News 93.9 FM - KQA',
    tags: ['news'],
  }, position);
  assert.equal(selected.variant, 'selected');
  assert.equal(selected.selected, true);
  assert.equal(selected.protected, true);
  assert.equal(selected.paintLane, 'selected');
  assert.equal(selected.title, '93.9 FM — Austin News');
  assert.equal(selected.position, position);
  assert.equal(selected.maxDistance, RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M);

  const cluster = createRadioClusterOverlayEntry({
    id: 'a:z:12',
    position,
    text: '12 BERITA',
    accent: '#44adff',
    stationCount: 12,
  });
  assert.equal(cluster.variant, 'label');
  assert.equal(cluster.paintLane, 'ambient-label');
  assert.equal(cluster.collisionGroup, 'ambient-label');
  assert.equal(cluster.horizonCull, true);
  assert.equal(cluster.maxDistance, RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M);
  assert.equal(cluster.distanceScale.far, RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M);
  assert.equal(cluster.title, '12 BERITA');
  assert.equal(cluster.priority, 12);
  assert.equal(cluster.stateless, true);
  assert.equal(cluster.edgeFade, 'none');
  assert.equal(RADIO_OVERLAY_SOURCE_OPTIONS.cohortLimit, RADIO_OVERLAY_COHORT_LIMIT);
  assert.ok(RADIO_OVERLAY_COHORT_LIMIT < 750);

  const singleton = createRadioSingletonOverlayEntry({
    station: { id: 'station-b', name: '100.3 The River - WQRV', tags: ['public safety'] },
    position,
    priority: 1.5,
  });
  assert.equal(singleton.id, 'station:station-b');
  assert.equal(singleton.title, '100.3 FM — The River');
  assert.equal(singleton.paintLane, 'ambient-label');
  assert.equal(singleton.collisionGroup, 'ambient-label');
  assert.equal(singleton.interactive, false);
  assert.equal(singleton.horizonCull, true);
  assert.equal(singleton.maxDistance, RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M);
  assert.equal(singleton.distanceScale.far, RADIO_GLOBE_INTERACTION_MAX_DISTANCE_M);
  assert.equal(singleton.priority, 1.5);
  assert.equal(singleton.stateless, true);
});

test('Radio singleton labels are zoom-aware, nearest-first, stable, and bounded', () => {
  assert.equal(radioSingletonLabelLimit(25_000_000), RADIO_SINGLETON_GLOBAL_LIMIT);
  assert.equal(radioSingletonLabelLimit(2_000_000), RADIO_SINGLETON_GLOBAL_LIMIT);
  assert.equal(radioSingletonLabelLimit(1_999_999), RADIO_SINGLETON_MID_LIMIT);
  assert.equal(radioSingletonLabelLimit(250_000), RADIO_SINGLETON_MID_LIMIT);
  assert.equal(radioSingletonLabelLimit(249_999), RADIO_SINGLETON_NEAR_LIMIT);
  const ranked = selectRadioSingletonCandidates([
    { station: { id: 'far' }, distanceM: 30 },
    { station: { id: 'near-z' }, distanceM: 10 },
    { station: { id: 'near-a' }, distanceM: 10 },
  ], 2);
  assert.deepEqual(ranked.map(({ station }) => station.id), ['near-a', 'near-z']);
});

test('station horizon scans ignore stationary camera noise but detect movement', () => {
  const prior = { x: 1_000, y: -2_000, z: 3_000 };
  assert.equal(radioCameraPositionChanged(prior, { x: 1_000, y: -2_000, z: 3_000 }), false);
  assert.equal(radioCameraPositionChanged(prior, { x: 1_000.5, y: -2_000, z: 3_000 }), false);
  assert.equal(radioCameraPositionChanged(prior, { x: 1_002, y: -2_000, z: 3_000 }), true);
  assert.equal(radioCameraPositionChanged(null, prior), true);
});

test('horizon visibility hides occluded radio entities and shows undecidable ones', () => {
  const position = { x: 1, y: 2, z: 3 };
  const occluder = (visible) => ({ isPointVisible: () => visible });
  assert.equal(radioEntityHorizonVisible(occluder(true), position), true);
  assert.equal(radioEntityHorizonVisible(occluder(false), position), false);
  // Undecidable inputs show rather than hide: a marker the camera is plainly
  // looking at must not blink out because its sample came a frame too early.
  assert.equal(radioEntityHorizonVisible(occluder(false), null), true);
  assert.equal(radioEntityHorizonVisible(null, position), true);
  assert.equal(radioEntityHorizonVisible({}, position), true);
});
