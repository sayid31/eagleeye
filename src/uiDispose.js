// StyleManager teardown.
import { destroyDetection } from './data/detection.js';
import { destroyTrackedReadout } from './data/trackedReadout.js';
import { destroyWorldOverlay } from './overlays/worldOverlay.js';
import { releaseContinuousRender } from './renderGovernor.js';

export const disposeMixin = {
/**
   * Tear down the StyleManager — cancel animation loop, clear intervals,
   * and release resources. Call this before discarding the instance to
   * prevent leaked rAF loops and event listeners.
   * @returns {Promise<void>} Resolves after focused-session state restoration.
   */
  async dispose() {
    if (this._disposed) return;
    this._shareTrackingNoticeGeneration += 1;
    this._shareTrackingAcquiringKey = null;
    this._globalStatusNotice = null;
    if (this._globalLoadingStatus) this._globalLoadingStatus.hidden = true;
    this._disposed = true;
    // Revoke persistence/hash authority before teardown can emit manager changes.
    this._layerStateCoordinator?.destroy();
    this._layerStateCoordinator = null;
    this._layerStateRestorePromise = null;
    clearTimeout(this._initialShareRestoreTimeout);
    this._initialShareRestoreTimeout = null;
    this._settleInitialShareRestore({ status: 'destroyed', share: null, layers: [] });
    if (this._initialShareGestureHandler) {
      this.viewer?.canvas?.removeEventListener('pointerdown', this._initialShareGestureHandler);
      this.viewer?.canvas?.removeEventListener('wheel', this._initialShareGestureHandler);
      this._initialShareGestureHandler = null;
    }
    this.shareLinkManager?.destroy();
    if (this._awarenessSelectedHandler) {
      window.removeEventListener('gev:awareness-subject-selected', this._awarenessSelectedHandler);
      this._awarenessSelectedHandler = null;
    }
    if (this._awarenessClearedHandler) {
      window.removeEventListener('gev:awareness-subject-cleared', this._awarenessClearedHandler);
      this._awarenessClearedHandler = null;
    }
    if (this._mapStackChangeHandler) {
      window.removeEventListener('gev:map-stack-changed', this._mapStackChangeHandler);
      this._mapStackChangeHandler = null;
    }
    // Invalidate any in-flight Context transaction the same way a newer request
    // would. Without this, a reinstatement already past its awaits could
    // re-enable a mode's entry layer and republish `_contextMode` while the
    // rest of teardown is tearing those very layers down.
    this._contextModeGeneration += 1;
    this._stampNavigation();
    // Close camera-entry seams synchronously. Context restoration may await
    // layer work, so leaving these listeners attached until afterward lets a
    // focus event release tracking or start a flight during teardown.
    this._removeCctvRequestFocusListener?.();
    this._removeCctvRequestFocusListener = null;
    this._cctvRequestFocusHandler = null;
    this._removeWorldRequestFocusListener?.();
    this._removeWorldRequestFocusListener = null;
    this._worldRequestFocusHandler = null;
    this._navigationOwnerChangedRemover?.();
    this._navigationOwnerChangedRemover = null;
    this._removeNavigationAuthorityListener?.();
    this._removeNavigationAuthorityListener = null;
    this._contextModeChanging = true;
    this._contextMode = null;
    await this._restoreContextSession();
    // IR boost teardown BEFORE detaching the data manager: restore fog and
    // un-boost both aircraft layers so a surviving viewer or replacement
    // manager doesn't inherit sensor state (review P2, 2026-08-16).
    if (this._irBoostActive) {
      if (this._irFogWasEnabled != null && this.viewer?.scene?.fog) {
        this.viewer.scene.fog.enabled = this._irFogWasEnabled;
      }
      this._dataManager?.setLayerParams('flights', { irBoost: false });
      this._dataManager?.setLayerParams('military', { irBoost: false });
      this._irBoostActive = false;
      this._irFogWasEnabled = null;
    }
    this.cockpitView?.dispose();
    if (this._cockpitDisplayModeHandler) {
      window.removeEventListener('gev:cockpit-mode-changed', this._cockpitDisplayModeHandler);
      this._cockpitDisplayModeHandler = null;
    }
    this._setCockpitDisplayPortalActive(false);
    this._ppToggles?.removeEventListener('scroll', this._standardDisplayScrollHandler);
    this._cockpitDisplayPanel?.removeEventListener('scroll', this._cockpitDisplayScrollHandler);
    this._standardDisplayScrollHandler = null;
    this._cockpitDisplayScrollHandler = null;
    for (const record of this._cockpitDisplayPortalRecords) record.anchor.remove();
    this._cockpitDisplayPortalRecords = [];
    this._dataManagerBeforeDestroyUnsubscribe?.();
    this._dataManagerBeforeDestroyUnsubscribe = null;
    this._dataManagerVisibilityGuardUnsubscribe?.();
    this._dataManagerVisibilityGuardUnsubscribe = null;
    this._dataManagerVisibilityRequestUnsubscribe?.();
    this._dataManagerVisibilityRequestUnsubscribe = null;
    this._dataManagerUnsubscribe?.();
    this._dataManagerUnsubscribe = null;
    if (this._globeResetHandler) {
      this._resetGlobeBtn?.removeEventListener('click', this._globeResetHandler);
      this._cockpitResetGlobeBtn?.removeEventListener('click', this._globeResetHandler);
      this._globeResetHandler = null;
    }
    if (this._clearSelectedLayersBtn && this._clearSelectedLayersHandler) {
      this._clearSelectedLayersBtn.removeEventListener('click', this._clearSelectedLayersHandler);
      this._clearSelectedLayersHandler = null;
    }
    this._cctvUnsubscribe?.();
    this._cctvUnsubscribe = null;
    this._commandDockTrayObserver?.disconnect?.();
    this._commandDockTrayObserver = null;
    this._draggableResizeObserver?.disconnect();
    this._draggableResizeObserver = null;
    if (this._windowResizeHandler) {
      window.removeEventListener('resize', this._windowResizeHandler);
      this._windowResizeHandler = null;
    }
    if (this._loadingVisibilityHandler) {
      document.removeEventListener('visibilitychange', this._loadingVisibilityHandler);
      this._loadingVisibilityHandler = null;
    }
    this._stopLoadingFeedbackTicker();
    if (this._globalKeydownHandler) {
      document.removeEventListener('keydown', this._globalKeydownHandler);
      this._globalKeydownHandler = null;
    }
    if (this._poiKeydownHandler) {
      document.removeEventListener('keydown', this._poiKeydownHandler);
      this._poiKeydownHandler = null;
    }
    // Cancel the rAF animation loop and release its governor hold; also stop
    // the traffic-chip ticker the loop no longer carries. (perf wave 2 fix)
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    releaseContinuousRender('style-anim');
    if (this._trafficChipTicker) {
      clearInterval(this._trafficChipTicker);
      this._trafficChipTicker = null;
    }
    if (this._loadingFeedbackTicker) {
      clearInterval(this._loadingFeedbackTicker);
      this._loadingFeedbackTicker = null;
    }
    if (this._leftStackLayoutFrame !== null) {
      cancelAnimationFrame(this._leftStackLayoutFrame);
      this._leftStackLayoutFrame = null;
    }
    if (this._rightStackLayoutFrame !== null) {
      cancelAnimationFrame(this._rightStackLayoutFrame);
      this._rightStackLayoutFrame = null;
    }
    clearTimeout(this._adaptivePanelSettleTimer);
    this._adaptivePanelSettleTimer = null;
    this._leftStackResizeObserver?.disconnect();
    this._leftStackResizeObserver = null;
    this._leftStackMutationObserver?.disconnect();
    this._leftStackMutationObserver = null;
    this._rightStackResizeObserver?.disconnect();
    this._rightStackResizeObserver = null;
    this._rightStackMutationObserver?.disconnect();
    this._rightStackMutationObserver = null;
    if (this._leftStackHudTransitionHandler) {
      document.getElementById('intel-hud')?.removeEventListener(
        'transitionend',
        this._leftStackHudTransitionHandler,
      );
      this._leftStackHudTransitionHandler = null;
    }
    if (this._rightStackHudTransitionHandler) {
      document.getElementById('intel-hud')?.removeEventListener(
        'transitionend',
        this._rightStackHudTransitionHandler,
      );
      this._rightStackHudTransitionHandler = null;
    }
    if (this._leftStackCockpitModeHandler) {
      window.removeEventListener('gev:cockpit-mode-changed', this._leftStackCockpitModeHandler);
      this._leftStackCockpitModeHandler = null;
    }
    this._radioUnsubscribe?.();
    this._radioUnsubscribe = null;
    this._radioTunerAbort?.abort();
    this._radioTunerAbort = null;
    this._cctvListboxAbort?.abort();
    this._cctvListboxAbort = null;
    // Undo the portal reparent from _initCctvCameraListbox (backdrop-filter
    // containing-block workaround) so a re-instantiated StyleManager doesn't
    // find a stray listbox node already hanging off document.body.
    this._cctvCameraListbox?.remove();
    this._radioTunerBandPinnedForNavigation = false;
    this._radioTunerDragSnapshot = null;
    this._radioTunerPool = [];
    this._radioTunerCameraRemove?.();
    this._radioTunerCameraRemove = null;
    this._refreshRadioTunerBand = null;
    document.getElementById('title-bar')?.classList.remove('radio-broadcasting');
    this._dataManager?.endTuning('radio');
    if (this._radioSelectedHandler) {
      document.removeEventListener('gev:radio-selected', this._radioSelectedHandler);
      this._radioSelectedHandler = null;
    }
    destroyTrackedReadout();
    destroyDetection();
    destroyWorldOverlay();
    // Clear transitions
    this.transitions.clear();
  },
};

