/**
 * DISPLAY-rail Sudut (camera angle) control — the UI half of cameraAngleMode.js.
 *
 * Its own mixin rather than an addition to uiPublicApi.js, where the comparable
 * setCelestialRingEnabled lives: that file is already over the 20,000-character
 * file-health limit. Mixins all land on the same prototype, so `setCameraAngle`
 * is reachable exactly as if it had been declared there — this split costs
 * nothing at the call site and keeps a capped file from growing. Do not merge
 * this back in without splitting uiPublicApi.js first.
 *
 * The mode itself lives in cameraAngleMode.js as a module singleton, because
 * four non-UI modules (locations, cctvActivation, worldFocus, camera) read it at
 * flight time and none of them should take a StyleManager dependency.
 */
import * as Cesium from 'cesium';
import {
  getCameraAngleMode,
  isCameraAngleMode,
  setCameraAngleMode,
} from './cameraAngleMode.js';
import { planTiltInPlace } from './cameraAngleTilt.js';

export const cameraAngleMixin = {
  _initCameraAngleControl() {
    for (const button of this._cameraAngleBtns || []) {
      if (!button) continue;
      button.addEventListener('click', () => {
        this.setCameraAngle(button.dataset.cameraAngle);
      });
    }
    this._syncCameraAngleButtonState();
  },

  /**
   * Set the standing camera angle.
   *
   * Does two things, and they are separable on purpose. It governs every
   * pitch-bearing flight from the next one onward, AND — when `tilt` is left on
   * — it re-aims the camera where it currently stands, so the control answers
   * immediately instead of reading as a dead button.
   *
   * `tilt: false` is what the restore paths pass. A share link carries the
   * sender's own `pitch`, and tilting on restore would move the recipient away
   * from the framing the link exists to reproduce — the same reason the restore
   * contract has `pitch` beat `ca`. See docs/DECISIONS.md 2026-10-28.
   *
   * @param {string} mode - 'atas' (top-down) or 'samping' (oblique).
   * @param {{syncShare?: boolean, tilt?: boolean}} [options]
   * @returns {{ok: boolean, cameraAngle: string, tilted?: boolean, tiltReason?: string, error?: string}}
   */
  setCameraAngle(mode, { syncShare = true, tilt = true } = {}) {
    // Rejects rather than coerces: this is the public setter, so a caller that
    // passed junk is told so instead of silently getting the default.
    if (!isCameraAngleMode(mode)) {
      return {
        ok: false,
        cameraAngle: getCameraAngleMode(),
        error: `Invalid camera angle mode: ${mode}`,
      };
    }
    if (typeof syncShare !== 'boolean') {
      return {
        ok: false,
        cameraAngle: getCameraAngleMode(),
        error: 'Opsi sudut kamera harus boolean',
      };
    }
    if (typeof tilt !== 'boolean') {
      return {
        ok: false,
        cameraAngle: getCameraAngleMode(),
        error: 'Opsi sudut kamera harus boolean',
      };
    }
    if (syncShare) this.shareLinkManager?.claimRestoreLane?.('visual');
    const applied = setCameraAngleMode(mode);
    this._syncCameraAngleButtonState();
    if (syncShare) this._syncShareState();
    const tilted = tilt ? this._tiltCameraToAngle(applied) : { tilt: false, reason: 'not-requested' };
    return { ok: true, cameraAngle: applied, tilted: tilted.tilt, tiltReason: tilted.reason };
  },

  /**
   * Re-aim the live camera at the current mode without moving where it looks.
   *
   * The geometry decision lives in cameraAngleTilt.js as a pure function; this
   * is only the Cesium half — resolve the aim point, measure the standoff, hand
   * both to the planner, and fly if it says to.
   *
   * @param {string} mode
   * @returns {{tilt: boolean, reason: string}}
   */
  _tiltCameraToAngle(mode) {
    const viewer = this.viewer;
    const camera = viewer?.camera;
    if (!camera || !viewer.scene) return { tilt: false, reason: 'no-viewer' };

    // What the camera is aimed at, not where it is. pickEllipsoid returns null
    // when the view axis misses the planet entirely (looking past the limb), and
    // the planner treats that as "no in-place to pivot around".
    const target = viewer.scene.globe
      ? camera.pickEllipsoid(
        new Cesium.Cartesian2(
          viewer.scene.canvas.clientWidth / 2,
          viewer.scene.canvas.clientHeight / 2,
        ),
        viewer.scene.globe.ellipsoid,
      )
      : null;

    const plan = planTiltInPlace({
      mode,
      altitudeM: camera.positionCartographic?.height,
      currentPitchDeg: Cesium.Math.toDegrees(camera.pitch),
      targetDistanceM: target ? Cesium.Cartesian3.distance(camera.position, target) : 0,
      cockpitActive: document.body?.classList.contains('cockpit-mode'),
      trackingActive: Boolean(viewer.trackedEntity),
      targetResolved: Boolean(target),
    });
    if (!plan.tilt) return { tilt: false, reason: plan.reason };

    // flyToBoundingSphere with a zero-radius sphere is the same centering
    // guarantee flyToLandmark relies on: the offset is interpreted relative to
    // the target, so heading and distance survive while only the pitch moves.
    camera.cancelFlight();
    camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 0), {
      offset: new Cesium.HeadingPitchRange(
        camera.heading,
        Cesium.Math.toRadians(plan.pitchDeg),
        plan.rangeM,
      ),
      duration: plan.durationS,
    });
    return { tilt: true, reason: plan.reason };
  },

  _syncCameraAngleButtonState() {
    const active = getCameraAngleMode();
    for (const button of this._cameraAngleBtns || []) {
      if (!button) continue;
      const isActive = button.dataset.cameraAngle === active;
      button.classList.toggle('active', isActive);
      // Without this the selected mode is a colour to a sighted operator and
      // nothing at all to a screen reader — same reasoning as the aria-pressed
      // sync on #models3d-toggle. role="radio" makes aria-checked the correct
      // attribute here rather than aria-pressed.
      button.setAttribute('aria-checked', String(isActive));
    }
  },
};
