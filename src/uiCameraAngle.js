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
import {
  getCameraAngleMode,
  isCameraAngleMode,
  setCameraAngleMode,
} from './cameraAngleMode.js';

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
   * Set the standing camera angle. Governs every pitch-bearing flight from the
   * next one onward; it does not move the camera now, which is why a share
   * link's own `pitch` can restore a pose without this fighting it.
   *
   * @param {string} mode - 'atas' (top-down) or 'samping' (oblique).
   * @param {{syncShare?: boolean}} [options]
   * @returns {{ok: boolean, cameraAngle: string, error?: string}}
   */
  setCameraAngle(mode, { syncShare = true } = {}) {
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
    if (syncShare) this.shareLinkManager?.claimRestoreLane?.('visual');
    const applied = setCameraAngleMode(mode);
    this._syncCameraAngleButtonState();
    if (syncShare) this._syncShareState();
    return { ok: true, cameraAngle: applied };
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
