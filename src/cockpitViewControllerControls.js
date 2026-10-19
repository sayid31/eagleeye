// CockpitViewController controls: listeners, TR-3B toggle, vision mode, entity adoption and keys.
import { COCKPIT_VISION_MODES, normalizeCockpitVisionMode } from './cockpitVisionPolicy.js';
import { isTr3b, toggleTr3b } from './data/tr3bRegistry.js';
import { normalizeHeading, resolveTrackedAircraftInfo } from './cockpitMath.js';

export const controlsMixin = {
_listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    this._listenerRemovers.push(() => target.removeEventListener(type, handler, options));
  },

syncWeatherToggle(enabled) {
    if (!this.weatherToggle) return;
    const active = !!enabled;
    this.weatherToggle.setAttribute('aria-pressed', String(active));
    this.weatherToggle.setAttribute(
      'aria-label',
      `${active ? 'Matikan' : 'Nyalakan'} efek cuaca kokpit`,
    );
    this.weatherToggle.title = `${active ? 'Matikan' : 'Nyalakan'} efek cuaca kokpit`;
    if (this.weatherState) this.weatherState.textContent = active ? 'HIDUP' : 'MATI';
  },

readAircraftInfo() {
    // In cockpit mode the controller takes the entity off `viewer.trackedEntity`
    // (see update()), so the cockpit's own handle is the tracked identity there.
    const trackedEntity = this.viewer?.trackedEntity || this.trackedEntity;
    const dataManager = this.getDataManager();
    return resolveTrackedAircraftInfo({
      civilian: dataManager?.getTrackedInfo('flights') || null,
      military: dataManager?.getTrackedInfo('military') || null,
      trackedId: trackedEntity?.gevTrackedId || '',
    });
  },

dispatchCockpitModeChanged(active, info = null) {
    const subjectId = active
      ? String(info?.icao24 || '').trim().toLowerCase() || null
      : null;
    const layerId = active && ['flights', 'military'].includes(info?.layerId)
      ? info.layerId
      : null;
    window.dispatchEvent(new CustomEvent('gev:cockpit-mode-changed', {
      detail: { active: active === true, subjectId, layerId },
    }));
  },

/**
   * TR-3B Easter egg: flip the tracked contact between its real silhouette and
   * the black triangle. The registry owns the session state; the owning layer
   * re-derives what renders.
   * @returns {boolean} True when a tracked contact was converted/restored.
   */
  toggleTrackedTr3b() {
    const info = this.readAircraftInfo();
    const icao24 = String(info?.icao24 || '').trim();
    if (!icao24) return false;
    toggleTr3b(icao24);
    const layerId = info.layerId === 'military' ? 'military' : 'flights';
    this.getDataManager()?.callLayerMethod(layerId, 'refreshTr3b', icao24);
    this._tr3bSignature = null; // force the chip to repaint on the next sync
    this.syncTr3bToggle(info);
    return true;
  },

/**
   * Show the 🛸 chip whenever a contact is tracked (its own gate — converting
   * does not depend on the cockpit entry policy) and mirror the conversion
   * state. Change-only DOM writes: this runs on the preUpdate cadence.
   * @param {object|null} info Tracked-aircraft descriptor, or null.
   */
  syncTr3bToggle(info) {
    if (!this.tr3bToggle) return;
    const icao24 = String(info?.icao24 || '').trim();
    const converted = !!icao24 && isTr3b(icao24);
    const signature = icao24 ? `${icao24}:${converted ? 1 : 0}` : '';
    if (this._tr3bSignature === signature) return;
    this._tr3bSignature = signature;
    this.tr3bToggle.hidden = !icao24;
    this.tr3bToggle.setAttribute('aria-pressed', converted ? 'true' : 'false');
    this.tr3bToggle.title = converted ? 'Pulihkan pesawat asli' : 'Klasifikasi ulang sebagai TR-3B';
  },

syncEntry() {
    if (this.active) return;
    const info = this.readAircraftInfo();
    const trackedContact = !!(info && this.viewer.trackedEntity?.position);
    this.syncTr3bToggle(trackedContact ? info : null);
    const available = !!(this.isEntryAllowed() && trackedContact);
    // Change-only DOM writes: this runs on a preUpdate cadence, and
    // unconditional `hidden` assignments invalidate style/layout every frame
    // even when nothing changed. (perf item 9)
    if (this._entryAvailable === available) return;
    this._entryAvailable = available;
    if (this.entry) this.entry.hidden = !available;
    if (this.mapViewButton) this.mapViewButton.hidden = true;
    if (this.resetGlobeButton) this.resetGlobeButton.hidden = true;
  },

/**
   * Navigate Contacts through one Cockpit-owned funnel. A short grace window
   * covers feed-refresh handoffs where the old source releases before the new
   * source publishes its entity; trackedEntityChanged adopts synchronously as
   * soon as the replacement exists, so the normal path does not wait.
   */
  navigateContext(direction, options = {}) {
    const method = direction < 0 ? 'navigatePrevious' : 'navigateNext';
    const wasActive = this.active;
    if (wasActive) this.contextNavigationDeadlineMs = performance.now() + 1500;
    const navigationOptions = wasActive ? { ...options, aircraftOnly: true } : options;
    const changed = Boolean(this.getDataManager()?.callLayerMethod('military-awareness', method, navigationOptions));
    if (!changed) {
      this.contextNavigationDeadlineMs = 0;
      return false;
    }
    if (wasActive) this._adoptTrackedEntity(performance.now());
    return true;
  },

/** Adopt a newly selected aircraft without ever leaving Cockpit. */
  _adoptTrackedEntity(nowMs, suppliedInfo = null) {
    const nextEntity = this.viewer.trackedEntity;
    if (!this.active || !nextEntity?.position || nextEntity === this.trackedEntity) return false;
    const info = suppliedInfo || this.readAircraftInfo();
    if (!info) return false;
    if (this.trackedEntity && this.viewer.entities.contains(this.trackedEntity)) {
      this.trackedEntity.show = this.trackedEntityWasShown;
    }
    this.trackedEntity = nextEntity;
    this.trackedEntityWasShown = nextEntity.show;
    nextEntity.show = false;
    this.viewer.trackedEntity = undefined;
    this.cockpitAnchorValid = false;
    this.heading = normalizeHeading(info.track ?? 0);
    this.lastFrameMs = nowMs;
    this.lastHudUpdateMs = 0;
    this.lastContextUpdateMs = 0;
    this.lastCameraUpdateMs = 0;
    this.contextNavigationDeadlineMs = 0;
    this.dispatchCockpitModeChanged(true, info);
    return true;
  },

setVisionMode(mode, { revealParameters = false } = {}) {
    const next = normalizeCockpitVisionMode(mode);
    this.visionMode = next;
    const inherited = String(this.getInheritedVisionLabel?.() || 'NORMAL').toUpperCase();
    const labels = { optical: inherited, crt: 'CRT', nvg: 'NVG', thermal: 'FLIR', noir: 'NOIR' };
    const names = { optical: inherited, crt: 'CRT', nvg: 'Penglihatan malam', thermal: 'Termal', noir: 'Noir' };
    if (this.visionCurrent) {
      this.visionCurrent.dataset.cockpitVision = next;
      this.visionCurrent.setAttribute('aria-label', `Gaya penglihatan kokpit saat ini: ${names[next]}. Aktifkan untuk gaya berikutnya.`);
      this.visionCurrent.title = `Gaya saat ini: ${names[next]} — klik untuk berikutnya`;
    }
    if (this.visionCurrentLabel) this.visionCurrentLabel.textContent = labels[next];
    this.onVisionChange?.(next, this.active, { revealParameters });
  },

cycleVisionMode(direction = 1) {
    const modes = COCKPIT_VISION_MODES;
    const currentIndex = Math.max(0, modes.indexOf(this.visionMode));
    const step = direction < 0 ? -1 : 1;
    const nextIndex = (currentIndex + step + modes.length) % modes.length;
    this.setVisionMode(modes[nextIndex], { revealParameters: true });
  },

clearPredictiveRoute() {
    if (this.routeDirection) this.routeDirection.hidden = true;
  },

onKeyDown(event) {
    if (event.repeat || event.isComposing) return;
    if (event.key === 'Escape' && this.active) {
      if (document.getElementById('context-radio-dock')?.classList.contains('disclosure-open')) return;
      if (document.querySelector('#cockpit-utility-controls [aria-expanded="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.exit();
      return;
    }
    if (event.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    const key = event.key?.toLowerCase();
    if (key === 'c' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (!this.active) {
        const cockpitAttempt = !!(this.readAircraftInfo() && this.viewer.trackedEntity?.position);
        if (!cockpitAttempt) return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!this.active && !this.isEntryAllowed()) return;
      const changed = this.active ? this.exit() : this.enter();
      return;
    }
  },
};

