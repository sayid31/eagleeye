// Radio layer lifecycle: categories, default filter, camera yield, selection.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRadioCategories,
  DEFAULT_RADIO_FILTER,
  getRadioUIState,
  radioCameraNavigationAllowed,
  radioLayer,
  setRadioParams,
} from './radio.js';

const stations = [
  { id: 'news', tags: ['News', 'Weather Radio', 'air traffic'] },
  { id: 'safety', tags: ['police scanner', 'emergency'] },
  { id: 'music', tags: ['jazz', 'soul'] },
  { id: 'other', tags: ['community'] },
];

test('every generated Radio category is accepted by durable preferences', () => {
  const categories = buildRadioCategories([
    ...stations,
    { id: 'hip-hop', tags: ['hip hop'] },
    { id: 'r-and-b', tags: ['r&b'] },
  ]);
  try {
    for (const category of categories) {
      assert.equal(setRadioParams({ filter: category.id }), true, category.id);
    }
  } finally {
    // setRadioParams writes module state; without this reset the surviving
    // filter leaks into any later test that asserts the initial filter.
    radioLayer.destroy();
  }
});

test('All is the initial Radio filter', () => {
  assert.equal(DEFAULT_RADIO_FILTER, 'all');
  assert.equal(getRadioUIState().filter, 'all');
});

test('Radio camera navigation yields to every live tracked-entity owner', () => {
  const viewer = { camera: {} };
  assert.equal(radioCameraNavigationAllowed(viewer), true);
  for (const gevTrackedId of ['flights:abc123', 'military:def456']) {
    const trackedEntity = { gevTrackedId };
    viewer.trackedEntity = trackedEntity;
    assert.equal(radioCameraNavigationAllowed(viewer), false, gevTrackedId);
    assert.equal(viewer.trackedEntity, trackedEntity);
  }
  viewer.trackedEntity = undefined;
  assert.equal(radioCameraNavigationAllowed(viewer), true);
  assert.equal(radioCameraNavigationAllowed({ trackedEntity: {} }), false);
  assert.equal(radioCameraNavigationAllowed(null), false);
});

test('a selection made with a stationary camera resolves its own horizon visibility', async () => {
  // Regression: the selection entity inherited Cesium's default `show: true`
  // and relied on the camera-gated horizon pass to correct it. That pass skips
  // entirely while the camera has moved under HORIZON_CAMERA_MOVE_EPSILON_M, so
  // selecting a far-side station without moving the camera — voice command,
  // tuner click, directory Next without rotation — drew the marker and bracket
  // through the globe indefinitely. Both parts disable depth testing, so
  // nothing else culls them. The camera here never moves: no scan runs, and the
  // flags below are the ones the entity chose for itself at creation.
  const originalFetch = globalThis.fetch;
  const selectedEntities = new Map();
  const viewer = {
    // Over lat 0 / lon 0, so lon 0 is in front of the horizon and lon 180 behind it.
    camera: { positionWC: { x: 7_000_000, y: 0, z: 0 } },
    scene: {
      canvas: { disableRootEvents: true, onwheel: null, addEventListener() {}, removeEventListener() {} },
      requestRender() {},
    },
    dataSources: { add() {}, remove() {} },
    entities: {
      add(entity) { selectedEntities.set(entity.id, entity); return entity; },
      remove(entity) { return selectedEntities.delete(entity?.id); },
    },
  };
  const station = (id, lon) => ({
    id,
    name: `Horizon ${id}`,
    lat: 0,
    lon,
    streamUrl: `https://radio.example.com/${lon}.mp3`,
    homepage: null,
    tags: ['news'],
    languages: ['English'],
    state: '',
    country: 'Ecuador',
    countryCode: 'EC',
    metadataTrust: 'untrusted-community',
    codec: 'MP3',
    bitrate: 128,
  });
  const nearSide = station('00000000-0000-4000-8000-0000000000a1', 0);
  const farSide = station('00000000-0000-4000-8000-0000000000a2', 180);

  radioLayer.destroy();
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      stations: [nearSide, farSide],
      stale: false,
      degraded: false,
      acceptedGeneration: 1,
      catalogInstance: 'qa-instance-horizon',
      updatedAt: new Date().toISOString(),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    radioLayer.init(viewer);
    radioLayer.enable();
    radioLayer.setLifecyclePresentation({
      lifecycleState: 'enabled', enabled: true, uncertain: false,
    });
    await radioLayer.update();
    const scansBefore = radioLayer.getStats().horizonScans;

    assert.equal(radioLayer.selectStation(farSide.id, { autoplay: false, focus: false }), true);
    assert.equal(
      selectedEntities.get(`radio:selected:${farSide.id}`)?.show,
      false,
      'a far-side selection is hidden without waiting for a horizon scan',
    );

    assert.equal(radioLayer.selectStation(nearSide.id, { autoplay: false, focus: false }), true);
    assert.equal(
      selectedEntities.get(`radio:selected:${nearSide.id}`)?.show,
      true,
      'a near-side selection stays drawn',
    );

    assert.equal(
      radioLayer.getStats().horizonScans,
      scansBefore,
      'the fix costs one point test per selection, not a new scan of every station',
    );
  } finally {
    globalThis.fetch = originalFetch;
    radioLayer.destroy();
  }
});
