// Sudut (camera angle) first-run default — the three surfaces that must agree.
//
// A sibling of reasonableDefaults.test.mjs rather than a section inside it:
// this pin pushed that file past the 20,000-character limit (Rule 8), and
// growing an already-large file to avoid a second small one is the trade that
// produced every god file in this repo. Same three-part shape as its sibling
// (the first-run VALUE at every surface that independently decides it,
// explicit state still WINNING over it, and the surrounding machinery intact).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { ShareLinkManager } from './sharelink.js';
import {
  CAMERA_ANGLE_MODES,
  CAMERA_ANGLE_MODE_DEFAULT,
  getCameraAngleMode,
  setCameraAngleMode,
  _resetCameraAngleModeForTest,
} from './cameraAngleMode.js';

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const shareSource = fs.readFileSync(new URL('./sharelink.js', import.meta.url), 'utf8');
// Read uiConstants.js directly: GLOBAL_POST_DEFAULTS lives there, and reaching
// it through readLayerSourceText's ui.js concatenation would make this pin
// depend on the split-class sibling order for no gain.
const constantsSource = fs.readFileSync(new URL('./uiConstants.js', import.meta.url), 'utf8');

/** Slice uiConstants.js between two literal anchors, so a pin reads one object, not the file. */
function constantsBlock(start, end) {
  const startIndex = constantsSource.indexOf(start);
  assert.ok(startIndex >= 0, `missing source anchor: ${start}`);
  const endIndex = constantsSource.indexOf(end, startIndex + start.length);
  assert.ok(endIndex > startIndex, `missing source anchor: ${end}`);
  return constantsSource.slice(startIndex, endIndex);
}

/** A ShareLinkManager over a synthetic hash — enough surface for parseInitialHash. */
function managerForHash(hash) {
  globalThis.window = { location: { hash, href: `http://localhost/${hash}` } };
  globalThis.history = { replaceState(_s, _t, next) { window.location.hash = next; } };
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


test('first run opens in Samping, at every surface that decides it', () => {
  // SAMPING is the default because "default" means "what you get having said
  // nothing", and what this app did at every pitch-bearing seam before the
  // control existed was curated/oblique. ATAS-by-default would silently re-aim
  // every existing flight.
  assert.equal(CAMERA_ANGLE_MODE_DEFAULT, CAMERA_ANGLE_MODES.SAMPING,
    'owner request 2026-10-28: Samping is the no-op mode, so it is the default');
  assert.equal(getCameraAngleMode(), CAMERA_ANGLE_MODE_DEFAULT,
    'the live module starts there too');
  // Surface 2: the first-load baseline READS the constant rather than
  // restating it, so the two cannot drift.
  const baseline = constantsBlock('const GLOBAL_POST_DEFAULTS = {', '\n};');
  assert.match(baseline, /cameraAngle: CAMERA_ANGLE_MODE_DEFAULT,/,
    'uiConstants.js: the baseline imports the constant, never a literal');
  assert.doesNotMatch(baseline, /cameraAngle: '(atas|samping)'/,
    'a re-literalized default is exactly the drift this pin exists to catch');
  // Surface 3: the shipped markup. A default is not real until the control
  // the operator sees agrees with it.
  assert.match(indexHtml, /class="pp-mode-btn active" id="camera-angle-samping"/,
    'index.html: Samping is the pre-selected segment');
  assert.match(indexHtml, /id="camera-angle-samping"[^>]*aria-checked="true"/,
    'index.html: and assistive tech is told the same thing');
  assert.match(indexHtml, /id="camera-angle-atas"[^>]*aria-checked="false"/);
  assert.match(shareSource, /this\._cameraAngle = CAMERA_ANGLE_MODE_DEFAULT;/,
    'sharelink.js: the generator starts from the same value the module starts at');
});

test('an explicit mode still wins, and a link without ca keeps its author\'s oblique framing', () => {
  assert.equal(managerForHash('#lat=10&lon=20&ca=atas').parseInitialHash().cameraAngle,
    CAMERA_ANGLE_MODES.ATAS);
  assert.equal(managerForHash('#lat=10&lon=20&ca=samping').parseInitialHash().cameraAngle,
    CAMERA_ANGLE_MODES.SAMPING);
  // Unlike `ko`/`sci`, a pre-`ca` link needs no era-specific fallback: every
  // such link was authored when curated/oblique was the ONLY behavior, so the
  // current default already restores what its author saw.
  assert.equal(managerForHash('#lat=10&lon=20&style=normal').parseInitialHash().cameraAngle,
    CAMERA_ANGLE_MODE_DEFAULT,
    'a pre-ca link restores the author\'s view, which is the default');
  // And the mode is a preference for future flights, not an override of the
  // pose the link restores — the raw `pitch` survives alongside it.
  const both = managerForHash('#lat=10&lon=20&pitch=-30&ca=atas').parseInitialHash();
  assert.equal(both.cameraAngle, CAMERA_ANGLE_MODES.ATAS);
  assert.equal(both.pitch, -30, 'ca must not re-aim the camera the link just restored');

  setCameraAngleMode(CAMERA_ANGLE_MODES.ATAS);
  assert.equal(getCameraAngleMode(), CAMERA_ANGLE_MODES.ATAS, 'the control still reaches Atas');
  _resetCameraAngleModeForTest();
});
