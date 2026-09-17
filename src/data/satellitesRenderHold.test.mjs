// src/data/satellitesRenderHold.test.mjs
// Render-governor integration for the satellites conditional hold (perf wave
// 3 — see docs/CURRENT-STATE.md / CHANGELOG.md). Wires the REAL governor so
// the on-screen scan piggybacked onto _propagateAll() is observed acquiring
// and releasing the 'satellites' hold, not just inferred from the predicate.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLong, degreesLat } from 'satellite.js';
import satellitesLayer, {
  _addCoreCatalogEntryForTest,
  _clearDenseCatalogStateForTest,
  _forceNextPropagationForTest,
  _runSatellitePreRenderForTest,
  _setCameraForTest,
  _setDenseCatalogStateForTest,
} from './satellites.js';
import {
  installRenderGovernor,
  getRenderGovernorDiagnostics,
  _resetRenderGovernorForTest,
} from '../renderGovernor.js';

const L1 = '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927';
const L2 = '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537';
const ISS_SATREC = twoline2satrec(L1, L2);

/**
 * Where SGP4 places the ISS right now — _propagateAll() uses the wall clock,
 * not a test-controllable seam, so the camera fixtures below are built
 * relative to a live propagation instead of a hardcoded historical fixture
 * (which would silently drift and eventually land on the wrong side of the
 * globe as real elapsed time diverges from an old epoch).
 * @returns {Cesium.Cartesian3}
 */
function currentIssPositionWC() {
  const now = new Date();
  const posVel = propagate(ISS_SATREC, now);
  const gmst = gstime(now);
  const geo = eciToGeodetic(posVel.position, gmst);
  return Cesium.Cartesian3.fromDegrees(degreesLong(geo.longitude), degreesLat(geo.latitude), geo.height * 1000);
}

/**
 * A real Cesium camera pose (position/direction/up + frustum) — the
 * on-screen scan runs a genuine horizon-occluder + frustum-culling check, so
 * the fixture needs values those real Cesium types accept, not stubs.
 * @param {Cesium.Cartesian3} positionWC Camera position, ECEF, looking at Earth's center.
 * @returns {{positionWC: Cesium.Cartesian3, directionWC: Cesium.Cartesian3, upWC: Cesium.Cartesian3, frustum: Cesium.PerspectiveFrustum}}
 */
function cameraLookingAtEarthCenterFrom(positionWC) {
  const directionWC = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.negate(positionWC, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const eastish = Cesium.Cartesian3.cross(directionWC, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
  const upWC = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(eastish, directionWC, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const frustum = new Cesium.PerspectiveFrustum();
  frustum.fov = Cesium.Math.toRadians(60);
  frustum.aspectRatio = 800 / 600;
  frustum.near = 1;
  frustum.far = 5e8;
  return { positionWC, directionWC, upWC, frustum };
}

/** A camera parked far out, directly over the ISS's current sub-satellite point. */
function overheadCamera() {
  const subPoint = currentIssPositionWC();
  const positionWC = Cesium.Cartesian3.multiplyByScalar(
    Cesium.Cartesian3.normalize(subPoint, new Cesium.Cartesian3()),
    20_000_000, // far enough out that a 60° FOV still frames the sub-point dead-center
    new Cesium.Cartesian3(),
  );
  return cameraLookingAtEarthCenterFrom(positionWC);
}

/** A camera on the opposite side of the globe — the ISS is never horizon-visible from here. */
function farSideCamera() {
  const overhead = overheadCamera();
  const positionWC = Cesium.Cartesian3.negate(overhead.positionWC, new Cesium.Cartesian3());
  return cameraLookingAtEarthCenterFrom(positionWC);
}

test('the ISS on screen holds continuous render; moved off screen it releases', () => {
  const viewer = { scene: { frameState: { frameNumber: 1 } } };
  _resetRenderGovernorForTest();
  installRenderGovernor(viewer);
  _setDenseCatalogStateForTest({ catalog: 'core', showPoints: true });
  _setCameraForTest(overheadCamera());
  _addCoreCatalogEntryForTest(25544, ISS_SATREC);
  try {
    _runSatellitePreRenderForTest();
    assert.equal(
      getRenderGovernorDiagnostics().mode,
      'continuous',
      'the ISS sits directly under an overhead camera — the scan must find it on screen and hold',
    );
    assert.ok(getRenderGovernorDiagnostics().holds.includes('satellites'));

    // Swing the same viewer to the far side of the globe — same catalog, same
    // point, nothing else changed but the camera pose the scan tests against.
    // Force the throttle so this second scan isn't swallowed by the real 1s
    // gate (both calls land in the same test millisecond).
    _setCameraForTest(farSideCamera());
    _forceNextPropagationForTest();
    _runSatellitePreRenderForTest();
    assert.equal(
      getRenderGovernorDiagnostics().mode,
      'idle',
      'the ISS is on the far side of the globe from this camera — nothing to animate on screen',
    );
    assert.deepEqual(getRenderGovernorDiagnostics().holds, []);
  } finally {
    _clearDenseCatalogStateForTest();
    _resetRenderGovernorForTest();
  }
});

test('hiding satellite points releases the hold even with the ISS on screen', () => {
  const viewer = { scene: { frameState: { frameNumber: 1 } } };
  _resetRenderGovernorForTest();
  installRenderGovernor(viewer);
  _setDenseCatalogStateForTest({ catalog: 'core', showPoints: false });
  _setCameraForTest(overheadCamera());
  _addCoreCatalogEntryForTest(25544, ISS_SATREC);
  try {
    _runSatellitePreRenderForTest();
    assert.equal(
      getRenderGovernorDiagnostics().mode,
      'idle',
      'showPoints is off — the layer has nothing on screen to animate regardless of what would be visible',
    );
  } finally {
    _clearDenseCatalogStateForTest();
    _resetRenderGovernorForTest();
  }
});

// Dropping the unconditional hold (perf wave 3) is only safe if enable() with
// something already visible does not wait a tick to hold — enable() sets
// _anyPointOnScreen = true before the sync call specifically to cover this.
test('enable() fails toward continuous immediately, before the first scan settles', () => {
  const hadDocument = Object.hasOwn(globalThis, 'document');
  const priorDocument = globalThis.document;
  globalThis.document = { addEventListener() {}, removeEventListener() {} };

  const canvas = { addEventListener() {}, removeEventListener() {}, clientWidth: 800, clientHeight: 600 };
  const viewer = {
    scene: {
      frameState: { frameNumber: 1 },
      primitives: { add: (p) => p, remove() {} },
      canvas,
      pick: () => undefined,
      preRender: new Cesium.Event(),
    },
    entities: new Cesium.EntityCollection(),
    trackedEntityChanged: new Cesium.Event(),
    camera: overheadCamera(),
  };
  _resetRenderGovernorForTest();
  installRenderGovernor(viewer);
  try {
    satellitesLayer.enable(viewer);
    assert.equal(
      getRenderGovernorDiagnostics().mode,
      'continuous',
      'enable() must hold immediately — a layer enabled with something already visible cannot wait a tick',
    );
  } finally {
    satellitesLayer.disable(viewer);
    _resetRenderGovernorForTest();
    if (hadDocument) globalThis.document = priorDocument;
    else delete globalThis.document;
  }
});
