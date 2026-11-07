// src/cctvCalibrationMixin.js
/**
 * CCTV calibration: the click-to-edit pose readout, reset, and CAL badge copy.
 *
 * Part of the StyleManager CCTV panel prototype mixin, split out of
 * `cctvPanelMixin.js` to keep each file within its size budget. Same contract
 * as that file: methods run with `this` bound to the StyleManager instance and
 * are `Object.assign`ed onto its prototype through `cctvPanelMixin`.
 */

/** Shortest-wrap signed degrees, for heading offsets typed as absolute values. */
const signedNormalizeDeg = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * Field definitions for the CCTV click-to-edit pose readout. Chips DISPLAY the
 * camera's EFFECTIVE pose (not raw offsets — "HDG 135.0°" instead of the old
 * "HEADING 0°" nonsense); typed values convert back to calibration offsets
 * against the frozen basePose. ΔN/ΔE stay offset-denominated (absolute lat/lon
 * typing is user-hostile).
 */
const CCTV_CAL_FIELDS = {
  heading: {
    label: 'HDG', unit: '°', decimals: 1,
    get: (cam) => cam.headingDeg,
    toPatch: (value, base) => ({ headingDeg: signedNormalizeDeg(value - base.headingDeg) }),
  },
  pitch: {
    label: 'PITCH', unit: '°', decimals: 1,
    get: (cam) => cam.pitchDeg,
    toPatch: (value, base) => ({ pitchDeg: value - base.pitchDeg }),
  },
  fov: {
    label: 'FOV', unit: '°', decimals: 0,
    get: (cam) => cam.fovDeg,
    toPatch: (value, base) => ({ fovDeg: value - base.fovDeg }),
  },
  range: {
    label: 'RANGE', unit: 'm', decimals: 0,
    get: (cam) => cam.rangeM,
    toPatch: (value, base) => ({ rangeScale: base.rangeM > 0 ? value / base.rangeM : 1 }),
  },
  height: {
    label: 'HGT', unit: 'm', decimals: 0,
    get: (cam) => cam.mountHeightM,
    toPatch: (value, base) => ({ heightM: value - base.mountHeightM }),
  },
  north: {
    label: 'ΔN', unit: 'm', decimals: 1,
    get: (cam) => cam.calibration?.offsetNorthM || 0,
    toPatch: (value) => ({ offsetNorthM: value }),
  },
  east: {
    label: 'ΔE', unit: 'm', decimals: 1,
    get: (cam) => cam.calibration?.offsetEastM || 0,
    toPatch: (value) => ({ offsetEastM: value }),
  },
};

export const cctvCalibrationMixin = {
  /**
   * Resets calibration for the active CCTV camera to its server defaults.
   * @returns {void}
   */
  _resetCctvCalibration() {
    const cameraId = this._activeCctvCameraId();
    if (!cameraId || !this._dataManager) return;
    this._dataManager.setLayerParams('cctv', {
      selectedCameraId: cameraId,
      calibration: {
        cameraId,
        reset: true,
      },
    }, { origin: 'user' });
    this._showToast('Kalibrasi CCTV diatur ulang');
  },

  /**
   * Swaps a readout chip's text for an inline number input. Enter/blur commits
   * (converted to a calibration offset patch), Escape cancels. The next state
   * re-render restores the chip text either way.
   * @param {HTMLButtonElement} chip - The clicked `.cctv-cal-value` element.
   * @returns {void}
   */
  _beginCctvCalValueEdit(chip) {
    const field = CCTV_CAL_FIELDS[chip.dataset.calField];
    const activeCamera = this._cctvState?.activeCamera;
    if (!field || !activeCamera?.basePose) return;
    const startValue = field.get(activeCamera);
    const input = document.createElement('input');
    input.type = 'number';
    input.step = field.decimals > 0 ? '0.1' : '1';
    input.value = Number(startValue).toFixed(field.decimals);
    input.className = 'cctv-cal-input';
    chip.textContent = `${field.label} `;
    chip.appendChild(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (commit) => {
      if (finished) return;
      finished = true;
      const typed = parseFloat(input.value);
      input.remove();
      if (commit && Number.isFinite(typed)) {
        const cameraId = this._activeCctvCameraId();
        if (cameraId && this._dataManager) {
          this._dataManager.setLayerParams('cctv', {
            selectedCameraId: cameraId,
            calibration: { cameraId, patch: field.toPatch(typed, activeCamera.basePose) },
          }, { origin: 'user' });
          return; // re-render restores the chip text from fresh state
        }
      }
      this._syncCctvCalReadout(!!this._cctvState?.enabled, this._cctvState?.activeCamera || null);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') finish(false);
      event.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (event) => event.stopPropagation());
  },

  /**
   * Synchronizes the pose readout chips, ADJUST button, and SAVE/RESET
   * disabled states with the active camera.
   * @param {boolean} enabled - Whether the CCTV layer is currently enabled.
   * @param {object|null} activeCamera - The active camera data object (may be null).
   * @returns {void}
   */
  _syncCctvCalReadout(enabled, activeCamera) {
    const canCalibrate = !!enabled && !!activeCamera;
    if (this._cctvAdjustBtn) {
      const adjustOn = !!this._cctvState?.calibrationMode;
      this._cctvAdjustBtn.classList.toggle('active', adjustOn && canCalibrate);
      this._cctvAdjustBtn.textContent = adjustOn ? 'ATUR AKTIF' : 'ATUR';
      this._cctvAdjustBtn.disabled = !canCalibrate;
    }
    if (this._cctvCalReadout) {
      for (const chip of this._cctvCalReadout.querySelectorAll('.cctv-cal-value')) {
        if (chip.querySelector('input')) continue; // an edit is in flight — don't clobber
        const field = CCTV_CAL_FIELDS[chip.dataset.calField];
        if (!field) continue;
        const value = canCalibrate ? field.get(activeCamera) : null;
        chip.textContent = Number.isFinite(value)
          ? `${field.label} ${Number(value).toFixed(field.decimals)}${field.unit}`
          : `${field.label} --`;
        chip.disabled = !canCalibrate;
      }
    }
    for (const el of [this._cctvCalibSaveBtn, this._cctvCalibResetBtn]) {
      if (el) el.disabled = !canCalibrate;
    }
  },

  /**
   * Maps a `deriveCalBadge` value (cctv.js) to its panel copy. Single source
   * of truth for CAL-badge casing — used by both the quality chip and the
   * meta line so the two never drift onto different label conventions.
   * @param {'calibrated'|'curated'|'raw-prior'|null} badge - Badge state from cctv.js.
   * @returns {string} Display label, or '--' when there is no active camera.
   */
  _calBadgeLabel(badge) {
    switch (badge) {
      case 'calibrated': return 'CALIBRATED';
      case 'curated': return 'CURATED';
      case 'raw-prior': return 'RAW PRIOR';
      default: return '--';
    }
  },
};
