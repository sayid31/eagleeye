import {
  contextAllowedLayerIds,
  contextRestoreLayerIds,
  contextSnapshotLayerIds,
  cockpitEntryAllowed,
  isExplicitUserIntentOrigin,
  mergeContextTransitionErrors,
  recordContextRestoreExplicitChange,
  recordContextSessionUserChange,
  settleContextIntentReplay,
  settleUserFacingContextAction,
  shouldExitContextForLayerChange,
  spaceMissionEntryCancellationDisposition,
} from './contextModePolicy.js';
import { shouldExpandGlobalContextPanel } from './rightRailPolicy.js';

/**
 * Prototype mixin for StyleManager (see `ui.js`): Global Context mode (the
 * Contacts / Space Missions exclusive-layer transaction system) — session
 * capture/restore, layer isolation, the mode-select/deactivate/restore state
 * machine, the layer-change reaction handler, and the panel button sync.
 *
 * This is a mechanical method-body relocation to shrink `ui.js`, not a logic
 * extraction: fields (`this._contextMode`, `this._contextModeChanging`,
 * `this._contextSessionSnapshot`, the various `_globalContext*` DOM refs,
 * etc.) are still declared and initialized in the `StyleManager` constructor
 * in `ui.js`; only the method bodies live here. `this.foo()` calls into the
 * rest of the prototype (`_showToast`, `setPanelCollapsed`,
 * `_syncContactsDetection`, `_scheduleRightPanelLayout`, etc.) and reads of
 * `this._dataManager`/`this.cockpitView`/`this.shareLinkManager` resolve
 * normally via prototype dispatch — no call site anywhere in `ui.js` needed
 * to change. Please don't "fix" this into a delegate/composed object; that
 * would require rewriting every one of those call sites for no behavior
 * change.
 *
 * What stays in `ui.js`, and why:
 * - `setContextMode()` — the public voice/state-sync facade, sits directly
 *   beside its "Public control facade" siblings (`setHudVisible`,
 *   `setDetection`, `setBloom`, `getCockpitState`, etc.); moving one facade
 *   method out of that cohesive section would fragment it for no benefit. It
 *   still calls `this.getContextModeState()` (moved here) and
 *   `this._selectContextMode()` (moved here) unchanged via prototype
 *   dispatch.
 * - `attachDataManager`'s Context-related guard callback and the
 *   `contextModePolicy.js` helpers it alone uses
 *   (`contextLayerEnableBlockReason`, `runWithContextModeChanging`,
 *   `shouldCaptureContextSession`, `shouldDeferContextEntryDuringClear`,
 *   `settleContextModeChange`, `contextModeWord`) — `attachDataManager` owns
 *   `_dataManager`/`_layerStateCoordinator` wiring generally, a distinct,
 *   larger concern out of scope for this pass.
 *
 * `_handleContextLayerChange()` moved here despite reading, at a glance, like
 * it could stay with `attachDataManager` (its sole caller, which is NOT
 * moving): it sat contiguously inside the same extracted range as the rest
 * of this group (no clean way to carve it out without fragmenting one
 * cut into two), and it is Context-only reaction logic — every branch reads
 * or writes `_contextMode`/`_contextSessionSnapshot`/etc. and calls sibling
 * Context methods. Its call site in `attachDataManager`
 * (`this._handleContextLayerChange(change)`) is unaffected: it still
 * resolves via prototype dispatch.
 */
export const contextModeMixin = {
  _initGlobalContextPanel() {
    const contextTabs = [this._globalContextFlightsBtn, this._globalContextMissionsBtn].filter(Boolean);
    contextTabs.forEach((tab, index) => tab.addEventListener('keydown', (event) => {
      let nextIndex = null;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % contextTabs.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + contextTabs.length) % contextTabs.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = contextTabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      contextTabs[nextIndex].focus({ preventScroll: true });
      contextTabs[nextIndex].click();
    }));
    this._globalContextFlightsBtn?.addEventListener('click', () => {
      const nextMode = this._contextMode === 'flights' ? null : 'flights';
      this._claimContextVisualAuthority();
      void this._runUserFacingContextAction(
        (notificationToken) => this._selectContextMode(
          nextMode,
          { notificationToken },
        ),
        'Kontak tidak dapat menyelesaikan transisi yang diminta; coba lagi',
      ).then((succeeded) => {
        if (nextMode && shouldExpandGlobalContextPanel({
          action: 'contacts',
          explicitUserAction: true,
          succeeded: succeeded === true,
        })) this.setPanelCollapsed('global-context-panel', false, { explicit: true });
      });
    });
    this._globalContextMissionsBtn?.addEventListener('click', () => {
      const nextMode = this._contextMode === 'space-missions' ? null : 'space-missions';
      this._claimContextVisualAuthority();
      void this._runUserFacingContextAction(
        (notificationToken) => this._selectContextMode(
          nextMode,
          { notificationToken },
        ),
        'Misi Antariksa tidak dapat menyelesaikan transisi yang diminta; coba lagi',
      ).then((succeeded) => {
        if (nextMode && shouldExpandGlobalContextPanel({
          action: 'space-missions',
          explicitUserAction: true,
          succeeded: succeeded === true,
        })) this.setPanelCollapsed('global-context-panel', false, { explicit: true });
      });
    });
    this._installationsSearchBtn?.addEventListener('click', () => {
      if (!this._dataManager?.layers?.has('military-installations')) return;
      const button = this._installationsSearchBtn;
      button.disabled = true;
      void this._runUserFacingContextAction(async (notificationToken) => {
        const enabled = await this._dataManager.setEnabled('military-installations', true, {
          origin: 'user',
          notificationToken,
        });
        if (enabled === false || !this._dataManager.isEnabled('military-installations')) return false;
        const searched = await this._dataManager?.searchNearby('military-installations');
        if (searched === false) return false;
        const stats = this._dataManager?.getLayerStatsRaw('military-installations');
        this._showToast(stats?.status === 'zoom-in'
          ? 'Perbesar peta untuk mencari instalasi terpetakan'
          : 'Instalasi terdekat diperbarui');
        return true;
      }, 'Instalasi terdekat tidak dapat diperbarui; coba lagi').finally(() => {
        button.disabled = false;
      });
    });
  },

  async _runUserFacingContextAction(
    operation,
    message = 'Konteks tidak dapat memulihkan semua layer; coba lagi',
    { falseIsFailure = true } = {},
  ) {
    const notificationToken = Symbol('user-facing-context-action');
    this._userFacingContextNotificationTokens.add(notificationToken);
    try {
      return await settleUserFacingContextAction({
        operation: () => operation(notificationToken),
        falseIsFailure,
        onFailure: (error) => {
          console.warn('[Context] user-facing transition failed', error);
          this._showToast(message);
        },
      });
    } finally {
      this._userFacingContextNotificationTokens.delete(notificationToken);
    }
  },

  _trackContextLayerReaction(promise) {
    const tracked = Promise.resolve(promise);
    this._contextLayerReactionPromises.add(tracked);
    void tracked.finally(() => this._contextLayerReactionPromises.delete(tracked));
    return tracked;
  },

  async _waitForContextLayerSettlement() {
    while (this._contextLayerReactionPromises.size > 0) {
      await Promise.allSettled([...this._contextLayerReactionPromises]);
    }
  },

  _captureContextSessionSnapshot({ excludeLayerIds = [] } = {}) {
    if (!this._dataManager || this._contextSessionSnapshot) return;
    const params = {};
    for (const layerId of ['military-awareness', 'satellites']) {
      const value = this._dataManager.getLayerParams(layerId);
      if (value) params[layerId] = value;
    }
    this._contextSessionSnapshot = {
      enabledLayerIds: contextSnapshotLayerIds(
        this._dataManager.getEnabledLayerIds(),
        this._contextRestoreState?.enabledLayerIds,
        excludeLayerIds,
      ),
      userAdded: new Set(),
      userRemoved: new Set(),
      params,
    };
  },

  async _restoreContextSession({
    excludeLayerIds = [],
    notificationToken = null,
    signal = null,
  } = {}) {
    const snapshot = this._contextSessionSnapshot;
    if (!snapshot || !this._dataManager) return;
    // Clear the stored session before emitting restore notifications so none
    // of those transitions can be mistaken for a fresh Context entry.
    this._contextSessionSnapshot = null;
    const restoreState = {
      enabledLayerIds: contextRestoreLayerIds(snapshot),
      explicitLayerStates: new Map(),
    };
    this._contextRestoreState = restoreState;
    for (const [layerId, params] of Object.entries(snapshot.params)) {
      this._dataManager.setLayerParams(layerId, params);
    }
    let restoreError = null;
    const restoreSnapshot = async (restoreSignal = null) => {
      // Contacts owns the dependency intents it starts. Settle that
      // coordinator before restoring the remaining snapshot, otherwise its
      // dependency releases can supersede the restore's same-target requests
      // and make a valid Contacts-to-Missions handoff look like a failure.
      const contactsCoordinatorId = 'military-awareness';
      const settleContactsCoordinator = !restoreState.enabledLayerIds.has(contactsCoordinatorId)
        && this._dataManager.isEffectivelyEnabled(contactsCoordinatorId);
      if (settleContactsCoordinator) {
        const coordinatorSettled = await this._dataManager.setEnabled(
          contactsCoordinatorId,
          false,
          {
            origin: 'context-restore',
            ...(notificationToken ? { notificationToken } : {}),
            ...(restoreSignal ? { signal: restoreSignal } : {}),
          },
        );
        if (coordinatorSettled === false) {
          const error = new Error('Failed to settle Contacts before restoring Context');
          error.failedLayerIds = [contactsCoordinatorId];
          throw error;
        }
      }
      await this._dataManager.restoreEnabledLayerIds(restoreState.enabledLayerIds, {
        origin: 'context-restore',
        excludeLayerIds: settleContactsCoordinator
          ? [...excludeLayerIds, contactsCoordinatorId]
          : excludeLayerIds,
        notificationToken,
        ...(restoreSignal ? { signal: restoreSignal } : {}),
      });
    };
    try {
      await restoreSnapshot(signal);
    } catch (error) {
      restoreError = error;
      // A caller abort can arrive after only part of the exact restore has
      // settled. Finish that same target without the stale caller signal while
      // this restoreState still records newer explicit intents; replay below
      // then gives those newer intents final authority.
      if (signal?.aborted && !restoreState.cancelled) {
        try {
          await restoreSnapshot(null);
          restoreError = null;
        } catch (compensationError) {
          restoreError = mergeContextTransitionErrors(restoreError, compensationError);
        }
      }
    } finally {
      if (this._contextRestoreState === restoreState) this._contextRestoreState = null;
    }
    // Clear Selected Layers owns a newer global OFF intent. A restore that was
    // already awaiting lifecycle work must not replay its captured companion
    // intent or recreate the discarded session after Clear invalidates it.
    if (restoreState.cancelled) return;
    // A direct Radio command may finish after restore has already copied its
    // target and queued the opposite state. Replay that newer intent only
    // after the stale queue drains; the replay origin cannot recurse here.
    const replaySignal = signal?.aborted ? null : signal;
    const replayError = await settleContextIntentReplay({
      restoreState,
      setEnabled: (layerId, enabled, options = {}) => this._dataManager.setEnabled(
        layerId,
        enabled,
        { ...options, ...(replaySignal ? { signal: replaySignal } : {}) },
      ),
      notificationToken,
    });
    restoreError = mergeContextTransitionErrors(restoreError, replayError);
    if (restoreError && !this._contextSessionSnapshot) {
      // Keep the exact still-pending target so a later exit/teardown can retry
      // instead of silently losing the user's pre-Context layer state.
      this._contextSessionSnapshot = {
        enabledLayerIds: new Set(restoreState.enabledLayerIds),
        userAdded: new Set(),
        userRemoved: new Set(),
        params: snapshot.params,
      };
    }
    if (restoreError) throw restoreError;
  },

  /*
   * Cross-mode cancellation and failure deliberately settle on Context OFF.
   *
   * A reinstatement transaction lived here for three review rounds and was
   * removed on purpose. Restoring the prior mode is genuinely racy: the prior
   * mode has to be read before the teardown, but a second request arriving
   * while the first reinstatement is mid-activation reads `_contextMode` as
   * null and inherits nothing, so two overlapping cancellations still land on
   * OFF — and the only fix is a cross-transaction "logical prior mode" chain,
   * which is new shared mutable state read while an earlier transaction is
   * still awaiting. That trades a rare wrong resting state for a permanent
   * interleaving hazard.
   *
   * The defect that started this was the LIE, not the OFF: the transition
   * claimed to have cancelled cleanly while silently leaving Context off. So
   * the resting state stays OFF and is REPORTED as such, with the failed layer
   * ids preserved. A restore feature can be rebuilt post-launch on the
   * generation discipline the surrounding transaction already follows.
   */

  async _restoreContextSessionAfterLayerSettles(layerId, { notificationToken = null } = {}) {
    await this._dataManager?.waitForLayerSettled?.(layerId);
    return this._restoreContextSession({ notificationToken });
  },

  /**
   * Claim the visual restore lane for an explicit Context transition.
   *
   * Contacts OWNS detection while active (forced Dense @ 75%), so entering or
   * leaving it is a visual-lane gesture exactly like the HUD or detection
   * controls. Without this claim, the shared-view restore that lands 1.5 s into
   * startup re-applied the link's `dm`/`dd` over the forced preset and Contacts
   * lost its own overlay mid-session.
   *
   * Deliberately does NOT set `_detectionUserOverridden`: that flag means the
   * OPERATOR hand-edited detection and suppresses the military-style
   * auto-enable for the rest of the session. Context entry is not that, and
   * conflating them would silently disable a separate landed behavior.
   *
   * Call only for VALIDATED explicit transitions — never for programmatic or
   * restore-driven ones, which must stay eligible for the shared visual state.
   */
  _claimContextVisualAuthority() {
    this.shareLinkManager?.claimRestoreLane?.('visual');
  },

  async _selectContextMode(mode, { notificationToken = null, signal = null } = {}) {
    if (!this._dataManager) return false;
    if (this._clearSelectedLayersPromise) return false;
    this._contextTransitionFailedLayerIds = [];
    const generation = ++this._contextModeGeneration;
    const isCurrent = () => generation === this._contextModeGeneration;
    this._contextModeEntryIntent = null;
    this._contextModeReplacementIntent = null;
    this._contextModeChanging = true;
    this._globalContextFlightsBtn && (this._globalContextFlightsBtn.disabled = true);
    this._globalContextMissionsBtn && (this._globalContextMissionsBtn.disabled = true);
    try {
      if (mode !== 'flights' && this.cockpitView?.active) {
        this.cockpitView.exit({ restoreTracking: false });
      }
      if (!mode) {
        this._contextMode = null;
        this._syncContextModeButtons();
        await this._restoreContextSession({ notificationToken, signal });
        return isCurrent();
      }
      // A cross-mode switch dismantles the prior mode BEFORE the new one is
      // committed. If the caller aborts in that window the switch never lands,
      // and the resting state is Context OFF — reported as such by
      // setContextMode rather than dressed up as a clean cancellation. See the
      // note above _restoreContextSessionAfterLayerSettles.
      const crossModeSwitch = Boolean(this._contextMode && this._contextMode !== mode);
      if (crossModeSwitch) {
        this._contextMode = null;
        await this._restoreContextSession({ notificationToken, signal });
        if (!isCurrent()) return false;
        if (signal?.aborted) return false;
      }
      this._captureContextSessionSnapshot();
      this._contextMode = mode;
      this._syncContextModeButtons();
      // Replay isolation must settle before Space Missions starts. Contacts
      // keeps its non-dependency teardown in the background so slow source
      // shutdown does not delay cockpit entry.
      try {
        await this._clearLayersOutsideContextMode(mode, { notificationToken, signal });
      } catch (error) {
        if (!isCurrent()) return false;
        let transitionError = error;
        console.warn(`[Context] ${mode} isolation failed`, error);
        this._contextMode = null;
        this._syncContextModeButtons();
        try {
          await this._restoreContextSession({ notificationToken });
        } catch (restoreError) {
          transitionError = mergeContextTransitionErrors(transitionError, restoreError);
          this._contextTransitionFailedLayerIds = [...(transitionError.failedLayerIds || [])];
          throw transitionError;
        }
        this._contextTransitionFailedLayerIds = [...(transitionError?.failedLayerIds || [])];
        return false;
      }
      if (!isCurrent()) return false;
      // Entry is one transaction: isolation succeeded above, so a failed mode
      // activation must roll the cleared layers back instead of stranding the
      // user in a half-entered mode with an orphaned snapshot.
      const entryLayerId = mode === 'flights' ? 'military-awareness' : 'rocket-launches';
      if (mode === 'flights') {
        this._dataManager.setLayerParams('military-awareness', { passive: false });
      }
      let activated = false;
      let activationError = null;
      let activationIntent = null;
      let terminalIntentOutcome = null;
      try {
        activationIntent = this._dataManager._setEnabledWithIntent(
          entryLayerId,
          true,
          { notificationToken, ...(signal ? { signal } : {}) },
        );
        this._contextModeEntryIntent = {
          generation,
          layerId: entryLayerId,
          intentEpoch: activationIntent.intentEpoch,
        };
        activated = await activationIntent.promise;
        terminalIntentOutcome = await this._dataManager._waitForVisibilityIntent?.(
          entryLayerId,
          activationIntent.intentEpoch,
        );
      } catch (error) {
        activationError = error;
      }
      if (!isCurrent()) return false;
      let replacementIntent = mode === 'space-missions'
        && this._contextModeReplacementIntent?.generation === generation
        && this._contextModeReplacementIntent.layerId === entryLayerId
        ? this._contextModeReplacementIntent
        : null;
      while (replacementIntent) {
        const outcome = await this._dataManager._waitForVisibilityIntent?.(
          entryLayerId,
          replacementIntent.intentEpoch,
        );
        terminalIntentOutcome = outcome;
        if (!isCurrent()) return false;
        const replacementOwnsMode = outcome?.intentEpoch === replacementIntent.intentEpoch
          && outcome.enabled === true
          && outcome.succeeded === true;
        if (replacementOwnsMode) {
          this._contextModeEntering = null;
          this._contextModeEntryIntent = null;
          this._contextModeReplacementIntent = null;
          this._syncContextModeButtons();
          return true;
        }
        const successorEpoch = outcome?.cancellationReason === 'superseded'
          && outcome.successorEnabled === true
          && Number.isInteger(outcome.successorIntentEpoch)
          && outcome.successorIntentEpoch > replacementIntent.intentEpoch
          ? outcome.successorIntentEpoch
          : null;
        replacementIntent = successorEpoch === null ? null : {
          generation,
          layerId: entryLayerId,
          intentEpoch: successorEpoch,
        };
      }
      if (activationError || activated === false || !this._dataManager.isEnabled(entryLayerId)) {
        const cancelledAndSettled = terminalIntentOutcome?.succeeded === false
          && ['caller-abort', 'resource-abort', 'superseded'].includes(
            terminalIntentOutcome.cancellationReason,
          );
        let transitionError = null;
        if (!cancelledAndSettled) {
          transitionError = activationError instanceof Error
            ? activationError
            : new Error(`Context activation failed for: ${entryLayerId}`);
          transitionError.failedLayerIds = [...new Set([
            ...(transitionError.failedLayerIds || []),
            entryLayerId,
          ])];
          this._contextTransitionFailedLayerIds = [...transitionError.failedLayerIds];
          console.warn(`[Context] ${mode} activation failed; restoring previous layers`, activationError || 'not enabled');
        }
        this._contextMode = null;
        this._contextModeEntryIntent = null;
        this._contextModeReplacementIntent = null;
        this._syncContextModeButtons();
        try {
          await this._restoreContextSession({
            excludeLayerIds: [entryLayerId],
            notificationToken,
          });
        } catch (restoreError) {
          transitionError = mergeContextTransitionErrors(transitionError, restoreError);
          this._contextTransitionFailedLayerIds = [...(transitionError?.failedLayerIds || [])];
          throw transitionError;
        }
        // `null` means the requested entry was cancelled and its exact rollback
        // completed. The action wrapper treats that as a silent non-commit,
        // while callers still require literal `true` before expanding Context.
        return cancelledAndSettled ? null : false;
      }
      this._contextModeEntryIntent = null;
      return true;
    } finally {
      if (isCurrent()) {
        this._contextModeChanging = false;
        this._globalContextFlightsBtn && (this._globalContextFlightsBtn.disabled = false);
        this._globalContextMissionsBtn && (this._globalContextMissionsBtn.disabled = false);
        this._syncContextModeButtons();
      }
    }
  },

  async _deactivateContextForLayerChange({ notificationToken = null } = {}) {
    this._contextModeGeneration += 1;
    this._contextModeChanging = true;
    this._contextMode = null;
    this._contextModeEntryIntent = null;
    this._contextModeReplacementIntent = null;
    if (this.cockpitView?.active) this.cockpitView.exit({ restoreTracking: false });
    this._syncContextModeButtons();
    try {
      await this._restoreContextSession({ notificationToken });
    } finally {
      this._contextModeChanging = false;
      this._syncContextModeButtons();
    }
  },

  async _clearLayersOutsideContextMode(
    mode = null,
    { notificationToken = null, signal = null } = {},
  ) {
    const allowed = contextAllowedLayerIds(mode);
    const pending = [];
    for (const [layerId] of this._dataManager.layers || []) {
      // Effective visibility: a disallowed layer still mid-ENABLING must be
      // isolated too, or it settles ON inside the exclusive mode.
      if (!allowed.has(layerId) && this._dataManager.isEffectivelyEnabled(layerId)) {
        pending.push({
          layerId,
          transition: this._dataManager.setEnabled(layerId, false, {
            notificationToken,
            ...(signal ? { signal } : {}),
          }),
        });
      }
    }
    const results = await Promise.all(pending.map(({ transition }) => transition));
    const failed = pending
      .filter(({ layerId }, index) => results[index] === false || this._dataManager.isEnabled(layerId))
      .map(({ layerId }) => layerId);
    if (failed.length > 0) {
      const error = new Error(`Context isolation failed for: ${failed.join(', ')}`);
      error.failedLayerIds = failed;
      throw error;
    }
  },

  _handleContextLayerChange(change) {
    if (change?.layerId === 'radio' && [
      'visibility-transition',
      'visibility',
      'visibility-cancelled',
      'visibility-failed',
    ].includes(change.type)) {
      this._renderRadioState(this._dataManager?.getLayerUIState('radio'));
    }
    if (change?.type === 'visibility-transition') return;
    // The effective mode must be read BEFORE the entering flag is cleared:
    // the entry layer's own enable event is the one that clears it, and the
    // session bookkeeping below needs to know a mode was being entered.
    const effectiveContextMode = this._contextModeEntering || this._contextMode;
    if (change?.type === 'visibility-cancelled') {
      const cancellationDisposition = spaceMissionEntryCancellationDisposition({
        change,
      });
      if (
        this._contextModeDeferredEntryIntent?.layerId === change.layerId
        && this._contextModeDeferredEntryIntent.intentEpoch === change.intentEpoch
      ) {
        if (cancellationDisposition !== 'replacement') {
          this._contextModeDeferredEntryIntent = null;
        }
      }
      if (cancellationDisposition === 'replacement') {
        this._contextModeEntering = 'space-missions';
        const entryIntent = this._contextModeEntryIntent;
        if (
          entryIntent?.generation === this._contextModeGeneration
          && entryIntent.layerId === change.layerId
          && entryIntent.intentEpoch === change.intentEpoch
        ) {
          this._contextModeReplacementIntent = {
            generation: entryIntent.generation,
            layerId: change.layerId,
            intentEpoch: change.successorIntentEpoch,
          };
        }
      } else if (cancellationDisposition === 'restore') {
        this._contextModeEntering = null;
        this._contextModeEntryIntent = null;
        this._contextModeReplacementIntent = null;
        if (this._contextSessionSnapshot && !this._contextModeChanging) {
          this._contextMode = null;
          void this._trackContextLayerReaction(this._runUserFacingContextAction(
            async (notificationToken) => {
              await this._restoreContextSessionAfterLayerSettles(
                change.layerId,
                { notificationToken },
              );
              return true;
            },
            'Pembatalan Misi Antariksa tidak dapat memulihkan status layer sebelumnya',
          ));
        }
      }
      this._syncContextModeButtons();
      return;
    }
    if (
      change?.layerId === 'rocket-launches'
      && ['visibility', 'visibility-blocked', 'visibility-failed'].includes(change.type)
    ) {
      this._contextModeEntering = null;
    }
    if (change?.type === 'visibility-blocked') {
      if (!this._userFacingContextNotificationTokens.has(change.notificationToken)) {
        this._showToast(change.reason || 'Layer itu tidak tersedia di mode Konteks saat ini');
      }
      this._syncContextModeButtons();
      return;
    }
    if (change?.type === 'visibility-failed') {
      const failureMessage = `${change.layerId} tidak dapat ${change.enabled ? 'dinyalakan' : 'dimatikan'} dengan benar`;
      // A failed direct Context-shell START has already had its siblings
      // cleared by the visibility guard. Wait outside the synchronous manager
      // notification for this queue to settle, then reconcile the complete
      // snapshot, including an uncertain failed shell.
      const needsDeferredShellRestore = (
        ['military-awareness', 'rocket-launches'].includes(change.layerId)
        && change.enabled
        && this._contextSessionSnapshot
        && !this._contextModeChanging
      );
      if (needsDeferredShellRestore) {
        this._contextMode = null;
        void this._trackContextLayerReaction(this._runUserFacingContextAction(
          async (notificationToken) => {
            await this._restoreContextSessionAfterLayerSettles(
              change.layerId,
              { notificationToken },
            );
            // The wrapper owns failure announcements. On a successful rollback
            // announce the original activation failure here so the same direct
            // action still produces exactly one accessible notification.
            this._showToast(failureMessage);
            return true;
          },
          failureMessage,
        ));
      } else if (!this._userFacingContextNotificationTokens.has(change.notificationToken)) {
        this._showToast(failureMessage);
      }
      this._syncContextModeButtons();
      return;
    }
    if (change?.type === 'visibility-will-change') {
      // Explicit entry capture happens on the synchronous visibility-requested
      // boundary. Keeping this later branch side-effect free prevents an
      // awaited Clear/guard from replacing that authoritative pre-entry view.
      return;
    }
    // Session bookkeeping must run BEFORE any exit path below: the exit
    // handlers restore `snapshot ∪ userAdded`, so a stale entry here becomes
    // a layer resurrected against the user's explicit disable.
    recordContextSessionUserChange({
      snapshot: this._contextSessionSnapshot,
      change,
      effectiveContextMode,
    });
    recordContextRestoreExplicitChange({
      restoreState: this._contextRestoreState,
      change,
    });
    if (shouldExitContextForLayerChange({
      contextMode: this._contextMode,
      globalContextEnabled: !!this._dataManager?.isEnabled('military-awareness'),
      change,
    })) {
      void this._trackContextLayerReaction(this._runUserFacingContextAction((notificationToken) => (
        this._deactivateContextForLayerChange({ notificationToken })
      )));
      return;
    }
    if (!this._contextModeChanging) {
      if (change.layerId === 'military-awareness') {
        // The coordinator remains manager-addressable for restoration and
        // programmatic routes, but Contacts is selected only from the
        // dedicated right-side Global Context chooser.
        this._contextMode = change.enabled
          ? null
          : (this._contextMode === 'flights' ? null : this._contextMode);
        if (change.enabled) {
          this._syncContextModeButtons();
        } else if (this._contextSessionSnapshot) {
          void this._trackContextLayerReaction(this._runUserFacingContextAction((notificationToken) => (
            this._deactivateContextForLayerChange({ notificationToken })
          )));
        }
      } else if (change.layerId === 'rocket-launches') {
        const ownsContextEntry = isExplicitUserIntentOrigin(change.origin, change.layerId)
          || this._contextMode === 'space-missions'
          || effectiveContextMode === 'space-missions';
        if (!ownsContextEntry) return;
        this._contextMode = change.enabled ? 'space-missions' : (this._contextMode === 'space-missions' ? null : this._contextMode);
        if (change.enabled) {
          this._syncContextModeButtons();
        } else if (this._contextSessionSnapshot) {
          void this._trackContextLayerReaction(this._runUserFacingContextAction((notificationToken) => (
            this._deactivateContextForLayerChange({ notificationToken })
          )));
        }
      } else if (
        this._contextMode === 'flights'
        && ['flights', 'military', 'ais-live-vessels', 'military-installations'].includes(change.layerId)
        && !change.enabled
      ) {
        void this._trackContextLayerReaction(this._runUserFacingContextAction((notificationToken) => (
          this._deactivateContextForLayerChange({ notificationToken })
        )));
      }
    }
    if (this.cockpitView?.active && !cockpitEntryAllowed({
      contextMode: this._contextMode,
      contextModeChanging: this._contextModeChanging,
      flightsEnabled: !!this._dataManager?.isEnabled('flights'),
      militaryEnabled: !!this._dataManager?.isEnabled('military'),
    })) {
      this.cockpitView.exit({ restoreTracking: false });
    }
    this._syncContextModeButtons();
  },

  _syncContextModeButtons() {
    const flightsActive = this._contextMode === 'flights';
    const missionsActive = this._contextMode === 'space-missions';
    const panel = document.getElementById('global-context-panel');
    panel?.classList.toggle('context-enabled', flightsActive || missionsActive);
    panel?.setAttribute('data-context-mode', this._contextMode || 'none');
    this._globalContextFlightsBtn?.classList.toggle('active', flightsActive);
    this._globalContextFlightsBtn?.setAttribute('aria-selected', String(flightsActive));
    this._globalContextMissionsBtn?.classList.toggle('active', missionsActive);
    this._globalContextMissionsBtn?.setAttribute('aria-selected', String(missionsActive));
    if (this._globalContextFlightsBtn) this._globalContextFlightsBtn.tabIndex = missionsActive ? -1 : 0;
    if (this._globalContextMissionsBtn) this._globalContextMissionsBtn.tabIndex = missionsActive ? 0 : -1;
    if (this._contextModeStandby) this._contextModeStandby.hidden = flightsActive || missionsActive;
    if (this._contextFlightsView) this._contextFlightsView.hidden = !flightsActive;
    if (this._contextMissionsView) this._contextMissionsView.hidden = !missionsActive;
    this.cockpitView?.syncEntry();
    // Every _contextMode mutation funnels through here; the sync no-ops until
    // the transaction settles, so this is the activation/deactivation edge.
    this._syncContactsDetection();
    this._scheduleRightPanelLayout();
  },

  /**
   * Reads global context mode state for voice/state-sync consumers.
   * @returns {{mode: 'flights'|'space-missions'|null, active: boolean, changing: boolean, entering: 'flights'|'space-missions'|null, snapshotCaptured: boolean}}
   */
  getContextModeState() {
    return {
      mode: this._contextMode || null,
      active: Boolean(this._contextMode),
      changing: Boolean(this._contextModeChanging),
      entering: this._contextModeEntering || null,
      canContact: !this._contextMode || this._contextMode === 'flights',
      canMission: !this._contextMode || this._contextMode === 'space-missions',
      snapshotCaptured: Boolean(this._contextSessionSnapshot),
    };
  },
};
