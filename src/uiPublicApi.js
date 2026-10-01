// StyleManager public control API: HUD, map stack, bloom/sharpen, celestial ring, orbit, context mode.
import {
  ALLOCATION_STRATEGIES,
  canonicalizeDensity,
  defaultDensityForProfile,
  normalizeProfile,
  profileForDensity,
} from './data/detectionPolicy.js';
import { contextModeWord } from './contextModePolicy.js';
import {
  getMode as getDetectionMode,
  getDetectionTuning,
  getDetectionDiagnostics as readDetectionDiagnostics,
  setMode as setDetectionModeByLabel,
} from './data/detection.js';
import { isCelestialRingStyleSupported } from './celestialRing.js';
import { renderMapStackChips, syncMapStackChips } from './mapStackChips.js';

export const publicApiMixin = {
/**
   * Renders the owner-approved map stack chip row from the matching controller
   * entries. Cesium ion/Bing chips remain keyboard-focusable but unavailable,
   * with an accessible explanation, until a CESIUM_ION_TOKEN is configured.
   * @returns {void}
   */
  _initMapStackControl() {
    if (!this._mapStackChips || !this.mapStackController) return;

    if (!this._mapStackChangeHandler) {
      // Provider-driven transitions (notably Esri tile-error fallback) do not
      // pass through `_setMapStack()`. Follow the controller's existing public
      // event so the lit tile, the status line, AND the durable share state all
      // describe the rendered source — without the share sync, a silent
      // fallback leaves copyLink() encoding a stack that is no longer shown.
      this._mapStackChangeHandler = (event) => {
        this._renderMapStackState(event.detail);
        this._syncShareState();
        // The photoreal coverage-gap watchdog also fires silently through
        // this same event — unlike the Esri→OSM tile-failure fallback, a
        // sudden loss of Google 3D at a spot the user deliberately flew to
        // is visually obvious, so it gets an explicit toast on top of the
        // status chip's amber warn state.
        if (this.mapStackController?.consumeCoverageFallbackFlag?.()) {
          this._showToast(event.detail?.lastError || 'Google 3D has no coverage here — showing Esri Satellite');
        }
      };
      window.addEventListener('gev:map-stack-changed', this._mapStackChangeHandler);
    }

    renderMapStackChips(this._mapStackChips, this.mapStackController.getStacks(), {
      activeId: this.mapStackController.getActiveId(),
      onSelect: (stackId) => { this._setMapStack(stackId); },
    });

    this._renderMapStackState(this.mapStackController.getState());
  },

/**
   * Switches the active map/globe source stack.
   * @param {string} stackId - Map stack id.
   * @param {object} [options]
   * @param {boolean} [options.syncShare=true] - Whether to update the share link.
   * @returns {Promise<void>}
   */
  async _setMapStack(stackId, { syncShare = true } = {}) {
    if (!this.mapStackController) return;
    if (syncShare) this.shareLinkManager?.claimRestoreLane?.('map');
    const before = this.mapStackController.getActiveId();
    this._renderMapStackState(this.mapStackController.getState('switching'));
    const state = await this.mapStackController.setStack(stackId);
    this._renderMapStackState(state);

    if (state?.activeId === before && stackId !== before && state?.lastError) {
      this._showToast(state.lastError);
    }
    if (syncShare) this._syncShareState();
  },

/**
   * Syncs the map stack chip row and status chip with controller state. The
   * lit chip always follows `state.activeId`, never the click — a rejected or
   * superseded switch therefore leaves the genuinely active stack lit.
   * @param {object} state - Map stack controller state.
   * @returns {void}
   */
  _renderMapStackState(state) {
    if (!state) return;
    syncMapStackChips(this._mapStackChips, state.activeId);
    if (this._mapStackStatus) {
      const stack = state.activeStack;
      const label = state.status === 'switching'
        ? '...'
        : (stack?.shortLabel || stack?.label || 'MAP');
      this._mapStackStatus.textContent = label;
      this._mapStackStatus.classList.toggle('warn', !!state.lastError);
    }
  },

/**
   * Toggles "clean view" mode which hides all UI panels via a CSS body class.
   * @param {boolean} [forceEnabled] - Explicit on/off. Omit to toggle.
   * @returns {void}
   */
  toggleCleanView(forceEnabled) {
    const shouldEnable = typeof forceEnabled === 'boolean'
      ? forceEnabled
      : !document.body.classList.contains('ui-clean-view');
    document.body.classList.toggle('ui-clean-view', shouldEnable);
    if (this._cleanViewBtn) {
      this._cleanViewBtn.classList.toggle('active', shouldEnable);
    }
    this._scheduleLeftPanelLayout();
  },

// ── Public control facade ──────────────────────────────────────────────
  // Deliberate API for voice tools and scripting. Every setter keeps the DOM
  // sliders, share-link state, and scene snapshots in sync, and returns
  // { ok, ...resultingState } so callers confirm only what actually happened.

  /**
   * Sets HUD visibility mode. 'auto' restores style-driven show/hide.
   * @param {'on'|'off'|'auto'} mode - Visibility mode.
   * @returns {{ok: boolean, visible?: boolean, layout?: string, error?: string}}
   */
  setHudVisible(mode) {
    const normalized = String(mode ?? '').toLowerCase();
    if (!['on', 'off', 'auto'].includes(normalized)) {
      return { ok: false, error: `Unknown HUD visibility mode: ${mode}` };
    }
    this.shareLinkManager?.claimRestoreLane?.('visual');
    this.hud.setMode(normalized);
    this._updateHudButtonState();
    this._syncShareState();
    return { ok: true, visible: !!this.hud.visible, mode: normalized, layout: this.hud.getVariant() };
  },

/**
   * Switches the HUD layout variant.
   * @param {'tactical'|'operator'|'minimal'} variantName - Layout variant.
   * @returns {{ok: boolean, layout?: string, visible?: boolean, error?: string}}
   */
  setHudLayout(variantName) {
    const variant = String(variantName ?? '').toLowerCase();
    if (!['tactical', 'operator', 'minimal'].includes(variant)) {
      return { ok: false, error: `Unknown HUD layout: ${variantName}` };
    }
    this.shareLinkManager?.claimRestoreLane?.('visual');
    this._setHudVariant(variant);
    return { ok: true, layout: this.hud.getVariant(), visible: !!this.hud.visible };
  },

/**
   * Reads current detection overlay state (engine mode + UI density percent).
   * @returns {{detectionMode: string, densityPct: number|null, allocationStrategy:string, fadePct:number, outsideOpacityPct:number}}
   */
  getDetectionState() {
    const pct = this._detectionDensitySlider
      ? parseInt(this._detectionDensitySlider.value, 10)
      : null;
    return {
      detectionMode: getDetectionMode(),
      densityPct: pct,
      allocationStrategy: getDetectionTuning().allocationStrategy,
      fadePct: parseInt(this._detectionFadeSlider?.value || '7', 10),
      outsideOpacityPct: parseInt(this._detectionOpacitySlider?.value || '0', 10),
    };
  },

/** Read-only overlay diagnostics used by browser QA and regression harnesses. */
  getDetectionDiagnostics() {
    return readDetectionDiagnostics();
  },

/**
   * Controls the detection overlay: on/off, mode, and density percent.
   * Density writes the slider AND the engine so share links and scene
   * snapshots stay truthful.
   * @param {object} [options]
   * @param {boolean} [options.enabled] - false forces OFF; true restores the current density profile.
   * @param {'sparse'|'balanced'|'dense'|'panoptic'} [options.mode] - Profile (legacy aliases accepted).
   * @param {number} [options.densityPct] - 0-100 density percent.
   * @param {'elastic'|'weighted'} [options.allocationStrategy] - Layer-capacity policy.
   * @param {number} [options.fadePct] - Fade distance as 0-40% of the keyhole radius.
   * @param {number} [options.outsideOpacityPct] - Opacity beyond the fade distance, 0-100%.
   * @returns {{ok: boolean, detectionMode?: string, densityPct?: number|null, error?: string}}
   */
  setDetection({ enabled, mode, densityPct, allocationStrategy, fadePct, outsideOpacityPct } = {}) {
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return { ok: false, error: `Invalid detection enabled value: ${enabled}`, ...this.getDetectionState() };
    }
    let requestedProfile = null;
    if (typeof mode === 'string' && mode.trim()) {
      requestedProfile = normalizeProfile(mode);
      if (!requestedProfile) {
        return { ok: false, error: `Unknown detection mode: ${mode}`, ...this.getDetectionState() };
      }
    }
    let requestedDensity = null;
    if (densityPct != null) {
      if (!Number.isFinite(Number(densityPct))) {
        return { ok: false, error: `Invalid density: ${densityPct}`, ...this.getDetectionState() };
      }
      requestedDensity = canonicalizeDensity(Number(densityPct));
    }
    if (requestedProfile && requestedProfile !== 'OFF' && requestedDensity != null
      && profileForDensity(requestedDensity) !== requestedProfile) {
      return {
        ok: false,
        error: `Detection mode ${requestedProfile} conflicts with density ${requestedDensity}%`,
        ...this.getDetectionState(),
      };
    }
    let requestedAllocation = null;
    if (allocationStrategy != null) {
      requestedAllocation = String(allocationStrategy).trim().toUpperCase();
      if (!ALLOCATION_STRATEGIES.includes(requestedAllocation)) {
        return { ok: false, error: `Unknown allocation strategy: ${allocationStrategy}`, ...this.getDetectionState() };
      }
    }
    if (fadePct != null) {
      if (!Number.isFinite(Number(fadePct))) {
        return { ok: false, error: `Invalid fade distance: ${fadePct}`, ...this.getDetectionState() };
      }
    }
    if (outsideOpacityPct != null) {
      if (!Number.isFinite(Number(outsideOpacityPct))) {
        return { ok: false, error: `Invalid outside opacity: ${outsideOpacityPct}`, ...this.getDetectionState() };
      }
    }
    const hasExplicitVisualChange = typeof enabled === 'boolean'
      || requestedProfile !== null
      || requestedDensity !== null
      || requestedAllocation !== null
      || fadePct != null
      || outsideOpacityPct != null;
    if (hasExplicitVisualChange) {
      // Voice/scripted detection control counts as an explicit user choice, so
      // neither style presets nor a still-pending shared visual restore can
      // overwrite it afterward.
      this.shareLinkManager?.claimRestoreLane?.('visual');
      this._detectionUserOverridden = true;
    }
    if (requestedAllocation) {
      this._setDetectionAllocation(requestedAllocation, { syncShare: false });
    }
    if (fadePct != null && this._detectionFadeSlider) {
      this._detectionFadeSlider.value = String(Math.max(0, Math.min(40, Math.round(Number(fadePct)))));
    }
    if (outsideOpacityPct != null && this._detectionOpacitySlider) {
      this._detectionOpacitySlider.value = String(Math.max(0, Math.min(100, Math.round(Number(outsideOpacityPct)))));
    }
    if (fadePct != null || outsideOpacityPct != null) this._applyDetectionFadeFromUi();

    if (requestedProfile && requestedProfile !== 'OFF' && requestedDensity == null) {
      requestedDensity = defaultDensityForProfile(requestedProfile);
    }
    if (requestedDensity != null && this._detectionDensitySlider) {
      this._detectionDensitySlider.value = String(requestedDensity);
      this._applyDetectionDensityFromUi();
    }

    if (enabled === false || requestedProfile === 'OFF') {
      setDetectionModeByLabel('OFF');
    } else if (requestedProfile) {
      setDetectionModeByLabel(requestedProfile);
    } else if (enabled === true && getDetectionMode() === 'OFF') {
      setDetectionModeByLabel(profileForDensity(
        requestedDensity ?? this._detectionDensitySlider?.value ?? 50,
      ));
    }
    this._syncDetectionUiFromEngine();
    this._syncShareState();
    return { ok: true, ...this.getDetectionState() };
  },

/**
   * Switches the basemap stack and reports whether the switch landed.
   * @param {string} stackId - One of mapStackController.getStacks() ids.
   * @returns {Promise<{ok: boolean, activeStack?: string, error?: string|null, available?: string[]}>}
   */
  async setMapStack(stackId) {
    if (!this.mapStackController) {
      return { ok: false, error: 'Map stack controller unavailable' };
    }
    const stacks = this.mapStackController.getStacks();
    const target = stacks.find((stack) => stack.id === stackId);
    if (!target) {
      return { ok: false, error: `Unknown map stack: ${stackId}`, available: stacks.map((s) => s.id) };
    }
    if (!target.available) {
      return { ok: false, error: `${target.label} requires a Cesium ion token`, activeStack: this.mapStackController.getActiveId() };
    }
    await this._setMapStack(stackId);
    const state = this.mapStackController.getState();
    const landed = state.activeId === stackId;
    return {
      ok: landed,
      activeStack: state.activeId,
      error: landed ? null : (state.lastError || 'Map stack did not switch'),
    };
  },

/**
   * Controls bloom post-processing. Intensity is the UI percent (0-200).
   * @param {object} [options]
   * @param {boolean} [options.enabled]
   * @param {number} [options.intensityPct] - 0-200.
   * @returns {{ok: boolean, bloom: {enabled: boolean, intensityPct: number|null}}}
   */
  setBloom({ enabled, intensityPct } = {}) {
    const current = () => ({
      enabled: !!this.bloomEnabled,
      intensityPct: this._bloomSlider ? parseInt(this._bloomSlider.value, 10) : null,
    });
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return { ok: false, error: `Invalid bloom enabled value: ${enabled}`, bloom: current() };
    }
    if (intensityPct !== undefined
      && (typeof intensityPct !== 'number' || !Number.isFinite(intensityPct))) {
      return { ok: false, error: `Invalid bloom intensity: ${intensityPct}`, bloom: current() };
    }
    const hasExplicitVisualChange = intensityPct !== undefined || enabled !== undefined;
    if (hasExplicitVisualChange) this.shareLinkManager?.claimRestoreLane?.('visual');
    if (intensityPct !== undefined) {
      this._setBloomIntensity(Math.round(Math.max(0, Math.min(200, intensityPct))));
    }
    if (enabled !== undefined) this._setBloomEnabled(enabled);
    return {
      ok: true,
      bloom: current(),
    };
  },

/**
   * Controls sharpen post-processing. Intensity is the UI percent (0-100).
   * @param {object} [options]
   * @param {boolean} [options.enabled]
   * @param {number} [options.intensityPct] - 0-100.
   * @returns {{ok: boolean, sharpen: {enabled: boolean, intensityPct: number|null}}}
   */
  setSharpen({ enabled, intensityPct } = {}) {
    const current = () => ({
      enabled: !!this.sharpenEnabled,
      intensityPct: this._sharpenSlider ? parseInt(this._sharpenSlider.value, 10) : null,
    });
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return { ok: false, error: `Invalid sharpen enabled value: ${enabled}`, sharpen: current() };
    }
    if (intensityPct !== undefined
      && (typeof intensityPct !== 'number' || !Number.isFinite(intensityPct))) {
      return { ok: false, error: `Invalid sharpen intensity: ${intensityPct}`, sharpen: current() };
    }
    const hasExplicitVisualChange = intensityPct !== undefined || enabled !== undefined;
    if (hasExplicitVisualChange) this.shareLinkManager?.claimRestoreLane?.('visual');
    if (intensityPct !== undefined) {
      const pct = Math.round(Math.max(0, Math.min(100, intensityPct)));
      if (this._sharpenSlider) this._sharpenSlider.value = String(pct);
      if (this._sharpenSliderValue) this._sharpenSliderValue.textContent = `${pct}%`;
      this._applySharpenIntensity(pct / 100);
      this._syncShareState();
    }
    if (enabled !== undefined) this._setSharpenEnabled(enabled);
    return {
      ok: true,
      sharpen: current(),
    };
  },

/**
   * Controls the celestial ring. The Display button uses `focus=true` when the
   * ring is disabled or unavailable at the current zoom, turning the control
   * into a reveal action instead of requiring a separate globe-navigation step.
   * @param {boolean} enabled
   * @param {object} [options]
   * @param {boolean} [options.syncShare=true]
   * @param {boolean} [options.focus=false]
   * @returns {{ok:boolean, celestialRing:{enabled:boolean,visible:boolean}, cameraFocused:boolean, error?:string}}
   */
  setCelestialRingEnabled(enabled, { syncShare = true, focus = false } = {}) {
    const styleSupported = isCelestialRingStyleSupported(this.activeStyle);
    const current = () => ({
      enabled: this.celestialRingEnabled,
      visible: !!this.celestialRing?.visible,
    });
    if (typeof enabled !== 'boolean') {
      return {
        ok: false,
        celestialRing: current(),
        cameraFocused: false,
        error: `Invalid celestial ring enabled value: ${enabled}`,
      };
    }
    if (typeof syncShare !== 'boolean' || typeof focus !== 'boolean') {
      return {
        ok: false,
        celestialRing: current(),
        cameraFocused: false,
        error: 'Celestial ring options must be boolean',
      };
    }
    if (!styleSupported && enabled) {
      return {
        ok: false,
        celestialRing: current(),
        cameraFocused: false,
        error: 'Celestial ring is available only in Normal style',
      };
    }
    if (syncShare) this.shareLinkManager?.claimRestoreLane?.('visual');
    const nextEnabled = styleSupported && enabled;
    this.celestialRing?.setEnabled(nextEnabled);
    this._celestialBtn?.classList.toggle('active', nextEnabled);
    this._celestialBtn?.setAttribute('aria-pressed', String(nextEnabled));
    if (this._celestialBtn) {
      this._celestialBtn.disabled = !styleSupported;
      this._celestialBtn.setAttribute('aria-disabled', String(!styleSupported));
      this._celestialBtn.title = styleSupported
        ? 'Celestial ring — reveal the full globe'
        : 'Celestial ring — available in Normal style';
    }
    let cameraFocused = false;
    if (nextEnabled && focus) {
      cameraFocused = !!this.celestialRing?.focusFullGlobe();
    }
    if (syncShare) this._syncShareState();
    return {
      ok: styleSupported || !enabled,
      celestialRing: current(),
      cameraFocused,
    };
  },

/**
   * Starts or stops orbiting the active POI.
   * @param {boolean} [enabled] - Omit to toggle.
   * @returns {{ok: boolean, orbiting: boolean, error?: string}}
   */
  setOrbit(enabled) {
    const active = !!this.orbitController?.active;
    if (typeof enabled === 'boolean' && enabled === active) {
      return { ok: true, orbiting: active };
    }
    if (enabled === false) {
      this._stopOrbit();
      return { ok: true, orbiting: false };
    }
    if (!this._currentTarget) {
      return { ok: false, orbiting: false, error: 'No active landmark to orbit — fly to a landmark first' };
    }
    this._toggleOrbit();
    return { ok: true, orbiting: !!this.orbitController?.active };
  },

/**
   * Sets global context mode (Contacts / Space Missions / off) for voice.
   * @param {'contacts'|'space-missions'|'off'|null} mode - Requested context target.
   * @param {object} [options]
   * @param {string|Symbol|null} [options.notificationToken]
   * @param {AbortSignal|null} [options.signal]
   * @param {Function|null} [options.isCurrent]
   * @param {boolean} [options.claimVisualAuthority] Whether this request is a
   *   genuine operator/voice Context intent that should take the visual restore
   *   lane. Cockpit choreography calls this facade INTERNALLY for its own
   *   enter/rollback steps; those transitions are not a Context request by the
   *   operator and must stay inert, so they pass `false`.
   * @returns {Promise<{ok:boolean, mode:'flights'|'space-missions'|null, active:boolean, action:string, error?:string}>}
   */
  async setContextMode(mode, {
    notificationToken = null,
    signal = null,
    isCurrent = null,
    claimVisualAuthority = true,
  } = {}) {
    const requestIsCurrent = () => !signal?.aborted
      && (typeof isCurrent !== 'function' || isCurrent());
    const cancellationResult = () => ({
      ok: false,
      action: 'set_context_mode',
      cancelled: true,
      error: 'Context request was superseded by a newer voice turn',
      ...this.getContextModeState(),
      ...(this._contextTransitionFailedLayerIds?.length
        ? { failedLayerIds: [...this._contextTransitionFailedLayerIds] }
        : {}),
    });
    if (!requestIsCurrent()) return cancellationResult();
    try {
      if (!mode || mode === 'off') {
        // Validated explicit transition — Context owns detection, so take the
        // visual lane before a delayed shared restore can reclaim it. Internal
        // Cockpit choreography opts out: it is not an operator Context request.
        if (claimVisualAuthority) this._claimContextVisualAuthority();
        const result = await this._selectContextMode(null, { notificationToken, signal });
        if (result === null || (!requestIsCurrent() && result !== true)) return cancellationResult();
        const state = this.getContextModeState();
        return {
          ok: result === true,
          action: 'set_context_mode',
          mode: state.mode,
          ...state,
          ...(result === true ? {} : { error: 'Context mode transition did not complete' }),
          ...(this._contextTransitionFailedLayerIds?.length
            ? { failedLayerIds: [...this._contextTransitionFailedLayerIds] }
            : {}),
        };
      }
      const canonical = mode === 'contacts' ? 'flights' : mode;
      if (!['flights', 'space-missions'].includes(canonical)) {
        return {
          ok: false,
          action: 'set_context_mode',
          error: `Unknown context mode: ${mode}`,
          mode: this._contextMode,
          ...this.getContextModeState(),
        };
      }
      const priorMode = this._contextMode;
      // Claimed only after the mode enum validates above, so a rejected request
      // takes no authority and leaves the shared visual state eligible. Internal
      // Cockpit choreography opts out: it is not an operator Context request.
      if (claimVisualAuthority) this._claimContextVisualAuthority();
      const transitioned = await this._selectContextMode(canonical, { notificationToken, signal });
      if (transitioned === null || (!requestIsCurrent() && transitioned !== true)) return cancellationResult();
      const state = this.getContextModeState();
      // A cross-mode switch tears the prior mode down before it commits, so a
      // cancelled or failed switch rests on Context OFF. Say that plainly:
      // reporting a bare "did not complete" while the operator's Context is
      // gone is the dishonesty this whole path was fixed for. The state fields
      // below carry the same verdict, so text and state cannot disagree.
      const crossModeSwitchLost = transitioned !== true
        && Boolean(priorMode) && priorMode !== canonical && !state.mode;
      return {
        ok: transitioned === true,
        action: 'set_context_mode',
        mode: state.mode,
        ...state,
        ...(transitioned === true ? {} : {
          // Named in the operator's vocabulary, not the internal id: this
          // string is read by the voice model, which takes 'contacts'.
          error: crossModeSwitchLost
            ? `Switch to ${contextModeWord(canonical)} did not complete — Context is now off`
            : 'Context mode transition did not complete',
          ...(crossModeSwitchLost ? { contextOff: true, priorMode } : {}),
        }),
        ...(this._contextTransitionFailedLayerIds?.length
          ? { failedLayerIds: [...this._contextTransitionFailedLayerIds] }
          : {}),
      };
    } catch (error) {
      if (!requestIsCurrent()) {
        return {
          ...cancellationResult(),
          ...(Array.isArray(error?.failedLayerIds)
            ? { failedLayerIds: [...error.failedLayerIds] }
            : {}),
        };
      }
      return {
        ok: false,
        action: 'set_context_mode',
        error: error?.message || 'Context mode transition failed',
        ...(Array.isArray(error?.failedLayerIds)
          ? { failedLayerIds: [...error.failedLayerIds] }
          : {}),
        ...this.getContextModeState(),
      };
    }
  },

// Cockpit Control Facade (getCockpitState, _retargetCockpitEntryLayer,
  // controlCockpit, getControlState, getCameraState/applyCameraState,
  // getVisualState/applyVisualState) now lives in cockpitControlMixin.js —
  // mechanical relocation, see that file's header. Layer access there is via
  // the DataLayerManager facade (getContextSnapshot/navigateNext/
  // callLayerMethod), not direct flights/military/militaryAwareness imports.

  /**
   * Resets the safe-frame overlay to its inactive state on init.
   * @returns {void}
   */
  _initRecordingOverlay() {
    if (!this._safeFrameOverlay || !this._safeFrameBox) return;
    this._safeFrameOverlay.classList.remove('active', 'ratio-9-16', 'ratio-16-9');
  },

// ── Orbit Mode ──────────────────────────────

  /**
   * Creates the orbit mode indicator DOM element and appends it to the body.
   * @returns {void}
   */
  _initOrbit() {
    // Create orbit indicator element
    this._orbitIndicator = document.createElement('div');
    this._orbitIndicator.id = 'orbit-indicator';
    this._orbitIndicator.innerHTML = '<span class="orbit-icon">&#x21BB;</span> ORBIT';
    document.body.appendChild(this._orbitIndicator);
  },

/**
   * Toggles the orbit controller around the current POI target. Shows a toast
   * if no target position has been set (user must fly to a POI first).
   * @returns {void}
   */
  _toggleOrbit() {
    if (!this._currentTarget) {
      this._showToast('Fly to a POI first');
      return;
    }

    const isActive = this.orbitController.toggle(this._currentTarget, {
      radius: this._currentPoi?.alt || 500,
      pitch: this._currentPoi?.pitch || -30,
    });

    this._orbitIndicator.classList.toggle('active', isActive);
  },

/**
   * Stops orbit mode if active and hides the orbit indicator.
   * @returns {void}
   */
  _stopOrbit() {
    if (this.orbitController.active) {
      this.orbitController.stop();
      this._orbitIndicator.classList.remove('active');
    }
  },
};

