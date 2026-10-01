// Moved out of traffic.js (trafficLifecycle).

import * as Cesium from 'cesium';
import { releaseContinuousRender } from '../renderGovernor.js';
import { getFlowSessionStats } from './flowTiles.js';
import { trafficStyleProfile } from './trafficPresetStyle.js';
import { TRAFFIC_TIMING_ENABLED } from './trafficConstants.js';
import { animate, clearDots, syncTrafficRenderHold } from './trafficDots.js';
import { ensureFlowStatus, trafficFeedPresentation } from './trafficFlow.js';
import { S } from './trafficState.js';
import { refreshBucketColors, setStylePreset } from './trafficStyle.js';
import { clearTrafficTimingEntries, getTrafficTimingDiagnostics, markTrafficTimingMoveEnd } from './trafficTiming.js';
import { cancelActiveFetch, onCameraChanged } from './trafficView.js';

export function initTrafficLayer(viewer) {
    S._viewer = viewer;
    S._pointCollection = new Cesium.PointPrimitiveCollection({
      blendOption: Cesium.BlendOption.TRANSLUCENT,
    });
    // Add permanently — toggle with .show to avoid destroy-on-remove errors
    viewer.scene.primitives.add(S._pointCollection);
    S._pointCollection.show = false;
    S._dots = [];
    S._roads = [];
    S._count = 0;
    S._lastUpdate = null;
    S._lastBounds = null;
    S._fetching = false;
    S._loadGeneration = 0;
    S._densityScale = 1.0;
    S._speedScale = 1.0;
    S._lastViewCenter = null;
    S._flowCoveragePct = 0;
    S._flowError = null;
    if (TRAFFIC_TIMING_ENABLED) {
      S._trafficTimingCurrentAnchor = null;
      S._trafficTimingSequence = 0;
      S._trafficTimingTracesCreated = 0;
      S._trafficTimingDroppedTraces = 0;
    }

    // Preset-aware dot styling: adopt the active post-FX style (persisted
    // style restore may run before layer registration, so read the dataset)
    // and follow StyleManager's gev:style-change event thereafter. Guarded
    // for non-browser contexts; bound once per page (init survives layer
    // destroy/re-register).
    if (typeof window !== 'undefined') {
      S._stylePreset = document?.documentElement?.dataset?.gevStyle || 'normal';
      if (!S._styleListenerBound) {
        window.addEventListener('gev:style-change', (e) => setStylePreset(e?.detail?.style));
        S._styleListenerBound = true;
      }
    }
    refreshBucketColors();
    console.log('[Data:Traffic] Initialized');
  }

export function enableTrafficLayer(viewer) {
    S._enabled = true;
    // Conditional render hold (perf wave 3): held only while dots/heat-lines
    // are actually loaded, not for the layer's whole enabled lifetime — see
    // syncTrafficRenderHold(), called every animate() tick. Sync once
    // immediately so re-enabling with dots still resident (rare — enable
    // always starts from a cleared state today, but keeps the same-shape
    // contract as the other layers) doesn't wait a tick to hold.
    syncTrafficRenderHold();
    S._lastAnimTime = 0;
    S._pointCollection.show = true;

    // One status check per session decides sim vs live-TomTom mode.
    ensureFlowStatus();

    S._preRenderRemover = viewer.scene.preRender.addEventListener(animate);
    if (TRAFFIC_TIMING_ENABLED) {
      clearTrafficTimingEntries();
      S._trafficTimingCurrentAnchor = null;
      S._trafficTimingPostRenderRemovers = new Set();
      S._trafficTimingMoveEndRemover = viewer.camera.moveEnd.addEventListener(markTrafficTimingMoveEnd);
    }

    // Subscribe to camera changes with a 5% movement threshold. Save the prior
    // value so disable() can restore it — percentageChanged is a shared global
    // on the camera and leaving it mutated affects every other camera.changed
    // listener in the app.
    viewer.camera.changed.addEventListener(onCameraChanged);
    S._prevPercentageChanged = viewer.camera.percentageChanged;
    viewer.camera.percentageChanged = 0.05;

    // Kick off initial viewport check
    onCameraChanged();

    // Boot-order guard (field-test round 1: layer sat empty until the user
    // moved): when the persisted layer state re-enables traffic during the
    // intro flyTo, the initial check bails at high altitude — and a camera
    // that then parks never re-fires camera.changed. Retry cheaply until the
    // first load commits, then self-clear. Also acts as a safety kick if a
    // failed first fetch left the viewport unloaded while parked.
    clearInterval(S._enableKickTimer);
    S._enableKickTimer = setInterval(() => {
      if (!S._enabled || S._lastUpdate) {
        clearInterval(S._enableKickTimer);
        S._enableKickTimer = null;
        return;
      }
      if (!S._fetching) onCameraChanged();
    }, 1500);
  }

export function disableTrafficLayer(viewer) {
    S._enabled = false;
    releaseContinuousRender('traffic'); // hard backstop — animate() stops running once disabled
    clearTimeout(S._fetchTimeout);
    clearInterval(S._enableKickTimer);
    S._enableKickTimer = null;
    cancelActiveFetch();
    S._loadGeneration++;
    clearDots();
    S._lastViewCenter = null;
    // A stale outage from the last session would misreport a fresh enable —
    // the next load re-derives feed health from real evidence.
    S._flowError = null;

    if (S._preRenderRemover) {
      S._preRenderRemover();
      S._preRenderRemover = null;
    }
    if (TRAFFIC_TIMING_ENABLED) {
      S._trafficTimingMoveEndRemover?.();
      S._trafficTimingMoveEndRemover = null;
      for (const remove of S._trafficTimingPostRenderRemovers || []) remove();
      S._trafficTimingPostRenderRemovers = null;
      S._trafficTimingCurrentAnchor = null;
    }

    viewer.camera.changed.removeEventListener(onCameraChanged);
    // Restore the camera's global percentageChanged so other layers/listeners
    // keep their expected sensitivity.
    if (S._prevPercentageChanged != null) {
      viewer.camera.percentageChanged = S._prevPercentageChanged;
      S._prevPercentageChanged = null;
    }
    S._pointCollection.show = false;
  }

export function getTrafficStats() {
    // Outstanding flow work counts as loading: the paint race can leave a
    // TomTom request in flight after the roads have settled, and the shared
    // loading batch has to stay open long enough to announce its failure.
    const loading = S._fetching || S._flowPending > 0;
    const feed = trafficFeedPresentation({
      liveMode: S._liveMode,
      fetching: loading,
      flowError: S._flowError,
      coveragePct: S._flowCoveragePct,
      statusUnavailable: S._flowStatusUnavailable,
    });
    return {
      count: S._count,
      lastUpdate: S._lastUpdate,
      loading,
      mode: feed.mode,
      error: feed.error,
      flowCoveragePct: S._flowCoveragePct,
      tilesFetched: getFlowSessionStats().tilesFetched,
      ...(TRAFFIC_TIMING_ENABLED ? { trafficTiming: getTrafficTimingDiagnostics() } : {}),
      // Per-bucket rendered-dot counts (sim = white ambient). Drives the
      // qa-traffic color assertions and the sync-chip mode label below.
      flowBuckets: { ...S._bucketCounts },
      closedRoads: S._closedRoads,
      // Jam-viz prototype diagnostics (additive — harness contract untouched).
      heatLines: S._heatLineCount,
      jamViz: S._jamViz,
      // Preset-styling diagnostics (additive): active style + profile.
      stylePreset: S._stylePreset,
      styleProfile: S._presetDots === 'on' ? trafficStyleProfile(S._stylePreset) : 'normal',
      // Sync-chip text: shown while busy, and flashed on its own for 1.5 s
      // after each completed load (ui.js _updateTrafficSyncChip semantics).
      // The settled flash carries NO progress number beside it — this label's
      // coverage figure is the chip's only percentage — so a label that ends
      // in one had better be the honest one. This is also where LIVE vs
      // SIMULATED mode is surfaced, and it must never imply a live feed the
      // layer does not have.
      loadingLabel: feed.loadingLabel,
    };
  }
