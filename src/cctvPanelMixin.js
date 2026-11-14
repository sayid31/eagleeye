import { runCctvLayerEnableTransition } from './cctvFocusPolicy.js';
import { cctvProviderDisplay } from './data/cctvProviderLabel.js';
import {
  shouldRebuildCctvCameraListbox,
  renderCctvCameraListboxOptions,
  syncCctvCameraListboxState,
} from './cctvCameraListbox.js';
import { cctvCalibrationMixin } from './cctvCalibrationMixin.js';
import { cctvFrameMixin } from './cctvFrameMixin.js';
import { cctvListboxMixin } from './cctvListboxMixin.js';

/**
 * Orders the camera dropdown list so unofficial/demo-only sources (see
 * DATA_SOURCES.md) sort to the top, ahead of the ~500 live-pack cameras they'd
 * otherwise be buried under — display order only, does not touch cctv.js's
 * `_records` order (autoHop/cycleCamera sequencing, default-camera selection
 * are unaffected). Stable: ties keep the server's original order.
 * @param {Object[]} cameras - `state.cameras` from the CCTV layer's UI state.
 * @returns {Object[]} The same camera objects, reordered.
 */
export function orderCctvCameraOptions(cameras) {
  return cameras
    .map((camera, idx) => ({ camera, idx }))
    .sort((a, b) => {
      const aUnofficial = String(a.camera.sourceKind || '').startsWith('unofficial') ? 0 : 1;
      const bUnofficial = String(b.camera.sourceKind || '').startsWith('unofficial') ? 0 : 1;
      return aUnofficial - bUnofficial || a.idx - b.idx;
    })
    .map(({ camera }) => camera);
}

/**
 * Prototype mixin for StyleManager (see `ui.js`): CCTV panel wiring, calibration
 * inline-edit, frame preload/settle, and the full state-driven panel re-render.
 *
 * Every method here still runs with `this` bound to the live StyleManager
 * instance, reading the same constructor-initialized fields ui.js declares
 * (`_cctvPanel`, `_cctvState`, `_cctvFrame`, etc.) and calling sibling methods
 * defined elsewhere on the prototype (e.g. `_showToast`, `_updateCctvSyncChip`,
 * `setPanelCollapsed`, `_syncCctvPanelViewport`, `_runExplicitNavigation`) via
 * ordinary `this.foo()` calls — file location does not affect `this` binding
 * or method dispatch.
 *
 * This is a mechanical method-body relocation to shrink `ui.js`, not a logic
 * extraction: unlike the repo's usual "pure policy function" modules
 * (`cctvFocusPolicy.js`, `panelStackLayout.js`, `rightRailPolicy.js`, ...),
 * this file's exported object is `Object.assign`ed directly onto
 * `StyleManager.prototype` in `ui.js`. `StyleManager` remains ONE class; this
 * is just where a chunk of its methods happen to be typed out. Please don't
 * "fix" this into a delegate/composed object — the whole point is that no
 * call site anywhere in `ui.js` needed to change.
 *
 * The listbox, frame/badge and calibration methods live in
 * `cctvListboxMixin.js`, `cctvFrameMixin.js` and `cctvCalibrationMixin.js`
 * (size budget) and are spread in here, so `ui.js` still assigns one object.
 */
export const cctvPanelMixin = {
  ...cctvListboxMixin,
  ...cctvFrameMixin,
  ...cctvCalibrationMixin,

  /**
   * Activates an explicit CCTV target, then releases tracking before its camera
   * flight. Cockpit mode keeps tracking and suppresses only the flight.
   * @param {Function} activate CCTV target activation returning its camera ID.
   * @param {Function} focus CCTV camera flight receiving the activated ID.
   * @returns {*} Focus operation result.
   */
  _runExplicitCctvFocus(activate, focus) {
    if (this._disposed) return false;
    const cameraId = activate();
    if (!cameraId) return false;
    return this._runExplicitNavigation('camera', () => focus(cameraId));
  },

  /**
   * Wires up all CCTV panel controls: enable/disable, nearest/prev/next camera,
   * camera picker listbox, focus, coverage, auto-hop, projection,
   * manual calibration sliders, and save/reset buttons.
   * @returns {void}
   */
  _initCctvPanel() {
    if (!this._cctvPanel) return;

    this._cctvEnableBtn?.addEventListener('click', async () => {
      await this._toggleCctvEnabled();
    });

    this._cctvNearestBtn?.addEventListener('click', async () => {
      if (!await this._toggleCctvEnabled(true)) return;
      this._runExplicitCctvFocus(
        () => this._dataManager?.callLayerMethod('cctv', 'focusNearest', { focus: false }),
        (cameraId) => this._dataManager?.focusCamera('cctv', cameraId, 1.8),
      );
    });

    this._cctvPrevBtn?.addEventListener('click', async () => {
      if (!await this._toggleCctvEnabled(true)) return;
      this._runExplicitCctvFocus(
        () => this._dataManager?.callLayerMethod('cctv', 'cycleCamera', -1),
        (cameraId) => this._dataManager?.focusCamera('cctv', cameraId, 1.4),
      );
    });

    this._cctvNextBtn?.addEventListener('click', async () => {
      if (!await this._toggleCctvEnabled(true)) return;
      this._runExplicitCctvFocus(
        () => this._dataManager?.callLayerMethod('cctv', 'cycleCamera', 1),
        (cameraId) => this._dataManager?.focusCamera('cctv', cameraId, 1.4),
      );
    });

    this._initCctvCameraListbox();

    this._cctvFocusBtn?.addEventListener('click', async () => {
      const selected = this._activeCctvCameraId();
      if (!selected) return;
      if (!await this._toggleCctvEnabled(true)) return;
      this._runExplicitCctvFocus(
        () => selected,
        (cameraId) => this._dataManager?.focusCamera('cctv', cameraId, 1.9),
      );
      this._dataManager?.setLayerParams('cctv', { selectedCameraId: selected }, { origin: 'user' });
    });

    this._cctvCoverageBtn?.addEventListener('click', () => {
      const current = this._cctvState?.coverageMode
        || (this._cctvState?.showCoverage ? 'on' : 'off');
      const next = current === 'off' ? 'on' : current === 'on' ? 'viewshed' : 'off';
      this._dataManager?.setLayerParams('cctv', { coverageMode: next }, { origin: 'user' });
    });

    this._cctvAutoHopBtn?.addEventListener('click', () => {
      const current = !!this._cctvState?.autoHop;
      this._dataManager?.setLayerParams('cctv', { autoHop: !current }, { origin: 'user' });
    });

    this._cctvProjectionBtn?.addEventListener('click', () => {
      const current = this._cctvState?.showProjection !== false;
      this._dataManager?.setLayerParams('cctv', { showProjection: !current }, { origin: 'user' });
    });

    this._cctvAdjustBtn?.addEventListener('click', () => {
      const current = !!this._cctvState?.calibrationMode;
      this._dataManager?.setLayerParams('cctv', { calibrationMode: !current }, { origin: 'user' });
    });

    // Click-to-edit pose readout: each chip swaps to a number input; Enter or
    // blur commits (converted to a calibration offset against basePose),
    // Escape cancels. Delegated so re-renders never re-bind.
    this._cctvCalReadout?.addEventListener('click', (event) => {
      const chip = event.target.closest?.('.cctv-cal-value');
      if (!chip || chip.disabled || chip.querySelector('input')) return;
      this._beginCctvCalValueEdit(chip);
    });

    this._cctvCalibSaveBtn?.addEventListener('click', () => {
      const cameraId = this._activeCctvCameraId();
      if (!cameraId || !this._dataManager) return;
      this._dataManager.setLayerParams('cctv', {
        selectedCameraId: cameraId,
        calibration: { cameraId, save: true },
      }, { origin: 'user' });
      this._showToast('Kalibrasi CCTV disimpan');
    });

    this._cctvCalibResetBtn?.addEventListener('click', () => {
      this._resetCctvCalibration();
    });

    this._renderCctvState(null);
    this._syncCctvPanelViewport();
  },

  /**
   * Toggles the CCTV layer enabled state. When enabling and no camera is active,
   * auto-focuses on the nearest camera.
   * @param {boolean} [forceState] - Explicit on/off. Omit to toggle.
   * @returns {Promise<boolean>} True if the layer is now in the requested state.
   */
  async _toggleCctvEnabled(forceState) {
    if (!this._dataManager || !this._dataManager.layers?.has('cctv')) {
      this._showToast('Layer CCTV tidak tersedia');
      return false;
    }
    const enabled = this._dataManager.isEnabled('cctv');
    const target = typeof forceState === 'boolean' ? forceState : !enabled;
    if (target === enabled) return true;
    await runCctvLayerEnableTransition({
      target,
      setEnabled: (next) => this._dataManager.setEnabled('cctv', next, { origin: 'user' }),
      readOwnership: () => ({
        trackedEntity: this.viewer?.trackedEntity,
        cockpitActive: !!this.cockpitView?.active,
      }),
      shouldFocus: () => !this._cctvState?.activeCameraId
        || this._dataManager?.callLayerMethod('cctv', 'isDefaultCameraPending') === true,
      activate: () => this._dataManager?.callLayerMethod('cctv', 'activateDefaultCamera')
        || this._dataManager?.callLayerMethod('cctv', 'focusNearest', { focus: false }),
      fly: (cameraId) => this._runExplicitCctvFocus(
        () => cameraId,
        (selectedId) => this._dataManager?.focusCamera('cctv', selectedId, 1.6),
      ),
    });
    return true;
  },

  /**
   * Full re-render of the CCTV panel UI from a CCTV layer state snapshot.
   * Updates enable button, camera select dropdown, navigation buttons,
   * coverage/auto-hop/projection toggles, quality chip, source badge,
   * metadata line, frame image, calibration controls, and summary text.
   * @param {object|null} state - CCTV layer UI state, or null to render empty.
   * @returns {void}
   */
  _renderCctvState(state) {
    this._cctvState = state || null;
    const cameras = state?.cameras || [];
    const enabled = !!state?.enabled && !!this._dataManager?.isEnabled('cctv');
    const activeId = state?.activeCameraId || '';
    const activeCamera = state?.activeCamera || null;

    // Rendering never expands the panel: picking or switching a camera (globe
    // click, panel controls, voice) leaves it as it was. Only the camera icon in
    // the rail opens it (owner directive 2026-11-14).
    this._updateCctvSyncChip(state?.loading, enabled);

    if (this._cctvEnableBtn) {
      this._cctvEnableBtn.classList.toggle('active', enabled);
      this._cctvEnableBtn.textContent = enabled ? 'CCTV HIDUP' : 'CCTV MATI';
    }

    if (this._cctvCameraListbox) {
      const orderedCameras = orderCctvCameraOptions(cameras);
      if (shouldRebuildCctvCameraListbox(this._cctvCameraListbox, orderedCameras)) {
        renderCctvCameraListboxOptions(this._cctvCameraListbox, orderedCameras);
      }
      syncCctvCameraListboxState(
        { trigger: this._cctvCameraTrigger, listbox: this._cctvCameraListbox },
        { cameras: orderedCameras, activeId, enabled },
      );
    }

    for (const btn of [this._cctvNearestBtn, this._cctvPrevBtn, this._cctvNextBtn]) {
      if (!btn) continue;
      btn.disabled = !enabled || cameras.length === 0;
    }
    if (this._cctvFocusBtn) {
      this._cctvFocusBtn.disabled = !enabled || cameras.length === 0 || !activeId;
    }

    if (this._cctvCoverageBtn) {
      // Tri-state (viewshed design §3b): off → on (wireframes) → viewshed
      // (color-coded volumes). The click handler cycles; this renders.
      const mode = state?.coverageMode || (state?.showCoverage ? 'on' : 'off');
      this._cctvCoverageBtn.classList.toggle('active', mode !== 'off');
      this._cctvCoverageBtn.textContent = mode === 'viewshed'
        ? 'VIEWSHED AKTIF'
        : mode === 'on' ? 'CAKUPAN AKTIF' : 'CAKUPAN MATI';
      this._cctvCoverageBtn.disabled = !enabled;
    }

    if (this._cctvAutoHopBtn) {
      const autoHop = !!state?.autoHop;
      this._cctvAutoHopBtn.classList.toggle('active', autoHop);
      this._cctvAutoHopBtn.textContent = autoHop ? 'LOMPAT OTOMATIS HIDUP' : 'LOMPAT OTOMATIS MATI';
      this._cctvAutoHopBtn.disabled = !enabled;
    }

    if (this._cctvProjectionBtn) {
      const showProjection = state?.showProjection !== false;
      this._cctvProjectionBtn.classList.toggle('active', showProjection);
      this._cctvProjectionBtn.textContent = showProjection ? 'PROYEKSI HIDUP' : 'PROYEKSI MATI';
      this._cctvProjectionBtn.disabled = !enabled;
    }

    if (this._cctvQualityChip) {
      // CAL badge (cctv-v2 design §3b, amended by LOCKED §9.2 — panel-only,
      // no in-world tint): three states driven by cctv.js's deriveCalBadge,
      // no client-side scoring math. Casing is unified via _calBadgeLabel so
      // the chip and the meta line never drift onto different conventions.
      // Save-gated persistence (viewshed design §3e): unsaved live edits show
      // EDITED on top of whatever the persisted badge state is — SAVE CAL
      // promotes to CALIBRATED, RESET CAL clears.
      const badge = activeCamera?.calBadge || null;
      const dirty = !!activeCamera?.calDirty;
      this._cctvQualityChip.textContent = dirty
        ? 'CAL · EDITED (UNSAVED)'
        : `CAL · ${this._calBadgeLabel(badge)}`;
      this._cctvQualityChip.dataset.calBadge = dirty ? 'edited' : (badge || '');
    }

    this._syncCctvCalReadout(enabled, activeCamera);

    if (this._cctvMeta) {
      if (activeCamera) {
        const provider = cctvProviderDisplay(activeCamera.sourceLabel || activeCamera.provider) || 'Sumber Terkonfigurasi';
        const statusMsg = activeCamera.sourceMessage ? ` · ${activeCamera.sourceMessage}` : '';
        const calBadge = activeCamera.calBadge ? this._calBadgeLabel(activeCamera.calBadge) : '';
        const projLabel = state?.showProjection !== false ? 'MONITOR' : 'OFF';
        this._cctvMeta.textContent = `${activeCamera.city} · HDG ${Math.round(activeCamera.headingDeg)}° · FOV ${Math.round(activeCamera.fovDeg)}° · JARAK ${Math.round(activeCamera.rangeM)}m · ${projLabel}${calBadge ? ` · ${calBadge}` : ''} · ${provider}${statusMsg}`;
      } else if (cameras.length > 0) {
        this._cctvMeta.textContent = enabled
          ? `${cameras.length} kamera dimuat · klik kamera untuk mengaktifkan`
          : `${cameras.length} kamera dimuat · nyalakan CCTV untuk mengaktifkan`;
      } else {
        this._cctvMeta.textContent = 'Nyalakan CCTV untuk memuat persimpangan kamera';
      }
    }

    // Video/HLS cameras prefer the live-video mirror (real motion, same
    // decoded frames as the 3D monitor plane) over the still-frame <img>
    // path — they have no frameUrl to poll anyway (see getPublicCameraState
    // in cctv.js). Image-feed cameras are unaffected: _syncCctvVideoMirror
    // no-ops and clears the (always-hidden) mirror element for them.
    const mirrorActive = this._syncCctvVideoMirror(activeCamera, enabled);
    if (this._cctvFrame) {
      const nextSrc = (enabled && !mirrorActive) ? activeCamera?.frameUrl : null;
      const nextCameraId = enabled ? (activeCamera?.id || '') : '';
      const cameraChanged = this._cctvFrame.dataset.cameraId !== nextCameraId;
      const frameLoading = this._cctvFrame.dataset.loading === 'true';
      // A same-camera refresh waits for the current image to settle. Replacing
      // src every 10 seconds can cancel a slow but healthy decode forever and
      // leave SNAPSHOT · OK beside a blank/loading preview. Camera changes are
      // immediate so navigation never waits on the prior camera's request.
      if (nextSrc && (cameraChanged || (!frameLoading && this._cctvFrame.dataset.currentSrc !== nextSrc))) {
        this._queueCctvFrame(nextSrc, nextCameraId, cameraChanged);
      }
      if (!nextSrc) {
        this._clearCctvFrame();
      }
    }

    this._syncCctvSourceBadge(activeCamera, enabled);
    this._typeCctvSummary(state?.summary || 'Nyalakan CCTV untuk memulai ringkasan intelijen berbasis kamera.');
  },

  /**
   * Typewriter-animates CCTV summary text into the summary element.
   * Skips animation if the text hasn't changed since the last call.
   * Advances 3 characters per 20ms tick for a fast teletype effect.
   * @param {string} text - Summary text to display.
   * @returns {void}
   */
  _typeCctvSummary(text) {
    if (!this._cctvSummary) return;
    const nextText = String(text || '').trim() || 'Ringkasan tidak tersedia.';
    if (nextText === this._lastCctvSummaryText) return;
    this._lastCctvSummaryText = nextText;

    clearInterval(this._cctvSummaryTypingTimer);
    this._cctvSummary.textContent = '';
    let idx = 0;
    this._cctvSummaryTypingTimer = setInterval(() => {
      idx += 3;
      if (idx >= nextText.length) {
        this._cctvSummary.textContent = nextText;
        clearInterval(this._cctvSummaryTypingTimer);
        this._cctvSummaryTypingTimer = null;
        return;
      }
      this._cctvSummary.textContent = nextText.slice(0, idx);
    }, 20);
  },
};
