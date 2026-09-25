import * as Cesium from 'cesium';
import flightsLayer from './data/flights.js';
import militaryFlightsLayer from './data/militaryFlights.js';
import satellitesLayer from './data/satellites.js';
import militaryAwarenessLayer from './data/militaryAwareness.js';
import rocketLaunchesLayer from './data/rocketLaunches.js';
import aisLiveVesselsLayer from './data/aisLiveVessels.js';
import trafficLayer from './data/traffic.js';
import { CITY_POIS, flyToPresetLocation, flyToPOI, searchAndFlyTo } from './locations.js';
import { locationMiniStatus } from './locationStatus.js';
import { interruptCameraMotion } from './cameraVerbs.js';
import { aircraftTrackingTarget } from './cockpitTracking.js';
import {
  beginDeferredNavigation,
  reassertNavigationHandoff,
  runExplicitNavigation,
} from './navigationPolicy.js';
import { suspendDetection, resumeDetection } from './data/detection.js';

/** Display labels shown in the mini-status readout for each active style. */
const STYLE_STATUS_LABELS = {
  normal: 'NORMAL',
  retro: 'CRT',
  surveillance: 'NVG',
  thermal: 'FLIR',
  anime: 'ANIME',
  noir: 'NOIR',
  snow: 'SNOW',
};

/**
 * Prototype mixin for StyleManager (see `ui.js`): Navigation Authority (the
 * camera-ownership generation/handoff system) + the Location Bar (city pill /
 * POI / world-jump-transition / mini-status UI) — two adjacent sections that
 * share the same instance state (`_currentTarget`, `_currentPoi`,
 * `_activeLocationId`, `_navigationGeneration`, etc.).
 *
 * This is a mechanical method-body relocation to shrink `ui.js`, not a logic
 * extraction: fields are still declared and initialized in the
 * `StyleManager` constructor in `ui.js`; only the method bodies live here.
 * `this.foo()` calls into the rest of the prototype (`_showToast`,
 * `_stopOrbit`, `_updateTrafficSyncChip`, etc.) and reads of
 * `this._dataManager`/`this.cockpitView`/`this.viewer` resolve normally via
 * prototype dispatch — no call site anywhere in `ui.js`, `gevActions.js`, or
 * `director.js` needed to change. Please don't "fix" this into a delegate/
 * composed object; that would require rewriting every one of those call
 * sites for no behavior change.
 *
 * What stays in `ui.js`, and why:
 * - Orbit mode (`_initOrbit`, `_toggleOrbit`, `_stopOrbit`) — a distinct
 *   concern (camera orbiting around a POI, not POI selection/navigation
 *   itself). `_toggleOrbit`/`_stopOrbit` merely *read*
 *   `_currentTarget`/`_currentPoi` (fields that stay in the constructor
 *   either way); `_releaseFollowCamera` here calls `this._stopOrbit()` via
 *   ordinary prototype dispatch, same as the reverse direction below.
 * - `_reclampDraggablePanels` — panel-drag/reposition logic
 *   (`panelAdaptiveLayoutMixin.js`'s domain), sitting next to the Navigation
 *   Authority block only by file-layout coincidence.
 * - `setOrbit()` (public facade) — sits directly beside its "Public control
 *   facade" siblings (`setHudVisible`, `setDetection`, etc.); moving one
 *   facade method out of that cohesive section would fragment it for no
 *   benefit.
 * - `resetToGlobeView`, `clearSelectedLayers`, `dispose()` — all call into
 *   methods moved here (`_stampNavigation`, `_releaseFollowCamera`,
 *   `_beginWorldJumpTransition`) via ordinary `this.method()` calls,
 *   unaffected by the move.
 * - Constructor wiring (the `isNavigationCurrent` callback, the
 *   `viewer.trackedEntityChanged` listener, `registerNavigationAuthorityListener`,
 *   `stampInitialShareGesture`) — event-listener registration that calls
 *   `this._stampNavigation(...)` as a callback, unaffected by which file
 *   defines the callee.
 */
export const navigationLocationMixin = {
  /** Advance camera authority and settle any older search UI immediately. */
  _stampNavigation({ cancelPendingSelection = true, clearSearchedLocation = true } = {}) {
    this._navigationGeneration += 1;
    // A newer destination owns the camera, so the last free-text search is no
    // longer where we are. DEFERRED navigation opts out here and clears at the
    // reassert seam instead: a geocode that never resolves moves no camera, and
    // a lookup that fails must not blank a readout that is still true.
    if (clearSearchedLocation) this.clearSearchedLocation();
    if (cancelPendingSelection) {
      if (this._hasShareState && this._resolveInitialShareRestore && !this._layerStateCoordinator) {
        this._initialShareSelectionSuperseded = true;
      }
      const passivelyClearedShareSelection = this._layerStateCoordinator
        ?.cancelPendingShareTracking?.(
          'superseded-by-explicit-navigation',
          { clearSelection: true },
        ) === true;
      try { flightsLayer.cancelPendingTrackingRestore?.(); } catch { /* best effort */ }
      try { militaryFlightsLayer.cancelPendingTrackingRestore?.(); } catch { /* best effort */ }
      try { satellitesLayer.cancelPendingTrackingRestore?.(); } catch { /* best effort */ }
      // A deliberate destination supersedes share-selected entities that have
      // not arrived yet. Active owners publish their clear when released.
      if (!passivelyClearedShareSelection && !flightsLayer.getTrackedInfo?.()) {
        this._dataManager?.setLayerParams('flights', {
          selectedFlightsTrackingId: null,
        }, { origin: 'tool' });
      }
      if (!passivelyClearedShareSelection && !militaryFlightsLayer.getTrackedInfo?.()) {
        this._dataManager?.setLayerParams('military', {
          selectedMilitaryTrackingId: null,
        }, { origin: 'tool' });
      }
      if (!passivelyClearedShareSelection && !satellitesLayer.getTrackedInfo?.()) {
        this._dataManager?.setLayerParams('satellites', {
          selectedSatTrackingId: null,
        }, { origin: 'tool' });
      }
    }
    if (this._activeLocationSearchGeneration !== null) {
      this._settleLocationSearchUi(this._activeLocationSearchGeneration);
    }
    return this._navigationGeneration;
  },

  /** Settle only the search generation that still owns the shared input UI. */
  _settleLocationSearchUi(generation) {
    if (this._activeLocationSearchGeneration !== generation) return;
    this._activeLocationSearchGeneration = null;
    this._locationSearch?.classList.remove('searching', 'expanded');
    if (this._locationSearch) this._locationSearch.value = '';
    this._locationSearch?.blur();
  },

  /** Release every follow owner while preserving Contact and vessel selection. */
  _releaseFollowCamera({
    preserveVesselSelection = true,
    preserveCameraFlight = false,
    trackingOrigin = 'tool',
  } = {}) {
    let contactSelected = false;
    try {
      contactSelected = Boolean(
        militaryAwarenessLayer.releaseCameraOwnership?.({
          preserveVesselSelection,
          origin: trackingOrigin,
        }),
      );
    } catch {
      try { flightsLayer.stopTracking?.({ origin: trackingOrigin }); } catch { /* best-effort release */ }
      try { militaryFlightsLayer.stopTracking?.({ origin: trackingOrigin }); } catch { /* best-effort release */ }
      if (!preserveVesselSelection) {
        try { aisLiveVesselsLayer.clearSelection?.(); } catch { /* best-effort release */ }
      }
    }
    try { satellitesLayer.stopTracking?.({ origin: trackingOrigin }); } catch { /* best-effort release */ }
    try { rocketLaunchesLayer.releaseCameraOwnership?.(); } catch { /* best-effort release */ }
    this.viewer.trackedEntity = undefined;
    interruptCameraMotion('explicit-navigation');
    this._stopOrbit();
    if (!preserveCameraFlight) this.viewer.camera.cancelFlight();
    try {
      this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    } catch { /* teardown race */ }
    return contactSelected;
  },

  /** Run one immediate destination through the shared ownership policy. */
  _runExplicitNavigation(noun, navigate, releaseOptions = undefined) {
    return runExplicitNavigation({
      disposed: this._disposed,
      cockpitActive: !!this.cockpitView?.active,
      noun,
      showToast: (text) => this._showToast(text),
      stamp: () => this._stampNavigation(),
      release: () => this._releaseFollowCamera(releaseOptions),
      navigate,
    });
  },

  /** Accept a delayed lookup without releasing its current camera owner. */
  _beginDeferredNavigation(noun = 'location', { cancelPendingSelection = true } = {}) {
    return beginDeferredNavigation({
      disposed: this._disposed,
      cockpitActive: !!this.cockpitView?.active,
      noun,
      showToast: (text) => this._showToast(text),
      // The searched-location readout survives the STAMP; only a flight that
      // actually starts invalidates it (see the release hook below).
      stamp: () => this._stampNavigation({ cancelPendingSelection, clearSearchedLocation: false }),
    });
  },

  /** Final authority check and release immediately before a delayed flight. */
  _reassertNavigationHandoff(generation) {
    return reassertNavigationHandoff({
      generation,
      currentGeneration: this._navigationGeneration,
      cockpitActive: !!this.cockpitView?.active,
      disposed: this._disposed,
      showToast: (text) => this._showToast(text),
      // Reached only once the handoff is granted, immediately before the
      // deferred flight starts — so a lookup that failed, was superseded, or
      // was refused by the cockpit leaves the old readout standing.
      release: () => {
        this.clearSearchedLocation();
        return this._releaseFollowCamera();
      },
    });
  },

  /** Public lifecycle seam used by voice location navigation. */
  beginDeferredLocationNavigation() {
    return this._beginDeferredNavigation('location');
  },

  /** Public final-authority seam used by voice geocoding. */
  reassertDeferredLocationNavigation(generation) {
    return this._reassertNavigationHandoff(generation);
  },

  /** Public immediate route used by voice destinations. */
  runImmediateLocationNavigation(navigate) {
    return this.runImmediateNavigation('location', navigate);
  },

  /** Public authority facade used by validated voice camera destinations. */
  runImmediateNavigation(noun, navigate, releaseOptions = undefined) {
    return this._runExplicitNavigation(noun, navigate, releaseOptions);
  },

  /** Supersede deferred work when an owner-specific route handles release. */
  supersedeDeferredNavigation() {
    return this._stampNavigation();
  },

  /** Route a valid vessel/fire request through the shared navigation policy. */
  _runExplicitWorldFocus(detail, fly) {
    return this._runExplicitNavigation(detail?.kind || 'target', fly);
  },

  /** Return the aircraft tracker owned before a multi-step Cockpit transaction. */
  getAircraftTrackingTarget() {
    return aircraftTrackingTarget(this.cockpitView?.readAircraftInfo?.());
  },

  // ── Location Bar ─────────────────────────────

  /**
   * Initializes the location bar: renders city pills from CITY_POIS, sets up
   * QWERTY keyboard navigation for POI selection, wires the search toggle
   * and geocoding search input.
   * @returns {void}
   */
  _initLocationBar() {
    const QWERTY_KEYS = ['Q', 'W', 'E', 'R', 'T'];

    // Render city pills (no submenu wrappers — POI row is separate)
    for (const [cityId, city] of Object.entries(CITY_POIS)) {
      const pill = document.createElement('button');
      pill.className = 'location-pill';
      pill.dataset.locationId = cityId;
      pill.textContent = city.name;
      pill.addEventListener('click', () => this._onCityPillClick(cityId));
      this._locationPills.appendChild(pill);
    }

    // QWERTY keyboard navigation for POIs
    this._poiKeydownHandler = (e) => {
      if (!this._expandedCityId) return;
      // Bail while a form control is focused so POI hotkeys don't fire from a
      // <select> dropdown's type-ahead or while typing in a field (M9).
      const isFormControl = e.target?.matches?.('select, input, textarea')
        || e.target === this._locationSearch
        || this._isCctvListboxOpen?.();
      if (isFormControl) return;

      const keyIndex = QWERTY_KEYS.indexOf(e.key.toUpperCase());
      if (keyIndex === -1) return;

      const city = CITY_POIS[this._expandedCityId];
      if (city && keyIndex < city.pois.length) {
        this._onPoiClick(this._expandedCityId, keyIndex);
      }
    };
    document.addEventListener('keydown', this._poiKeydownHandler);

    // Search toggle (expand/collapse)
    this._searchToggle.addEventListener('click', () => {
      this._locationSearch.classList.toggle('expanded');
      if (this._locationSearch.classList.contains('expanded')) {
        this._locationSearch.focus();
      }
    });

    // Search submit on Enter
    this._locationSearch.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const query = this._locationSearch.value.trim();
        if (!query) return;
        const generation = this._beginDeferredNavigation('location');
        if (generation === false) {
          this._locationSearch.classList.remove('searching');
          this._locationSearch.blur();
          return;
        }
        this._activeLocationSearchGeneration = generation;
        this._locationSearch.classList.add('searching');
        try {
          const destination = await searchAndFlyTo(this.viewer, query, {
            beforeFly: () => this._reassertNavigationHandoff(generation),
          });
          if (this._disposed || generation !== this._navigationGeneration) return;
          if (destination?.cancelled) {
            // Authority changed while the lookup was resolving; remain inert.
          } else if (destination) {
            // The ACTIVE STYLE indicator reports the STYLE and nothing else.
            // Writing the searched city here made the top-right corner read
            // "ACTIVE STYLE / TOKYO"; where the camera is belongs to the
            // LOCATION panel's own readout, which is updated below.
            //
            // Set before _setActiveLocation(null) so its own mini-status
            // refresh already sees the destination — the readout never blinks
            // through "Location: --" on the way to the searched place.
            this._searchedLocationLabel = destination.label || query;
            this._setActiveLocation(null);
            this._currentPoi = null;
            this._collapsePOIRow();
            this._updateLocationMiniStatus();
          } else {
            this._showToast('Location not found');
          }
        } catch (err) {
          console.error('[Search] Geocoding failed:', err);
          if (this._disposed || generation !== this._navigationGeneration) return;
          this._showToast('Search failed');
        } finally {
          this._settleLocationSearchUi(generation);
        }
      }
    });
  },

  /**
   * Signals the start of an inter-city world jump: notifies the traffic layer
   * to pause tile fetching and suspends detection overlays to prevent stale
   * rendering during the flight.
   * @returns {void}
   */
  _beginWorldJumpTransition() {
    clearTimeout(this._trafficTransitionTimer);
    trafficLayer.beginWorldJump?.();
    suspendDetection('intercity');
  },

  /**
   * Signals the end of an inter-city world jump: resumes traffic tile fetching,
   * resumes detection overlays, and forces a traffic sync chip update.
   * @returns {void}
   */
  _endWorldJumpTransition() {
    clearTimeout(this._trafficTransitionTimer);
    trafficLayer.endWorldJump?.();
    resumeDetection();
    this._updateTrafficSyncChip(true);
  },

  /**
   * Wraps a fly-to action with world-jump transition hooks when the target
   * city differs from the current one. Applies begin/end transition signals
   * with a 5.2s safety timeout to guarantee cleanup if the flight callback
   * never fires onComplete.
   * @param {boolean} cityChanged - Whether the destination is in a different city.
   * @param {function} flyAction - Callback receiving `{onStart, onComplete}` hooks; should return a result with targetPosition.
   * @returns {*} Return value from flyAction.
   */
  _flyWithTransition(cityChanged, flyAction) {
    return this._runExplicitNavigation('location', () => {
      if (!cityChanged) return flyAction({});
      let completed = false;
      const finalize = () => {
        if (completed) return;
        completed = true;
        this._endWorldJumpTransition();
      };
      const result = flyAction({
        onStart: () => this._beginWorldJumpTransition(),
        onComplete: finalize,
      });
      this._trafficTransitionTimer = window.setTimeout(finalize, 5200);
      return result;
    });
  },

  /**
   * Release camera ownership when a resolved Location destination starts.
   * Contact mode and its selected subject remain intact so FOCUS can return to
   * that subject after the user finishes inspecting the destination.
   * @returns {boolean} Whether a Contact subject remains selected.
   */
  beginLocationNavigation() {
    this._stampNavigation();
    this.cockpitView?.exit({ restoreTracking: false });
    return this._releaseFollowCamera({ preserveVesselSelection: false });
  },

  /**
   * Handles a city pill click: toggles POI row collapse if same city,
   * otherwise expands the POI row, flies to the city's first POI, and
   * tracks the target position for orbit mode.
   * @param {string} cityId - Identifier of the clicked city.
   * @returns {void}
   */
  _onCityPillClick(cityId) {
    if (this._expandedCityId === cityId) {
      // Same city clicked again — toggle collapse
      this._collapsePOIRow();
      return;
    }

    const isCityChanged = this._activeLocationId && this._activeLocationId !== cityId;
    const result = this._flyWithTransition(!!isCityChanged, (hooks) => flyToPresetLocation(this.viewer, cityId, hooks));
    if (result === false) return;
    this._expandPOIRow(cityId);
    this._setActiveLocation(cityId);
    this._activePoiIndex = 0;
    this._updatePoiHighlight();

    // Track current target + POI for orbit
    if (result) {
      this._currentTarget = result.targetPosition;
      this._currentPoi = CITY_POIS[cityId].pois[0];
    }
    this._updateLocationMiniStatus();
  },

  /**
   * Handles a POI pill click: stops orbit, flies to the POI, highlights it,
   * and saves the target position for future orbit activation.
   * @param {string} cityId - Parent city identifier.
   * @param {number} poiIndex - Index of the POI within the city's pois array.
   * @returns {void}
   */
  _onPoiClick(cityId, poiIndex) {
    const isCityChanged = this._activeLocationId && this._activeLocationId !== cityId;
    const result = this._flyWithTransition(!!isCityChanged, (hooks) => flyToPOI(this.viewer, cityId, poiIndex, hooks));
    if (result === false) return;
    this._setActiveLocation(cityId);
    this._activePoiIndex = poiIndex;
    this._updatePoiHighlight();

    // Track current target + POI for orbit
    if (result) {
      this._currentTarget = result.targetPosition;
      this._currentPoi = CITY_POIS[cityId].pois[poiIndex];
    }
    this._updateLocationMiniStatus();
  },

  /**
   * Builds and shows the POI pill row for a city. Each pill displays a
   * QWERTY keyboard shortcut key and the POI name.
   * @param {string} cityId - City whose POIs to render.
   * @returns {void}
   */
  _expandPOIRow(cityId) {
    const QWERTY_KEYS = ['Q', 'W', 'E', 'R', 'T'];
    const city = CITY_POIS[cityId];
    if (!city) return;

    this._expandedCityId = cityId;

    // Build POI pill buttons
    this._poiRow.innerHTML = '';
    city.pois.forEach((poi, idx) => {
      const pill = document.createElement('button');
      pill.className = 'poi-pill';
      pill.dataset.poiIndex = idx;
      pill.innerHTML = `<span class="poi-pill-key">${QWERTY_KEYS[idx] || idx + 1}</span><span class="poi-pill-name">${poi.name}</span>`;
      pill.addEventListener('click', () => this._onPoiClick(cityId, idx));
      this._poiRow.appendChild(pill);
    });

    // Animate expansion
    requestAnimationFrame(() => {
      this._poiRow.classList.add('expanded');
      this._locationBarDivider.classList.add('visible');
    });
  },

  /**
   * Hides the POI pill row and clears the expanded city state.
   * @returns {void}
   */
  _collapsePOIRow() {
    this._expandedCityId = null;
    this._activePoiIndex = null;
    this._poiRow.classList.remove('expanded');
    this._locationBarDivider.classList.remove('visible');
  },

  /**
   * Highlights the active POI pill and removes highlight from all others.
   * @returns {void}
   */
  _updatePoiHighlight() {
    this._poiRow.querySelectorAll('.poi-pill').forEach(pill => {
      pill.classList.toggle('active', parseInt(pill.dataset.poiIndex) === this._activePoiIndex);
    });
  },

  /**
   * Forget the last free-text search destination and repaint the LOCATION
   * readout. Public so camera owners that fly on their own — scene playback
   * most of all — can invalidate it without reaching into private state.
   * @returns {void}
   */
  clearSearchedLocation() {
    if (this._searchedLocationLabel === null) return;
    this._searchedLocationLabel = null;
    this._updateLocationMiniStatus();
  },

  /**
   * Sets the active city location, highlights its pill, and updates the mini-status readout.
   * @param {string|null} locationId - City identifier, or null to clear.
   * @returns {void}
   */
  _setActiveLocation(locationId) {
    this._activeLocationId = locationId;
    // A preset city is now what the camera is framed on, so any earlier
    // free-text destination has been superseded. Clearing only on a real id
    // leaves the search path's own _setActiveLocation(null) untouched.
    if (locationId) this._searchedLocationLabel = null;
    this._locationPills.querySelectorAll('.location-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.locationId === locationId);
    });
    this._updateLocationMiniStatus();
  },

  /**
   * Updates the collapsed mini-status readout with the current destination:
   * a preset city + POI/landmark, or the last free-text geocode search.
   * @returns {void}
   */
  _updateLocationMiniStatus() {
    if (!this._locationMiniCity || !this._locationMiniPoi) return;
    const lines = locationMiniStatus({
      city: this._activeLocationId ? CITY_POIS[this._activeLocationId] : null,
      currentPoi: this._currentPoi,
      searchedLabel: this._searchedLocationLabel,
    });
    this._locationMiniCity.textContent = lines.city;
    this._locationMiniPoi.textContent = lines.poi;
  },

  /**
   * Updates the collapsed mini-status readout with the active style label.
   * @param {string} [styleName=this.activeStyle] - Style name to display.
   * @returns {void}
   */
  _updateStyleMiniStatus(styleName = this.activeStyle) {
    if (!this._styleMiniValue) return;
    this._styleMiniValue.textContent = STYLE_STATUS_LABELS[styleName] || String(styleName || 'normal').toUpperCase();
  },
};
