// `ca` share-link round-trip — the persisted Sudut (camera angle) mode.
//
// The test that matters most here is the last one: `ca` and the long-standing
// raw `pitch` key are ORTHOGONAL. `pitch` is an observation of where the
// sender's camera actually was and governs the restored pose; `ca` is a
// preference for FUTURE flights. A link carrying both must parse both
// independently — neither may overwrite the other.
//
// Own file rather than appended to sharelink.celestial.test.mjs, which is
// already over the 400-line test budget (Rule 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShareLinkManager } from './sharelink.js';
import { CAMERA_ANGLE_MODES, CAMERA_ANGLE_MODE_DEFAULT } from './cameraAngleMode.js';

function makeManager(hash = '') {
  globalThis.window = { location: { hash, href: `http://localhost/${hash}` } };
  globalThis.history = {
    replaceState(_state, _title, nextHash) {
      window.location.hash = nextHash;
    },
  };
  const viewer = {
    camera: {
      changed: { addEventListener() {} },
      positionCartographic: { latitude: 0, longitude: 0, height: 1000 },
      heading: 0,
      pitch: -Math.PI / 2,
      roll: 0,
    },
  };
  return new ShareLinkManager(viewer);
}

function hashParam(key) {
  return new URLSearchParams(window.location.hash.slice(1)).get(key);
}

test('an absent ca resolves to the default mode — every pre-ca link was authored when curated/oblique was the only behavior', () => {
  const parsed = makeManager('#lat=10&lon=20&style=normal').parseInitialHash();
  assert.equal(parsed.cameraAngle, CAMERA_ANGLE_MODE_DEFAULT);
  assert.equal(parsed.cameraAngle, CAMERA_ANGLE_MODES.SAMPING);
});

test('ca parses both modes', () => {
  assert.equal(
    makeManager('#lat=10&lon=20&ca=atas').parseInitialHash().cameraAngle,
    CAMERA_ANGLE_MODES.ATAS,
  );
  assert.equal(
    makeManager('#lat=10&lon=20&ca=samping').parseInitialHash().cameraAngle,
    CAMERA_ANGLE_MODES.SAMPING,
  );
});

test('an unrecognized ca falls back to the default instead of propagating junk', () => {
  for (const junk of ['top', 'ATAS2', '3d', '-90', '']) {
    assert.equal(
      makeManager(`#lat=10&lon=20&ca=${junk}`).parseInitialHash().cameraAngle,
      CAMERA_ANGLE_MODE_DEFAULT,
      `ca=${junk} must not reach state`,
    );
  }
});

test('ca is always written on serialization, so a shared link never relies on the reader default', () => {
  const manager = makeManager();
  manager.onToggleChange(false, false, { cameraAngle: CAMERA_ANGLE_MODES.ATAS });
  clearTimeout(manager._debounceTimer);
  manager._updateHash();
  assert.equal(hashParam('ca'), 'atas');

  manager.onToggleChange(false, false, { cameraAngle: CAMERA_ANGLE_MODES.SAMPING });
  clearTimeout(manager._debounceTimer);
  manager._updateHash();
  assert.equal(hashParam('ca'), 'samping');
});

test('onToggleChange normalizes an invalid extras value before it reaches state', () => {
  const manager = makeManager();
  manager.onToggleChange(false, false, { cameraAngle: 'sideways' });
  clearTimeout(manager._debounceTimer);
  manager._updateHash();
  assert.equal(hashParam('ca'), CAMERA_ANGLE_MODE_DEFAULT);
});

test('a non-string cameraAngle is ignored, leaving the prior mode standing', () => {
  const manager = makeManager();
  manager.onToggleChange(false, false, { cameraAngle: CAMERA_ANGLE_MODES.ATAS });
  manager.onToggleChange(false, false, { cameraAngle: 42 });
  clearTimeout(manager._debounceTimer);
  manager._updateHash();
  assert.equal(hashParam('ca'), 'atas', 'a bad write must not silently reset the mode');
});

test('ca and the raw pitch coexist: pitch governs the restored pose, ca governs the next flight', () => {
  const parsed = makeManager('#lat=10&lon=20&pitch=-30&ca=atas').parseInitialHash();
  assert.equal(parsed.cameraAngle, CAMERA_ANGLE_MODES.ATAS, 'the mode comes from ca');
  assert.equal(parsed.pitch, -30, 'the restored pitch comes from pitch, untouched by ca=atas');
});

test('a pitch-only link still restores its pose and reports the default mode', () => {
  const parsed = makeManager('#lat=10&lon=20&pitch=-12').parseInitialHash();
  assert.equal(parsed.pitch, -12);
  assert.equal(parsed.cameraAngle, CAMERA_ANGLE_MODE_DEFAULT);
});
