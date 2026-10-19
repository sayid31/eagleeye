// StyleManager detection overlay UI: mode, density, fade, allocation and presets.
import { ALLOCATION_STRATEGIES, canonicalizeDensity, normalizeAllocationStrategy } from './data/detectionPolicy.js';
import { DETECTION_ALLOCATION_STORAGE_KEY } from './uiConstants.js';
import {
  getMode as getDetectionMode,
  getDetectionTuning,
  setMode as setDetectionModeByLabel,
  setDetectionTuning,
} from './data/detection.js';
import { getKeyholeFadeTuning, setKeyholeFadeTuning } from './celestialRing.js';

/** Indonesian display names for the detection density profiles (state values stay English). */
const DETECTION_MODE_LABELS_ID = { SPARSE: 'jarang', BALANCED: 'seimbang', DENSE: 'padat' };

export const detectionUiMixin = {
/**
   * Reads and canonicalizes the five-stop density control. The engine derives
   * Sparse/Balanced/Dense from the same stop.
   * @returns {void}
   */
  _applyDetectionDensityFromUi() {
    if (!this._detectionDensitySlider) return;
    const pct = canonicalizeDensity(this._detectionDensitySlider.value);
    this._detectionDensitySlider.value = String(pct);
    if (this._detectionDensityValue) this._detectionDensityValue.textContent = `${pct}%`;
    setDetectionTuning({ densityPct: pct });
    this._updateDetectionButton(getDetectionMode());
  },

/** Apply responsive keyhole fade controls from normalized UI percentages. */
  _applyDetectionFadeFromUi() {
    const fadePct = Math.max(0, Math.min(40, Math.round(Number(this._detectionFadeSlider?.value) || 0)));
    const outsideOpacityValue = this._detectionOpacitySlider?.value;
    const outsideOpacityPct = Math.max(
      0,
      Math.min(100, Math.round(outsideOpacityValue == null ? 3 : Number(outsideOpacityValue) || 0)),
    );
    if (this._detectionFadeSlider) this._detectionFadeSlider.value = String(fadePct);
    if (this._detectionFadeValue) this._detectionFadeValue.textContent = `${fadePct}%`;
    if (this._detectionOpacitySlider) this._detectionOpacitySlider.value = String(outsideOpacityPct);
    if (this._detectionOpacityValue) this._detectionOpacityValue.textContent = `${outsideOpacityPct}%`;
    setKeyholeFadeTuning({
      fadeRatio: fadePct / 100,
      outsideOpacity: outsideOpacityPct / 100,
    });
    this.viewer.scene.requestRender?.();
  },

_setDetectionAllocation(strategy, { syncShare = true, persist = true } = {}) {
    const raw = String(strategy || '').trim().toUpperCase();
    if (!ALLOCATION_STRATEGIES.includes(raw)) return false;
    const normalized = normalizeAllocationStrategy(raw);
    this._detectionAllocationPreference = normalized;
    setDetectionTuning({ allocationStrategy: normalized });
    for (const button of this._detectionAllocationBtns) {
      const active = button.dataset.allocation === normalized;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    if (persist) {
      try { localStorage.setItem(DETECTION_ALLOCATION_STORAGE_KEY, normalized); } catch { /* best effort */ }
    }
    if (syncShare) this._syncShareState();
    return true;
  },

_syncDetectionUiFromEngine() {
    const tuning = getDetectionTuning();
    if (this._detectionDensitySlider) this._detectionDensitySlider.value = String(tuning.densityPct);
    if (this._detectionDensityValue) this._detectionDensityValue.textContent = `${tuning.densityPct}%`;
    this._setDetectionAllocation(tuning.allocationStrategy, { syncShare: false, persist: false });
    const fadeTuning = getKeyholeFadeTuning();
    if (this._detectionFadeSlider) this._detectionFadeSlider.value = String(Math.round(fadeTuning.fadeRatio * 100));
    if (this._detectionOpacitySlider) {
      this._detectionOpacitySlider.value = String(Math.round(fadeTuning.outsideOpacity * 100));
    }
    this._applyDetectionFadeFromUi();
    this._updateDetectionButton(getDetectionMode());
  },

/**
   * Activates a detection overlay mode by label (e.g. 'OFF', 'SPARSE', 'PANOPTIC').
   * @param {string} modeLabel - Detection mode label to set.
   * @returns {void}
   */
  _setDetectionMode(modeLabel) {
    if (!modeLabel) return;
    setDetectionModeByLabel(modeLabel);
    this._syncDetectionUiFromEngine();
    this._syncShareState();
  },

/**
   * Switches the HUD layout variant (e.g. 'tactical', 'minimal') and syncs
   * the layout dropdown if present.
   * @param {string} variantName - HUD variant identifier.
   * @returns {void}
   */
  _setHudVariant(variantName) {
    if (!variantName) return;
    this.hud.setVariant(variantName);
    if (this._hudLayoutSelect && this._hudLayoutSelect.value !== this.hud.getVariant()) {
      this._hudLayoutSelect.value = this.hud.getVariant();
    }
    this._syncShareState();
    this._scheduleAdaptivePanelLayout({ settle: true });
  },

/**
   * Updates the detection toggle button label and CSS classes to reflect
   * the current density-derived profile. Also toggles the density and
   * allocation controls together.
   * @param {string} modeLabel - Current detection mode label.
   * @returns {void}
   */
  _updateDetectionButton(modeLabel) {
    const btn = this._detectionBtn;
    const enabled = modeLabel !== 'OFF';
    btn.setAttribute('aria-pressed', String(enabled));
    btn.setAttribute('aria-label', enabled
      ? `Overlay deteksi: ${DETECTION_MODE_LABELS_ID[modeLabel] || String(modeLabel).toLowerCase()}`
      : 'Overlay deteksi: mati');
    btn.classList.remove('active', 'god', 'panoptic');
    if (modeLabel === 'SPARSE') {
      btn.querySelector('.pp-label').textContent = DETECTION_MODE_LABELS_ID.SPARSE.toUpperCase();
      btn.classList.add('active');
    } else if (modeLabel === 'BALANCED') {
      btn.querySelector('.pp-label').textContent = DETECTION_MODE_LABELS_ID.BALANCED.toUpperCase();
      btn.classList.add('active');
    } else if (modeLabel === 'DENSE') {
      btn.querySelector('.pp-label').textContent = DETECTION_MODE_LABELS_ID.DENSE.toUpperCase();
      btn.classList.add('active', 'panoptic');
    } else {
      btn.querySelector('.pp-label').textContent = 'DETEKSI';
    }

    if (this._detectionSliderRow) {
      this._detectionSliderRow.classList.toggle('visible', modeLabel !== 'OFF');
    }
    if (this._detectionAllocationRow) {
      this._detectionAllocationRow.classList.toggle('visible', modeLabel !== 'OFF');
    }
    if (this._detectionFadeRow) {
      this._detectionFadeRow.classList.toggle('visible', modeLabel !== 'OFF');
    }
    if (this._detectionOpacityRow) {
      this._detectionOpacityRow.classList.toggle('visible', modeLabel !== 'OFF');
    }
    this._layoutRightPanels();
  },
};

