// StyleManager data-manager attachment and the 3D-models display toggle.
import { LayerStateCoordinator } from './data/layerState.js';
import {
  contextLayerEnableBlockReason,
  isExplicitUserIntentOrigin,
  runWithContextModeChanging,
  settleContextModeChange,
  shouldCaptureContextSession,
  shouldDeferContextEntryDuringClear,
} from './contextModePolicy.js';

export const dataManagerAttachMixin = {
/**
   * Connects the layer data manager for traffic sync, CCTV state subscription,
   * and layer enable/disable operations.
   * @param {object|null} dataManager - The DataManager instance, or null to detach.
   * @returns {void}
   */
  attachDataManager(dataManager) {
    if (this._dataManagerBeforeDestroyUnsubscribe) {
      this._dataManagerBeforeDestroyUnsubscribe();
      this._dataManagerBeforeDestroyUnsubscribe = null;
    }
    if (this._dataManagerVisibilityGuardUnsubscribe) {
      this._dataManagerVisibilityGuardUnsubscribe();
      this._dataManagerVisibilityGuardUnsubscribe = null;
    }
    if (this._dataManagerVisibilityRequestUnsubscribe) {
      this._dataManagerVisibilityRequestUnsubscribe();
      this._dataManagerVisibilityRequestUnsubscribe = null;
    }
    this._dataManager = dataManager || null;
    this.hud.attachDataManager(this._dataManager);
    this._updateTrafficSyncChip();
    if (this._dataManagerUnsubscribe) {
      this._dataManagerUnsubscribe();
      this._dataManagerUnsubscribe = null;
    }
    if (typeof this._dataManager?.subscribe === 'function') {
      this._dataManagerUnsubscribe = this._dataManager.subscribe((change) => {
        if (String(change?.type || '').startsWith('visibility')) {
          this._handleContextLayerChange(change);
        }
        this._loadingFeedbackEvent = change;
        this._updateGlobalLoadingFeedback(performance.now());
      });
    }
    this._updateGlobalLoadingFeedback(performance.now());
    if (typeof this._dataManager?.subscribeVisibilityRequests === 'function') {
      this._dataManagerVisibilityRequestUnsubscribe = this._dataManager.subscribeVisibilityRequests((change) => {
        if (shouldCaptureContextSession(change)) {
          // This event is synchronous with intent publication, before an
          // awaited guard or Clear All can alter the rest of the layer set.
          // Manager effective visibility already includes both the new entry
          // intent and Clear's reserved OFF baseline.
          this._captureContextSessionSnapshot({ excludeLayerIds: [change.layerId] });
          if (shouldDeferContextEntryDuringClear({
            change,
            clearInFlight: Boolean(this._clearSelectedLayersPromise),
          })) {
            this._contextModeDeferredEntryIntent = {
              layerId: change.layerId,
              intentEpoch: change.intentEpoch,
              origin: change.origin,
            };
            this._contextModeEntering = 'space-missions';
            this._syncContextModeButtons();
          }
        } else if (
          change?.layerId === 'rocket-launches'
          && change.enabled === false
          && isExplicitUserIntentOrigin(change.origin, change.layerId)
        ) {
          this._contextModeDeferredEntryIntent = null;
          if (this._clearSelectedLayersPromise) {
            this._contextSessionSnapshot = null;
            this._contextModeEntering = null;
            this._syncContextModeButtons();
          }
        }
      });
    }
    if (typeof this._dataManager?.addVisibilityGuard === 'function') {
      this._dataManagerVisibilityGuardUnsubscribe = this._dataManager.addVisibilityGuard(async (change) => {
        const layerName = this._dataManager?.layers?.get(change.layerId)?.module?.name || change.layerId;
        const reason = contextLayerEnableBlockReason({
          contextMode: this._contextModeEntering || this._contextMode,
          change,
          layerName,
        });
        if (reason) return reason;
        if (
          change.enabled
          && ['military-awareness', 'rocket-launches'].includes(change.layerId)
          && shouldCaptureContextSession(change)
          && (
            !this._contextModeChanging
            || (
              change.layerId === 'rocket-launches'
              && this._contextModeDeferredEntryIntent?.intentEpoch === change.intentEpoch
            )
          )
        ) {
          const entryMode = change.layerId === 'rocket-launches' ? 'space-missions' : null;
          const deferredClearEntry = this._contextModeDeferredEntryIntent?.intentEpoch === change.intentEpoch;
          // A deferred entry owns the state after Clear settles. Restoring
          // Clear's transient busy flag here would leave Context stuck.
          const priorChanging = deferredClearEntry ? false : this._contextModeChanging;
          const notificationToken = change.notificationToken || Symbol('direct-context-shell-entry');
          const ownsNotificationToken = !change.notificationToken;
          if (ownsNotificationToken) {
            this._userFacingContextNotificationTokens.add(notificationToken);
          }
          this._contextModeEntering = entryMode;
          this._contextModeChanging = true;
          try {
            if (deferredClearEntry) {
              await this._clearSelectedLayersManagerPromise;
              if (this._contextModeDeferredEntryIntent?.intentEpoch !== change.intentEpoch) return false;
              this._contextModeDeferredEntryIntent = null;
            }
            await this._clearLayersOutsideContextMode(entryMode, { notificationToken });
          } catch (error) {
            this._contextModeEntering = null;
            console.warn(`[Context] ${change.layerId} isolation failed`, error);
            try {
              await this._restoreContextSession({
                excludeLayerIds: [change.layerId],
                notificationToken,
              });
            } catch (restoreError) {
              console.warn(`[Context] ${change.layerId} rollback failed`, restoreError);
            }
            return `${entryMode === 'space-missions' ? 'Space Missions' : 'Context'} could not start because another layer did not stop cleanly`;
          } finally {
            if (ownsNotificationToken) {
              this._userFacingContextNotificationTokens.delete(notificationToken);
            }
            settleContextModeChange(this, priorChanging);
          }
        }
        return null;
      });
    }
    if (typeof this._dataManager?.subscribeBeforeDestroy === 'function') {
      this._dataManagerBeforeDestroyUnsubscribe = this._dataManager.subscribeBeforeDestroy(async ({ layerId } = {}) => {
        if (!this._contextSessionSnapshot) return;
        await runWithContextModeChanging(this, async () => {
          this._contextMode = null;
          this.cockpitView?.exit({ restoreTracking: false });
          this._syncContextModeButtons();
          await this._restoreContextSession({ excludeLayerIds: layerId ? [layerId] : [] });
        });
      });
    }
    this._syncContextModeButtons();
    if (this._cctvUnsubscribe) {
      this._cctvUnsubscribe();
      this._cctvUnsubscribe = null;
    }
    this._cctvUnsubscribe = this._dataManager?.subscribeLayer('cctv', (state) => {
      this._renderCctvState(state);
    }) || null;
    const cctvUiState = this._dataManager?.getLayerUIState('cctv');
    if (cctvUiState) this._renderCctvState(cctvUiState);
    if (this._radioUnsubscribe) {
      this._radioUnsubscribe();
      this._radioUnsubscribe = null;
    }
    this._radioUnsubscribe = this._dataManager?.subscribeLayer('radio', (state) => {
      this._renderRadioState(state);
    }) || null;
    if (!this._awarenessSelectedHandler) {
      this._awarenessSelectedHandler = (event) => this._persistAwarenessSelection(event, false);
      this._awarenessClearedHandler = (event) => this._persistAwarenessSelection(event, true);
      window.addEventListener('gev:awareness-subject-selected', this._awarenessSelectedHandler);
      window.addEventListener('gev:awareness-subject-cleared', this._awarenessClearedHandler);
    }
    this._layerStateCoordinator?.destroy();
    this._layerStateCoordinator = null;
    this._layerStateRestorePromise = null;
    if (this._dataManager) {
      this._layerStateCoordinator = new LayerStateCoordinator(
        this._dataManager,
        this.shareLinkManager,
        {
          onDurableStateChange: (state) => this._syncModels3dFromLayerState(state),
          onTrackingRestoreStatus: (result) => this._handleShareTrackingRestoreStatus(result),
        },
      );
      this._layerStateRestorePromise = this._layerStateCoordinator.start({
        shareLayerState: this._initialShareState?.layerState || null,
        shareCreatedAtMs: this._initialShareState?.sharedAtMs ?? null,
        // Any valid camera/style share isolates recipient-local preferences,
        // including legacy and malformed-v2 layer payloads.
        allowLocalState: !this._initialShareState,
      });
      if (this._initialShareSelectionSuperseded) {
        this._layerStateCoordinator.cancelPendingShareTracking(
          'superseded-before-layer-coordinator-start',
          { clearSelection: true },
        );
      }
      void this._layerStateRestorePromise.then(() => {
        this._syncModels3dFromLayerState(this._layerStateCoordinator?.getDurableState());
      });
    }
  },

// ── HUD Toggle ───────────────────────────────

  /**
   * Wires the HUD toggle button, initializes the default HUD variant to 'tactical',
   * and sets up the detection mode cycle button.
   * @returns {void}
   */
  /**
   * Wires the DISPLAY-rail "3D" toggle to the flights layer's `models3d` param.
   * ON by default in `proximity` mode (owner directive 2026-08-22): the fleet
   * renders as 3D glTF models once the camera is zoomed in past the layer's
   * altitude ceiling, and only the nearest MODEL_MAX in view are admitted, so
   * the default costs nothing at globe scale. `all` is the deliberate opt-in;
   * turning the toggle off returns the fleet to flat billboards. The TRACKED
   * contact is independent of this toggle (see trackedModelRegime.js).
   * @returns {void}
   */
  /** One 3D toggle drives BOTH aircraft layers (commercial + military) so all planes flip together. */
  _setModels3dParams(params, { origin = 'user' } = {}) {
    this._dataManager?.setLayerParams('flights', params, { origin });
    this._dataManager?.setLayerParams('military', params, { origin });
  },

_syncModels3dFromLayerState(state) {
    const options = state?.options?.flights;
    if (!options) return;
    this._models3dEnabled = options.models3d === true;
    this._models3dMode = options.models3dMode === 'all' ? 'all' : 'proximity';
    this._syncModels3dButtonState();
    this._models3dModeRow?.classList.toggle('visible', this._models3dEnabled);
    for (const button of this._models3dModeBtns || []) {
      if (!button) continue;
      const active = button.dataset.mode === this._models3dMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    this._layoutRightPanels();
  },

_initModels3dToggle() {
    if (!this._models3dBtn) return;
    // The Proximity/All mode row is revealed only while 3D is on (mirrors the DETECT slider row).
    const syncModeRow = () => {
      if (this._models3dModeRow) this._models3dModeRow.classList.toggle('visible', this._models3dEnabled);
      this._layoutRightPanels();
    };
    this._models3dBtn.addEventListener('click', () => {
      this._setModels3dEnabled(!this._models3dEnabled);
      syncModeRow();
    });
    for (const btn of this._models3dModeBtns) {
      if (!btn) continue;
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode === 'all' ? 'all' : 'proximity';
        this._setModels3dMode(mode);
      });
    }
    this._syncModels3dButtonState();
    syncModeRow();
  },

_setModels3dEnabled(enabled) {
    this._models3dEnabled = !!enabled;
    this._setModels3dParams({ models3d: this._models3dEnabled });
    this._syncModels3dButtonState();
  },

_setModels3dMode(mode) {
    const normalized = mode === 'all' ? 'all' : 'proximity';
    this._models3dMode = normalized;
    this._setModels3dParams({ models3dMode: normalized });
    for (const button of this._models3dModeBtns) {
      if (!button) continue;
      const active = button.dataset.mode === normalized;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    }
    this._syncModels3dButtonState();
  },

_syncModels3dButtonState() {
    this._models3dBtn?.classList.toggle('active', this._models3dEnabled);
    // The lit/dark state is a colour to a sighted operator and nothing at all to
    // a screen reader without this. It matters more now that the button ships
    // ACTIVE from markup (default-on, 2026-08-22): the very first thing assistive
    // tech reported was an unpressed-looking control over an armed layer.
    // Mirrors #scope-toggle, which has always carried aria-pressed.
    this._models3dBtn?.setAttribute('aria-pressed', String(this._models3dEnabled));
  },
};

