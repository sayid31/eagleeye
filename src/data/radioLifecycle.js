// Moved out of radio.js (radioLifecycle).

import * as Cesium from 'cesium';
import { clearOverlaySource, setOverlaySourceVisible } from '../overlays/worldOverlay.js';
import { emptyRadioOverlayDiagnostics } from './radioOverlayEntries.js';
import { installAudio } from './radioAudio.js';
import { invalidateRadioCameraNavigation } from './radioCamera.js';
import { RADIO_OVERLAY_SOURCE_ID } from './radioConstants.js';
import { installClusterStyling, removeInteraction, syncRadioLifecyclePresentation } from './radioOverlay.js';
import { stopRadioPlayback } from './radioPlayback.js';
import { emitState, resetRadioClusterOverlayIdentities, visibleStations } from './radioSelectors.js';
import { S } from './radioState.js';
import { endRadioTuning } from './radioTuning.js';

export function initRadioLayer(viewer) {
    S._sessionGeneration += 1;
    S._viewer = viewer;
    resetRadioClusterOverlayIdentities();
    installAudio();
    if (!S._dataSource) {
      S._dataSource = new Cesium.CustomDataSource('Radio stations');
      viewer.dataSources.add(S._dataSource);
      installClusterStyling();
    }
    S._dataSource.show = false;
    clearOverlaySource(RADIO_OVERLAY_SOURCE_ID);
    setOverlaySourceVisible(RADIO_OVERLAY_SOURCE_ID, false);
  }

export function setRadioLifecyclePresentation({ lifecycleState = null, enabled = false, uncertain = false } = {}) {
    const settledState = enabled ? 'enabled' : 'disabled';
    const normalizedState = ['enabling', 'enabled', 'disabling', 'disabled'].includes(lifecycleState)
      ? lifecycleState
      : settledState;
    S._managerLifecyclePresentation = {
      lifecycleState: normalizedState,
      enabled: Boolean(enabled),
      uncertain: Boolean(uncertain),
    };
    syncRadioLifecyclePresentation();
    emitState();
  }

export function disableRadioLayer() {
    S._sessionGeneration += 1;
    S._enabled = false;
    invalidateRadioCameraNavigation();
    S._requestGeneration += 1;
    S._abortController?.abort();
    S._abortController = null;
    S._loading = false;
    S._selectionGeneration += 1;
    if (S._selectionTimer) clearTimeout(S._selectionTimer);
    S._selectionTimer = null;
    removeInteraction();
    endRadioTuning();
    S._cancelledTuningPresentationStation = null;
    S._tuningUnavailableStationId = null;
    stopRadioPlayback({ origin: 'layer-disable' });
    if (S._dataSource) S._dataSource.show = false;
    if (S._selectedEntity && S._viewer) S._viewer.entities.remove(S._selectedEntity);
    S._selectedEntity = null;
    if (S._overlayPublishTimer) clearTimeout(S._overlayPublishTimer);
    S._overlayPublishTimer = null;
    resetRadioClusterOverlayIdentities();
    S._overlayDiagnostics = emptyRadioOverlayDiagnostics();
    clearOverlaySource(RADIO_OVERLAY_SOURCE_ID);
    setOverlaySourceVisible(RADIO_OVERLAY_SOURCE_ID, false);
    emitState();
  }

export function getRadioStats() {
    return {
      count: S._stations.length,
      filtered: visibleStations().length,
      selected: S._selectedId,
      playing: S._audioStationId,
      stale: S._stale,
      degraded: S._degraded,
      loading: S._loading,
      error: S._error,
      lastUpdate: S._updatedAt ? Date.parse(S._updatedAt) : null,
      horizonScans: S._horizonScanCount,
      overlayEntries: S._overlayDiagnostics.entryCount,
    };
  }
