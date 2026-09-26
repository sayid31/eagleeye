import * as Cesium from 'cesium';
import { enterCockpitWithTracking } from './cockpitTracking.js';
import flightsLayer from './data/flights.js';
import militaryFlightsLayer from './data/militaryFlights.js';
import militaryAwarenessLayer from './data/militaryAwareness.js';
import { BLOOM_SCALE_VERSION, decodeBloomIntensity } from './bloom.js';
import {
  getDetectionTuning,
  getMode as getDetectionMode,
} from './data/detection.js';
import { canonicalizeDensity } from './data/detectionPolicy.js';
import {
  setScopeMaskEnabled,
  isScopeMaskEnabled,
  setScopeMaskFeather,
  getScopeMaskFeather,
  setScopeMaskOpacity,
  getScopeMaskOpacity,
} from './scopeMask.js';
import { STYLES } from './ui.js';

/**
 * Prototype mixin for StyleManager (see `ui.js`): the Cockpit Control
 * Facade — cockpit status/entry/exit/navigation (`getCockpitState`,
 * `_retargetCockpitEntryLayer`, `controlCockpit`) plus the voice/scene
 * control-state and visual-state snapshot/restore pair (`getControlState`,
 * `getCameraState`/`applyCameraState`, `getVisualState`/`applyVisualState`).
 * These sit together because `controlCockpit`'s 'status' branch and
 * `getVisualState`/`applyVisualState` are the two state surfaces the voice
 * agent and `SceneDirector` read from and restore to.
 *
 * This is a mechanical method-body relocation to shrink `ui.js`, not a
 * logic extraction: fields are still declared and initialized in the
 * `StyleManager` constructor in `ui.js`; only the method bodies live here.
 * `this.foo()` calls into the rest of the prototype (`getAircraftTrackingTarget`
 * — already relocated to `navigationLocationMixin.js` — `setStyle`,
 * `_setBloomIntensity`, `_setMapStack`, `_syncShareState`, etc.) and reads of
 * `this.viewer`/`this.cockpitView`/`this.stages`/`this.mapStackController`
 * resolve normally via prototype dispatch — no call site anywhere in
 * `ui.js`, `gevActions.js`, or `director.js` needed to change. Please don't
 * "fix" this into a delegate/composed object; that would require rewriting
 * every one of those call sites for no behavior change.
 *
 * Split-import constants/singletons — read here AND by code that stays in
 * `ui.js`, so each is imported independently in both files (same pattern
 * already used for `trafficLayer` in `navigationLocationMixin.js`):
 * - `STYLES` (module-level shader-module map) — exported from `ui.js`;
 *   `getVisualState`/`applyVisualState` (moved) read it, and 4 other call
 *   sites (`setStyle`, share-state restore, `ShareLinkManager`'s
 *   style-param provider, `_updateSliderPanel`) stay in `ui.js` and read
 *   the same module-level const directly.
 * - `militaryAwarenessLayer`, `militaryFlightsLayer`, `flightsLayer` — also
 *   referenced directly by `initDetection`'s constructor wiring and the
 *   cockpit-exit/context-mode-change cleanup in `ui.js`, which stay there.
 *
 * What stays in `ui.js`, and why:
 * - `getAircraftTrackingTarget` — already lives in `navigationLocationMixin.js`
 *   (Navigation Authority's domain); `controlCockpit` here calls it via
 *   ordinary `this.getAircraftTrackingTarget()` prototype dispatch.
 */
export const cockpitControlMixin = {
  /**
   * Returns cockpit status for voice/state sync and navigation operations.
   * @returns {{active:boolean, entryAllowed:boolean, visionMode:string, subject:{id:string,layerId:string}|null, navigation:{canPrevious:boolean,canNext:boolean,canFocus:boolean}|null, awareness?: object}|null}
   */
  getCockpitState() {
    const snapshot = militaryAwarenessLayer.getContextSnapshot?.();
    const info = this.cockpitView?.readAircraftInfo?.();
    const active = Boolean(this.cockpitView?.active);
    const gateOpen = Boolean(this.cockpitView?.isEntryAllowed?.());
    // "Could Cockpit be ENTERED right now" — so it is false while already
    // inside, unconditionally. Cockpit takes the entity off
    // `viewer.trackedEntity` on entry and NEXT puts one back, which made this
    // flip true/false between calls while `active` stayed true; readers
    // (including the voice model) read that as a broken half-entered state.
    const entryAllowed = !active && Boolean(
      gateOpen
      && info
      && this.viewer?.trackedEntity?.position,
    );
    return {
      active,
      entryAllowed,
      // Why entry is unavailable, so a refusal can be explained rather than
      // guessed at.
      entryBlockedReason: entryAllowed || active
        ? null
        : (!gateOpen
          ? (this._contextModeChanging ? 'contacts-starting' : 'contacts-inactive')
          : 'no-tracked-aircraft'),
      visionMode: this.cockpitView?.visionMode || null,
      subject: info ? {
        id: info.icao24 || info.id || null,
        layerId: info.layerId || null,
        callsign: info.callsign || null,
      } : null,
      navigation: snapshot ? {
        canPrevious: Boolean(snapshot.navigation?.canPrevious),
        canNext: Boolean(snapshot.navigation?.canNext),
        canFocus: Boolean(snapshot.navigation?.canFocus),
      } : null,
      awareness: snapshot ? {
        radiusM: Number.isFinite(snapshot.radiusM) ? snapshot.radiusM : null,
        subject: snapshot.subject ? {
          id: snapshot.subject.id || null,
          layerId: snapshot.subject.layerId || null,
        } : null,
        cohorts: Array.isArray(snapshot.cohorts)
          ? snapshot.cohorts.map((cohort) => ({
            id: cohort?.id || null,
            source: cohort?.source || null,
            count: Number.isFinite(cohort?.count) ? cohort.count : null,
            relationship: cohort?.relationship || null,
            reason: cohort?.reason || null,
            coverage: cohort?.coverage || null,
          }))
          : [],
        navigation: snapshot.navigation ? {
          canPrevious: Boolean(snapshot.navigation.canPrevious),
          canNext: Boolean(snapshot.navigation.canNext),
          canFocus: Boolean(snapshot.navigation.canFocus),
        } : null,
      } : null,
      activeTracked: this.cockpitView?.active ? Boolean(this.cockpitView?.trackedEntity) : false,
      activeMapView: !this.cockpitView?.active && entryAllowed,
    };
  },

  /**
   * Point Cockpit entry at a requested contact layer before it enters.
   *
   * Reuses the filtered Context navigation NEXT already uses, so "cockpit in
   * that military helicopter" lands on the same contact "next military
   * helicopter" would. Cockpit flies aircraft only; vessel and installation
   * layers are refused by name rather than silently ignored.
   * @param {object} options Retarget request.
   * @param {string} options.targetLayer Requested contact layer.
   * @param {string|null} options.aircraftClass Optional class filter.
   * @param {{layerId: string}|null} options.currentTarget Current tracker.
   * @param {{layerId: string}|null} options.selectedTarget Pending selection.
   * @returns {{ok: boolean, retargeted?: boolean, error?: string}} Outcome.
   */
  _retargetCockpitEntryLayer({ targetLayer, aircraftClass, currentTarget, selectedTarget }) {
    if (!['flights', 'military'].includes(targetLayer)) {
      return {
        ok: false,
        error: `Cockpit flies aircraft only — ${targetLayer} contacts cannot be entered`,
      };
    }
    const activeLayer = selectedTarget?.layerId || currentTarget?.layerId || null;
    const alreadyOnLayer = activeLayer === targetLayer;
    if (alreadyOnLayer && !aircraftClass) return { ok: true, retargeted: false };
    const moved = militaryAwarenessLayer?.navigateNext
      ? !!militaryAwarenessLayer.navigateNext({
        targetLayer,
        aircraftClass,
        origin: 'voice',
      })
      : false;
    if (moved) return { ok: true, retargeted: true };
    // A filter that matched nothing still enters, as long as the layer is
    // already right — the operator asked for that layer and is on it.
    if (alreadyOnLayer) return { ok: true, retargeted: false };
    const label = targetLayer === 'military' ? 'military' : 'civilian';
    const filtered = aircraftClass ? `${aircraftClass} ` : '';
    return {
      ok: false,
      error: `No ${filtered}${label} contact is available to enter — track one first, or say "next ${label}"`,
    };
  },

  /**
   * Controls cockpit entry/exit and context navigation.
   * @param {'enter'|'exit'|'next'|'previous'|'status'} action - Cockpit action.
   * @param {object} [options]
   * @param {string|Symbol|null} [options.notificationToken]
   * @param {'flights'|'military'|'ais-live-vessels'|'military-installations'|null} [options.targetLayer]
   * @param {string|null} [options.aircraftClass]
   * @param {{layerId:'flights'|'military',id:string}|null} [options.selectedTarget]
   * @param {{layerId:'flights'|'military',id:string}|null} [options.rollbackTarget]
   * @returns {{ok:boolean, action:string, error?:string, state?:object}}
   */
  controlCockpit(action, {
    notificationToken = null,
    targetLayer = null,
    aircraftClass = null,
    selectedTarget = null,
    rollbackTarget = undefined,
  } = {}) {
    const normalized = String(action || '').toLowerCase();
    if (!this.cockpitView) {
      return {
        ok: false,
        action: 'control_cockpit',
        error: 'Cockpit controller unavailable',
        state: this.getCockpitState(),
      };
    }
    if (normalized === 'status') {
      return {
        ok: true,
        action: 'control_cockpit',
        state: this.getCockpitState(),
        notificationToken: notificationToken || null,
      };
    }
    if (normalized === 'enter') {
      // Entry is gated exactly as the manual entry chip is. Attempting it while
      // the gate is shut produced the half-entered look the operator reported
      // (a plane anchored under the camera with no cockpit around it), so
      // refuse with the reason instead of trying.
      if (!this.cockpitView.isEntryAllowed?.()) {
        return {
          ok: false,
          action: 'control_cockpit',
          error: this._contextModeChanging
            ? 'Contacts is still starting up — try Cockpit again in a moment'
            : 'Contacts must be active to enter Cockpit — say "open contacts" first',
          state: this.getCockpitState(),
        };
      }
      let currentTarget = this.getAircraftTrackingTarget();
      const layerForTarget = (target) => target?.layerId === 'military'
        ? militaryFlightsLayer
        : target?.layerId === 'flights' ? flightsLayer : null;
      // A requested layer retargets BEFORE entry, through the same filtered
      // navigation NEXT uses. Ignoring it entered on whatever was already
      // tracked and reported success, so "cockpit in that military helicopter"
      // silently put the operator in an airliner.
      if (targetLayer) {
        const requested = this._retargetCockpitEntryLayer({
          targetLayer,
          aircraftClass,
          currentTarget,
          selectedTarget,
        });
        if (!requested.ok) {
          return {
            ok: false,
            action: 'control_cockpit',
            error: requested.error,
            state: this.getCockpitState(),
          };
        }
        if (requested.retargeted) {
          // The retarget is now the authority; a selection sampled before it
          // would drag entry back to the wrong layer.
          selectedTarget = null;
          rollbackTarget = rollbackTarget === undefined ? currentTarget : rollbackTarget;
          currentTarget = this.getAircraftTrackingTarget();
        }
      }
      const selectedLayer = selectedTarget?.layerId === 'military'
        ? militaryFlightsLayer
        : selectedTarget?.layerId === 'flights' ? flightsLayer : null;
      const entry = enterCockpitWithTracking({
        cockpitView: this.cockpitView,
        selectedLayer,
        selectedTarget,
        currentLayer: layerForTarget(currentTarget),
        rollbackLayer: layerForTarget(
          rollbackTarget === undefined ? currentTarget : rollbackTarget,
        ),
        rollbackTarget,
        selectionOrigin: 'voice',
      });
      return {
        ok: entry.entered,
        action: 'control_cockpit',
        state: this.getCockpitState(),
        error: entry.error,
      };
    }
    if (normalized === 'exit') {
      const exited = !!this.cockpitView.exit();
      return {
        ok: exited,
        action: 'control_cockpit',
        state: this.getCockpitState(),
        error: exited ? null : 'Cockpit was already inactive',
      };
    }
    if (normalized === 'next' || normalized === 'previous') {
      const changed = this.cockpitView.navigateContext(
        normalized === 'next' ? 1 : -1,
        {
          targetLayer,
          aircraftClass,
          origin: 'voice',
        },
      );
      return {
        ok: changed,
        action: 'control_cockpit',
        state: this.getCockpitState(),
        error: changed ? null : 'No further context target was available',
      };
    }
    return {
      ok: false,
      action: 'control_cockpit',
      error: `Unknown cockpit action: ${action}`,
      state: this.getCockpitState(),
    };
  },

  /**
   * Full control-state snapshot — single source for voice read-back so the
   * agent confirms from the same state it acted on.
   * @returns {object} Current style/stack/HUD/detection/post-processing state.
   */
  getControlState() {
    return {
      style: this.activeStyle || 'normal',
      mapStack: this.mapStackController?.getActiveId?.() || null,
      hud: { visible: !!this.hud?.visible, layout: this.hud?.getVariant?.() || null },
      detection: this.getDetectionState(),
      bloom: {
        enabled: !!this.bloomEnabled,
        intensityPct: this._bloomSlider ? parseInt(this._bloomSlider.value, 10) : null,
      },
      sharpen: {
        enabled: !!this.sharpenEnabled,
        intensityPct: this._sharpenSlider ? parseInt(this._sharpenSlider.value, 10) : null,
      },
      celestialRing: {
        enabled: this.celestialRingEnabled,
        visible: !!this.celestialRing?.visible,
      },
      orbiting: !!this.orbitController?.active,
      recording: !!this._recordingMode,
      cleanView: document.body.classList.contains('ui-clean-view'),
    };
  },

  /**
   * Captures the current camera position and orientation as a serializable object.
   * @returns {{lat: number, lon: number, alt: number, heading: number, pitch: number, roll: number}|null}
   */
  getCameraState() {
    const carto = this.viewer.camera.positionCartographic;
    if (!carto) return null;
    return {
      lat: Cesium.Math.toDegrees(carto.latitude),
      lon: Cesium.Math.toDegrees(carto.longitude),
      alt: carto.height,
      heading: Cesium.Math.toDegrees(this.viewer.camera.heading),
      pitch: Cesium.Math.toDegrees(this.viewer.camera.pitch),
      roll: Cesium.Math.toDegrees(this.viewer.camera.roll),
    };
  },

  /**
   * Flies the camera to a previously captured camera state using cubic ease-in-out.
   * @param {{lat: number, lon: number, alt: number, heading?: number, pitch?: number, roll?: number}} cameraState
   * @param {number} [duration=2.8] - Flight duration in seconds.
   * @returns {void}
   */
  applyCameraState(cameraState, duration = 2.8) {
    if (!cameraState) return;
    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        cameraState.lon,
        cameraState.lat,
        cameraState.alt
      ),
      orientation: {
        heading: Cesium.Math.toRadians(cameraState.heading || 0),
        pitch: Cesium.Math.toRadians(cameraState.pitch || -35),
        roll: Cesium.Math.toRadians(cameraState.roll || 0),
      },
      duration: Math.max(0.2, duration || 0),
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
    });
  },

  /**
   * Snapshots the full visual state (active style, bloom, sharpen, HUD, detection,
   * per-style shader uniform values) for serialization or scene recipe capture.
   * @returns {object} Serializable visual state object.
   */
  getVisualState() {
    const styleParams = {};
    for (const [styleName, stage] of Object.entries(this.stages)) {
      const shader = STYLES[styleName];
      if (!shader?.uniforms) continue;
      styleParams[styleName] = {};
      for (const uniformName of Object.keys(shader.uniforms)) {
        styleParams[styleName][uniformName] = stage.uniforms[uniformName];
      }
    }

    return {
      style: this.activeStyle,
      bloom: {
        enabled: this.bloomEnabled,
        intensity: this._getBloomIntensity(),
        version: BLOOM_SCALE_VERSION,
      },
      sharpen: {
        enabled: this.sharpenEnabled,
        intensity: parseInt(this._sharpenSlider?.value || '49', 10),
      },
      hud: {
        visible: this.hud.visible,
        variant: this.hud.getVariant(),
      },
      detection: {
        mode: getDetectionMode(),
        density: parseInt(this._detectionDensitySlider?.value || '50', 10),
        allocation: getDetectionTuning().allocationStrategy,
        fadePct: parseInt(this._detectionFadeSlider?.value || '7', 10),
        outsideOpacityPct: parseInt(this._detectionOpacitySlider?.value || '0', 10),
      },
      scope: {
        enabled: isScopeMaskEnabled(),
        featherPct: Math.round(getScopeMaskFeather() * 100),
        intensityPct: Math.round(getScopeMaskOpacity() * 100),
      },
      mapStack: this.mapStackController?.getActiveId?.() || 'photoreal',
      styleParams,
    };
  },

  /**
   * Restores a full visual state snapshot, applying style, bloom, sharpen,
   * HUD, detection, and per-style shader uniforms. Used by scene recipes
   * and share-link restore. Async so the map-stack switch resolves before
   * the share state is synced; callers may fire-and-forget.
   * @param {object} [state={}] - Visual state object (as returned by getVisualState).
   * @param {object} [options]
   * @param {(() => boolean)|null} [options.isCurrent] Caller liveness predicate.
   *   The map-stack switch is this method's ONLY suspension point, and the
   *   shader-uniform writes come after it — so a caller superseded while that
   *   switch is in flight would otherwise resume and commit the look of a
   *   state the operator has already moved past. Scene playback reproduced
   *   exactly that: a stale shot's uniforms landing on top of the live run.
   *   Omit it and the method behaves as it always has.
   * @returns {Promise<boolean>} Whether the state was committed.
   */
  async applyVisualState(state = {}, { isCurrent = null } = {}) {
    const superseded = () => typeof isCurrent === 'function' && !isCurrent();
    if (superseded()) return false;

    if (state.style && state.style !== this.activeStyle) {
      this.setStyle(state.style, { applyPreset: false });
    }

    const bloomState = state.bloom || {};
    if (typeof bloomState.intensity === 'number' && this._bloomSlider) {
      const intensity = decodeBloomIntensity(
        bloomState.intensity,
        bloomState.version ?? state.bloomVersion ?? BLOOM_SCALE_VERSION
      );
      this._setBloomIntensity(intensity, { syncShare: false });
    }
    if (typeof bloomState.enabled === 'boolean') {
      this._setBloomEnabled(bloomState.enabled);
    }

    const sharpenState = state.sharpen || {};
    if (typeof sharpenState.intensity === 'number' && this._sharpenSlider) {
      const pct = Math.max(0, Math.min(100, Math.round(sharpenState.intensity)));
      this._sharpenSlider.value = String(pct);
      this._sharpenSliderValue.textContent = `${pct}%`;
      this._applySharpenIntensity(pct / 100);
    }
    if (typeof sharpenState.enabled === 'boolean') {
      this._setSharpenEnabled(sharpenState.enabled);
    }

    const hudState = state.hud || {};
    if (hudState.variant) {
      this._setHudVariant(hudState.variant);
    }
    if (typeof hudState.visible === 'boolean') {
      this.hud.setMode(hudState.visible ? 'on' : 'off');
      this._updateHudButtonState();
    }

    const scopeState = state.scope || {};
    if (typeof scopeState.enabled === 'boolean') {
      setScopeMaskEnabled(scopeState.enabled);
      this._scopeBtn?.classList.toggle('active', scopeState.enabled);
      this._scopeBtn?.setAttribute('aria-pressed', String(scopeState.enabled));
    }
    if (typeof scopeState.featherPct === 'number' && this._scopeFeatherSlider) {
      const pct = Math.max(0, Math.min(100, Math.round(scopeState.featherPct)));
      this._scopeFeatherSlider.value = String(pct);
      if (this._scopeFeatherValue) this._scopeFeatherValue.textContent = `${pct}%`;
      setScopeMaskFeather(pct / 100);
    }
    if (typeof scopeState.intensityPct === 'number' && this._scopeIntensitySlider) {
      const pct = Math.max(0, Math.min(100, Math.round(scopeState.intensityPct)));
      this._scopeIntensitySlider.value = String(pct);
      if (this._scopeIntensityValue) this._scopeIntensityValue.textContent = `${pct}%`;
      setScopeMaskOpacity(pct / 100);
    }

    const detectionState = state.detection || {};
    if (typeof detectionState.density === 'number' && this._detectionDensitySlider) {
      const pct = canonicalizeDensity(detectionState.density);
      this._detectionDensitySlider.value = String(pct);
      if (this._detectionDensityValue) this._detectionDensityValue.textContent = `${pct}%`;
      this._applyDetectionDensityFromUi();
    }
    if (detectionState.allocation) {
      this._setDetectionAllocation(detectionState.allocation, { syncShare: false });
    }
    if (typeof detectionState.fadePct === 'number' && this._detectionFadeSlider) {
      this._detectionFadeSlider.value = String(detectionState.fadePct);
    }
    if (typeof detectionState.outsideOpacityPct === 'number' && this._detectionOpacitySlider) {
      this._detectionOpacitySlider.value = String(detectionState.outsideOpacityPct);
    }
    this._applyDetectionFadeFromUi();
    if (detectionState.mode) {
      this._setDetectionMode(detectionState.mode);
    }

    if (state.mapStack) {
      // The stack switch is itself a MUTATION, not merely a suspension point,
      // so it needs a gate on BOTH sides of the await.
      if (superseded()) return false;
      const stackBefore = this.mapStackController?.getActiveId?.() ?? null;
      const genBefore = this.mapStackController?.getSwitchGeneration?.() ?? null;

      await this._setMapStack(state.mapStack, { syncShare: false });

      if (superseded()) {
        // Superseded DURING the switch, which the pre-check above cannot catch
        // and which has already moved the globe. The controller only
        // invalidates a switch when another setStack() arrives, and a winning
        // state that omits `mapStack` never issues one — every normalized scene
        // shot omits it — so this stale globe would simply stand. Put back what
        // the winner inherited.
        const genAfter = this.mapStackController?.getSwitchGeneration?.() ?? null;
        // _setMapStack issues exactly one setStack(), which advances the
        // generation once, or not at all when the stack was unavailable and
        // nothing was mutated. Anything past that is a NEWER switch whose
        // caller owns the globe now, and reverting would stomp a live intent.
        const globeIsStillOurs = genBefore !== null && genAfter !== null
          && genAfter <= genBefore + 1;
        const landed = this.mapStackController?.getActiveId?.() ?? null;
        if (globeIsStillOurs && stackBefore && landed !== stackBefore) {
          await this._setMapStack(stackBefore, { syncShare: false });
        }
        return false;
      }
      // Everything below is the uniform commit, already past its own gate.
    }

    if (state.styleParams && typeof state.styleParams === 'object') {
      for (const [styleName, params] of Object.entries(state.styleParams)) {
        const stage = this.stages[styleName];
        if (!stage || !params) continue;
        for (const [uniformName, uniformValue] of Object.entries(params)) {
          if (stage.uniforms[uniformName] === undefined) continue;
          stage.uniforms[uniformName] = uniformValue;
        }
      }
      this._updateSliderPanel(this.activeStyle);
    }

    this._syncShareState();
    return true;
  },
};
