// Moved out of satellites.js (satellitesLifecycle).

import { clearFocusTarget } from './focusDeemphasis.js';
import * as Cesium from 'cesium';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import { releaseContinuousRender } from '../renderGovernor.js';
import { ISS_OVERLAY_SOURCE_ID, WATCHDOG_TICK_MS } from './satellitesConstants.js';
import { _preRenderTick, _watchdogTick, syncSatellitesRenderHold } from './satellitesDense.js';
import { _installClickHandler, _onKeyDown } from './satellitesInput.js';
import { _syncIssOverlay } from './satellitesIss.js';
import { S } from './satellitesState.js';
import { _abortActiveUpdates, satelliteVisualsVisible } from './satellitesStyle.js';
import { _applyPendingTrackingRestore, _cancelPendingTrackingRestore, _clearTracking } from './satellitesTracking.js';

export async function initSatellitesLayer(viewer) {
    _abortActiveUpdates();
    clearFocusTarget('satellites');
    S._viewer = viewer;
    S._catalog = new Map();
    S._points = new Map();
    S._detectionObjects = new Map();
    S._orbitPaths = new Map();
    S._count = 0;
    S._lastUpdate = null;
    S._trackedNorad = null;
    _cancelPendingTrackingRestore();
    S._trackedEntity = null;
    S._trackedFrameNumber = -1;
    S._trackedFrameGeo = null;
    S._trackedFrameNowForTest = null;
    S._lastFocusUpdate = 0;
    S._activeFocusCount = 0;
    S._enabled = false;
    S._overlayHost.clearSource(ISS_OVERLAY_SOURCE_ID);
    S._overlayHost.setVisible(ISS_OVERLAY_SOURCE_ID, false);
    // Dense extras rebuild via update() when _params.catalog === 'dense'
    // (the catalog-mode preference itself is sticky across init/destroy).
    S._denseIds = [];
    S._denseCursor = 0;
    S._denseLoadPromise = null;
    S._denseLoadToken++;
    S._denseStatus = 'idle';
    S._denseError = null;
    S._catalogRevision++;

    // Point primitives for satellite dots
    S._pointCollection = new Cesium.PointPrimitiveCollection();
    viewer.scene.primitives.add(S._pointCollection);

    _installClickHandler(viewer);

    // Pre-render listener for real-time position updates
    // (fleet propagation + tracked per-frame dot + orbit ring GMST rotation)
    S._preRenderListener = viewer.scene.preRender.addEventListener(_preRenderTick);

    console.log('[Data:Satellites] Initialized');
  }

export function enableSatellitesLayer(viewer) {
    S._enabled = true;
    // Conditional render hold (perf wave 3): held only while showPoints is on
    // AND at least one point is actually on screen — not for the layer's
    // whole enabled lifetime — see satellitesNeedContinuousRender(). The
    // on-screen scan hasn't run yet for this enable, so fail toward
    // continuous until _propagateAll()'s first pass settles it; sync once
    // immediately so a layer enabled with something already visible doesn't
    // wait a tick to hold.
    S._anyPointOnScreen = true;
    syncSatellitesRenderHold();
    if (S._pointCollection) S._pointCollection.show = satelliteVisualsVisible(S._enabled, S._params.showPoints);
    // Orbit ring primitives + persistent ISS host label — show them
    for (const path of S._orbitPaths.values()) path.primitive.show = satelliteVisualsVisible(S._enabled, S._params.showOrbits);
    _syncIssOverlay();
    // Re-attach input handlers and preRender propagation
    _installClickHandler(viewer);
    // Pick-ownership (H2): satellite dot ids are numeric NORAD catalog numbers;
    // the registry hands predicates String()-coerced ids, so match via Number().
    registerPickOwner('satellites', (pickedId) => {
      const norad = Number(pickedId);
      return Number.isFinite(norad) && S._points.has(norad);
    });
    if (!S._preRenderListener && viewer) {
      S._preRenderListener = viewer.scene.preRender.addEventListener(_preRenderTick);
    }
    // Idle-mode fallback so the on-screen scan keeps running once preRender
    // itself stops firing — see _watchdogTick(). Cleared in disable()/destroy().
    if (!S._watchdogTimer) S._watchdogTimer = setInterval(_watchdogTick, WATCHDOG_TICK_MS);
    _applyPendingTrackingRestore();
  }

export function disableSatellitesLayer(viewer) {
    _abortActiveUpdates();
    _cancelPendingTrackingRestore();
    S._enabled = false;
    releaseContinuousRender('satellites'); // hard backstop — _preRenderTick() stops running once disabled (preRenderListener removed below)
    if (S._watchdogTimer) {
      clearInterval(S._watchdogTimer);
      S._watchdogTimer = null;
    }
    if (S._pointCollection) S._pointCollection.show = false;
    for (const path of S._orbitPaths.values()) path.primitive.show = false;
    _clearTracking();
    _syncIssOverlay();
    // Remove click handler + keydown listener + preRender propagation while disabled
    if (S._clickHandler) {
      S._clickHandler.destroy();
      S._clickHandler = null;
    }
    if (S._trackedEntityChangedRemove) {
      S._trackedEntityChangedRemove();
      S._trackedEntityChangedRemove = null;
    }
    document.removeEventListener('keydown', _onKeyDown);
    unregisterPickOwner('satellites');
    if (S._preRenderListener) {
      S._preRenderListener();
      S._preRenderListener = null;
    }
  }

export function destroySatellitesLayer(viewer) {
    _abortActiveUpdates();
    releaseContinuousRender('satellites'); // direct-destroy path (perf wave 2 fix)
    S._enabled = false;
    if (S._watchdogTimer) {
      clearInterval(S._watchdogTimer);
      S._watchdogTimer = null;
    }
    _clearTracking();
    _cancelPendingTrackingRestore();
    if (S._clickHandler) {
      S._clickHandler.destroy();
      S._clickHandler = null;
    }
    if (S._trackedEntityChangedRemove) {
      S._trackedEntityChangedRemove();
      S._trackedEntityChangedRemove = null;
    }
    document.removeEventListener('keydown', _onKeyDown);
    unregisterPickOwner('satellites');
    if (S._preRenderListener) {
      S._preRenderListener();
      S._preRenderListener = null;
    }
    S._overlayHost.clearSource(ISS_OVERLAY_SOURCE_ID);
    S._overlayHost.setVisible(ISS_OVERLAY_SOURCE_ID, false);
    if (S._pointCollection) {
      viewer.scene.primitives.remove(S._pointCollection);
      S._pointCollection = null;
    }
    // Orbit ring primitives are removed (and destroyed) here
    for (const path of S._orbitPaths.values()) {
      viewer.scene.primitives.remove(path.primitive);
    }
    S._points.clear();
    S._detectionObjects.clear();
    S._orbitPaths.clear();
    S._catalog.clear();
    S._denseIds = [];
    S._denseCursor = 0;
    S._denseLoadToken++;
    S._denseStatus = 'idle';
    S._denseError = null;
    S._catalogRevision++;
    S._rowControlsListener = null;
    S._count = 0;
    S._lastUpdate = null;
    S._lastError = null;
    S._lastFocusUpdate = 0;
    S._activeFocusCount = 0;
    S._trackingRefreshEpoch += 1;
    S._lastTrackingRefreshOutcome = {
      epoch: S._trackingRefreshEpoch,
      status: 'destroyed',
      failedGroups: [],
    };
    S._viewer = null;
  }

export function getSatellitesStats() {
    return {
      count: S._count,
      lastUpdate: S._lastUpdate,
      stale: false,
      status: S._lastError === 'CelesTrak unreachable'
        ? 'unavailable'
        : (S._lastError ? 'degraded' : 'nominal'),
      error: S._lastError,
    };
  }
