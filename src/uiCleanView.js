// StyleManager clean view, globe reset and clear-selected-layers.
import * as Cesium from 'cesium';
import { GLOBE_VIEW, flyToGlobeView } from './locations.js';
import { interruptCameraMotion } from './cameraVerbs.js';

export const cleanViewMixin = {
/**
   * Enables/disables clean view (hides all UI chrome).
   * @param {boolean} [enabled] - Omit to toggle.
   * @returns {{ok: boolean, cleanView: boolean}}
   */
  setCleanView(enabled) {
    this.toggleCleanView(enabled);
    return { ok: true, cleanView: document.body.classList.contains('ui-clean-view') };
  },

/** Wire the persistent reset control to the same route used by voice. */
  _initResetGlobeButton() {
    this._globeResetHandler = () => { this.resetToGlobeView(); };
    for (const button of [this._resetGlobeBtn, this._cockpitResetGlobeBtn]) {
      button?.addEventListener('click', this._globeResetHandler);
    }
  },

/** Wire the top-center action that clears only manager-owned data layers. */
  _initClearSelectedLayersButton() {
    if (!this._clearSelectedLayersBtn) return;
    this._clearSelectedLayersHandler = () => { void this.clearSelectedLayers(); };
    this._clearSelectedLayersBtn.addEventListener('click', this._clearSelectedLayersHandler);
  },

/**
   * Clear every selected data layer without resetting visual, map, HUD, or
   * camera state. A layer may still release camera work it owns as part of its
   * established disable lifecycle.
   * @returns {Promise<object>} Aggregate manager lifecycle truth for the batch.
   */
  clearSelectedLayers() {
    if (this._clearSelectedLayersPromise) return this._clearSelectedLayersPromise;
    if (!this._dataManager?.clearSelectedLayers) {
      return Promise.resolve({ targetIds: [], items: [], clearedIds: [], notClearedIds: [] });
    }
    const generation = ++this._contextModeGeneration;
    const notificationToken = Symbol('clear-selected-layers');
    if (this._contextRestoreState) this._contextRestoreState.cancelled = true;
    this._contextModeChanging = true;
    this._contextMode = null;
    this._contextModeEntering = null;
    this._contextModeEntryIntent = null;
    this._contextModeReplacementIntent = null;
    this._contextSessionSnapshot = null;
    this._contextRestoreState = null;
    this._preservePanelStateDuringLayerClear = true;
    this._syncContextModeButtons();
    this._userFacingContextNotificationTokens.add(notificationToken);
    this._globalContextFlightsBtn && (this._globalContextFlightsBtn.disabled = true);
    this._globalContextMissionsBtn && (this._globalContextMissionsBtn.disabled = true);
    this._clearSelectedLayersBtn.disabled = true;
    this._clearSelectedLayersBtn.setAttribute('aria-label', 'Menghapus layer terpilih');

    const managerOperation = this._dataManager.clearSelectedLayers({
      origin: 'user',
      notificationToken,
    });
    this._clearSelectedLayersManagerPromise = managerOperation;
    const operation = managerOperation.then((result) => {
      if (result.targetIds.length === 0) {
        this._showToast('Tidak ada layer terpilih');
      } else if (result.notClearedIds.length > 0) {
        this._showToast(`${result.notClearedIds.length} layer data tidak dapat dihapus`);
      } else {
        this._showToast(`${result.clearedIds.length} layer data dihapus`);
      }
      return result;
    }).catch((error) => {
      console.warn('[Data] clear selected layers failed', error);
      this._showToast('Layer terpilih tidak dapat dihapus');
      return {
        targetIds: [],
        items: [],
        clearedIds: [],
        notClearedIds: [],
        error,
      };
    }).finally(() => {
      this._userFacingContextNotificationTokens.delete(notificationToken);
      if (generation === this._contextModeGeneration) {
        this._contextModeChanging = false;
        this._syncContextModeButtons();
        this._globalContextFlightsBtn && (this._globalContextFlightsBtn.disabled = false);
        this._globalContextMissionsBtn && (this._globalContextMissionsBtn.disabled = false);
      }
      this._clearSelectedLayersBtn.disabled = false;
      this._clearSelectedLayersBtn.setAttribute('aria-label', 'Hapus layer terpilih');
      this._preservePanelStateDuringLayerClear = false;
      this._clearSelectedLayersManagerPromise = null;
      this._clearSelectedLayersPromise = null;
    });
    this._clearSelectedLayersPromise = operation;
    return operation;
  },

/**
   * Release every camera owner and return to the canonical full-globe frame.
   * Repeated requests adopt the in-flight reset rather than cancelling it.
   * @returns {Promise<object>} Canonical reset result shared with voice.
   */
  resetToGlobeView() {
    if (this._globeResetPromise) return this._globeResetPromise;
    this._stampNavigation();
    interruptCameraMotion('reset-globe');
    this._stopOrbit();
    this.cockpitView?.exit({ restoreTracking: false });
    try {
      this._dataManager?.releaseCameraOwnership('military-awareness', { origin: 'tool' });
    } catch {
      // Keep reset available if Context has not initialized completely.
      try { this._dataManager?.stopTracking('flights', { origin: 'tool' }); } catch { /* best-effort release */ }
      try { this._dataManager?.stopTracking('military', { origin: 'tool' }); } catch { /* best-effort release */ }
      try { this._dataManager?.clearSelection('ais-live-vessels'); } catch { /* best-effort release */ }
    }
    try { this._dataManager?.stopTracking('satellites', { origin: 'tool' }); } catch { /* best-effort release */ }
    try { this._dataManager?.releaseCameraOwnership('rocket-launches'); } catch { /* best-effort release */ }
    this.viewer.trackedEntity = undefined;
    this.viewer.camera.cancelFlight();
    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    this._beginWorldJumpTransition();

    let resolveReset;
    const resetPromise = new Promise((resolve) => { resolveReset = resolve; });
    this._globeResetPromise = resetPromise;
    let settled = false;
    let timer = null;
    const finish = (cancelled = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      this._endWorldJumpTransition();
      const carto = this.viewer.camera.positionCartographic;
      const result = {
        ok: !cancelled,
        action: 'zoom_to_globe',
        cancelled,
        heightKm: Math.round(GLOBE_VIEW.heightM / 1000),
        centeredOn: {
          latitude: Number(Cesium.Math.toDegrees(carto.latitude).toFixed(2)),
          longitude: Number(Cesium.Math.toDegrees(carto.longitude).toFixed(2)),
        },
      };
      this._resetGlobeBtn?.setAttribute('aria-label', 'Atur ulang ke tampilan globe penuh');
      this._cockpitResetGlobeBtn?.setAttribute('aria-label', 'Atur ulang kokpit ke tampilan globe penuh');
      this._globeResetPromise = null;
      resolveReset(result);
    };
    timer = window.setTimeout(() => {
      const height = this.viewer.camera.positionCartographic?.height;
      finish(!Number.isFinite(height) || Math.abs(height - GLOBE_VIEW.heightM) > 1000);
    }, 4200);
    this._resetGlobeBtn?.setAttribute('aria-label', 'Mengatur ulang ke tampilan globe penuh');
    this._cockpitResetGlobeBtn?.setAttribute('aria-label', 'Mengatur ulang kokpit ke tampilan globe penuh');
    const target = flyToGlobeView(this.viewer, {
      onComplete: () => finish(false),
      onCancel: () => finish(true),
    });
    if (!target) finish(true);
    return resetPromise;
  },
};

