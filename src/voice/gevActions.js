import { controlRadio } from './gevRadioActions.js';
import { adjustOrbitRange, flyRoute, initCameraVerbs, interruptCameraMotion, moveCamera } from '../cameraVerbs.js';
import { layerFeedState } from '../data/manager.js';
import { createAnalystEngine } from '../data/analystEngine.js';
import { GLOBE_VIEW, flyToGlobeView } from '../locations.js';
import { cachedGroundFloor, warmGroundFloor } from '../data/groundFloor.js';
import { activeContactsWindow, analystProviders, runAnalystQuery } from './gevActionsAnalyst.js';
import { annotateMap, clearAnnotations } from './gevActionsAnnotations.js';
import { adjustCameraZoom, controlScene, getViewTargetCartesian, installViewTargetPrewarm, nextIssPass } from './gevActionsCamera.js';
import { controlCctv } from './gevActionsCctv.js';
import { getCurrentViewState, getEntityContext } from './gevActionsContext.js';
import { focusDataLayerRow, readLayerLifecycleSummary, setPanelOpen } from './gevActionsLayers.js';
import { flyToRequestedLocation } from './gevActionsLocation.js';
import { normalizeAircraftClassFilter, normalizeCockpitAction, normalizeCockpitNavigationHints, normalizeCockpitTargetLayer, normalizeContextMode, normalizeLayerId, normalizePanelId, normalizeStackId, normalizeStyle, withContextModeVocabulary } from './gevActionsNormalize.js';
import { _layerEnabledAt } from './gevActionsState.js';
import { frameOverhead, runManagedVoiceNavigation, selectedCockpitTarget, stopAllTracking, trackEntity } from './gevActionsTracking.js';

export { getViewTargetCartographic, haversineKm } from './gevActionsCamera.js';
export { cctvVoiceFocusOutcome, controlCctv } from './gevActionsCctv.js';
export { readLayerLifecycleSummary } from './gevActionsLayers.js';
export { formatTrackedEntityLabel, normalizeLocationId, normalizeStackId } from './gevActionsNormalize.js';

// Re-exported for existing call sites (gevActions.test.mjs, gevRealtime.test.mjs)
// that still import controlRadio/knownRadioLocation directly from this module —
// mechanical relocation, no behavior change.
export { controlRadio, knownRadioLocation } from './gevRadioActions.js';

// Re-exported for hud.js, which imports getBasemapLabelContext directly
// from this module — mechanical relocation, no behavior change.
export { getBasemapLabelContext } from './gevGeocodeContext.js';

export function createGevActionRunner({ viewer, styleManager, dataManager, sceneDirector = null, annotations = null }) {
  installViewTargetPrewarm(viewer);
  initCameraVerbs(viewer, getViewTargetCartesian);
  return async function runGevAction(name, rawArgs = {}, runOptions = {}) {
    const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
    const current = () => !runOptions.signal?.aborted
      && (typeof runOptions.isCurrent !== 'function' || runOptions.isCurrent());

    // Navigation tools interrupt any continuous camera motion (spec §1.1) —
    // checked FIRST because each handler returns.
    if (name === 'zoom_to_globe') {
      interruptCameraMotion(`nav:${name}`);
    }
    // Explicit navigation while TRACKING supersedes the follow camera —
    // otherwise the tracker drags the view back and "I flew there but can't
    // do anything" (field finding). track_entity manages its own handoff.
    if (name === 'zoom_to_globe' && viewer.trackedEntity) {
      stopAllTracking(viewer, dataManager);
    }

    // Zoom during an active orbit adjusts the orbit RADIUS (spiral in/out) —
    // a straight camera move would be snapped back by the per-frame lookAt.
    if (name === 'adjust_camera_zoom') {
      const zoomOut = String(args.direction || '').toLowerCase() === 'out';
      const amt = String(args.amount || 'medium').toLowerCase();
      const factor = { little: 1.25, medium: 1.6, lot: 2.4 }[amt] || 1.6;
      if (adjustOrbitRange(zoomOut ? factor : 1 / factor)) {
        return { ok: true, action: 'adjust_camera_zoom', direction: zoomOut ? 'out' : 'in', amount: amt, orbitRadiusAdjusted: true };
      }
    }

    if (name === 'set_layer_visibility') {
      const layerId = normalizeLayerId(args.layerId);
      if (!layerId) {
        throw new Error(`Unknown data layer: ${args.layerId || 'missing'}`);
      }
      if (!dataManager.layers.has(layerId)) {
        if (layerId === 'radio') {
          return {
            ok: false,
            action: 'set_layer_visibility',
            layerId,
            error: 'Radio layer unavailable',
            ...readLayerLifecycleSummary(dataManager, layerId),
          };
        }
        throw new Error(`Unknown data layer: ${args.layerId || 'missing'}`);
      }
      const enabled = Boolean(args.enabled);
      const changeOptions = { origin: 'voice' };
      if (runOptions.signal) changeOptions.signal = runOptions.signal;
      let changed = false;
      let changeError = null;
      let intentOutcome = null;
      try {
        if (typeof dataManager._setEnabledWithIntent === 'function') {
          const intent = dataManager._setEnabledWithIntent(layerId, enabled, changeOptions);
          changed = await intent.promise;
          if (Number.isInteger(intent.intentEpoch)) {
            intentOutcome = await dataManager._waitForVisibilityIntent?.(layerId, intent.intentEpoch);
          }
        } else {
          changed = await dataManager.setEnabled(layerId, enabled, changeOptions);
        }
        if (layerId === 'rocket-launches' || layerId === 'satellites') {
          await styleManager?._waitForContextLayerSettlement?.();
        }
      } catch (error) {
        changeError = error;
      }
      const lifecycleSummary = readLayerLifecycleSummary(dataManager, layerId);
      if (intentOutcome?.succeeded === false && intentOutcome.cancellationReason) {
        return {
          ok: false,
          action: 'set_layer_visibility',
          layerId,
          cancelled: true,
          phase: intentOutcome.phase,
          cancellationReason: intentOutcome.cancellationReason,
          successorIntentEpoch: intentOutcome.successorIntentEpoch,
          successorEnabled: intentOutcome.successorEnabled,
          successorOrigin: intentOutcome.successorOrigin,
          ...lifecycleSummary,
        };
      }
      const intentCommitted = intentOutcome?.succeeded === true;
      const current = !runOptions.signal?.aborted
        && (typeof runOptions.isCurrent !== 'function' || runOptions.isCurrent());
      if (!current && !intentCommitted) {
        return {
          ok: false,
          action: 'set_layer_visibility',
          layerId,
          cancelled: true,
          error: 'Layer request was superseded by a newer voice turn',
          ...lifecycleSummary,
        };
      }
      const settledEnabled = lifecycleSummary.enabled;
      const lifecycleSettled = lifecycleSummary.lifecycleState === (enabled ? 'enabled' : 'disabled')
        && !lifecycleSummary.lifecycleUncertain;
      if (changeError) {
        return {
          ok: false,
          action: 'set_layer_visibility',
          layerId,
          error: changeError?.message || `Could not ${enabled ? 'enable' : 'disable'} the requested layer`,
          ...lifecycleSummary,
        };
      }
      if (changed === false || settledEnabled !== enabled || !lifecycleSettled) {
        return {
          ok: false,
          action: 'set_layer_visibility',
          layerId,
          error: `Could not ${enabled ? 'enable' : 'disable'} the requested layer`,
          ...lifecycleSummary,
        };
      }
      if (enabled) _layerEnabledAt.set(layerId, Date.now());
      const layer = dataManager.getAll().find((item) => item.id === layerId);
      return {
        ok: true,
        action: 'set_layer_visibility',
        layerId,
        label: layer?.name || layerId,
        ...lifecycleSummary,
      };
    }

    if (name === 'select_nearest_aircraft') {
      const layerId = normalizeLayerId(args.layerId || 'flights');
      if (!['flights', 'military'].includes(layerId)) {
        return {
          ok: false,
          action: 'select_nearest_aircraft',
          error: 'Nearest-aircraft selection supports Flights or Military Flights only',
        };
      }
      const hasLocationId = Boolean(String(args.locationId || '').trim());
      const hasLocationQuery = Boolean(String(args.locationQuery || '').trim());
      const hasCoordinates = args.latitude != null
        && args.longitude != null
        && Number.isFinite(Number(args.latitude))
        && Number.isFinite(Number(args.longitude));
      if (!hasLocationId && !hasLocationQuery && !hasCoordinates) {
        return {
          ok: false,
          action: 'select_nearest_aircraft',
          stage: 'location',
          error: 'Nearest-aircraft selection needs a preset, place name, or latitude and longitude',
        };
      }
      const locationArgs = {
        waitForArrival: true,
        ...(args.locationId ? { locationId: args.locationId } : {}),
        ...(args.locationQuery ? { query: args.locationQuery } : {}),
        ...(hasCoordinates ? {
          latitude: Number(args.latitude),
          longitude: Number(args.longitude),
        } : {}),
      };
      const layer = await runGevAction('set_layer_visibility', {
        layerId,
        enabled: true,
      }, runOptions);
      if (layer?.ok !== true || !current()) {
        return {
          ok: false,
          action: 'select_nearest_aircraft',
          stage: 'layer',
          cancelled: !current() || Boolean(layer?.cancelled),
          error: layer?.error || `${layerId} could not be enabled`,
          layer,
        };
      }

      const location = await runGevAction('fly_to_location', locationArgs, runOptions);
      if (location?.ok !== true || !current()) {
        return {
          ok: false,
          action: 'select_nearest_aircraft',
          stage: 'location',
          cancelled: !current() || Boolean(location?.cancelled),
          error: location?.error || `Could not arrive at ${location?.label || args.locationQuery || args.locationId || 'the requested place'}`,
          location,
          layer,
        };
      }

      let refreshed = false;
      try {
        if (typeof dataManager.refreshLayer === 'function') {
          refreshed = await dataManager.refreshLayer(layerId, { signal: runOptions.signal });
        } else {
          refreshed = (await dataManager.callLayerMethod(layerId, 'update', viewer, { signal: runOptions.signal })) !== false;
        }
      } catch {
        refreshed = false;
      }
      if (!refreshed || !current()) {
        return {
          ok: false,
          action: 'select_nearest_aircraft',
          stage: 'refresh',
          cancelled: !current(),
          error: !current()
            ? 'Nearest-aircraft refresh was cancelled'
            : `${layer.label || layerId} is enabled, but its destination refresh did not complete`,
          location,
          layer,
        };
      }
      const stats = dataManager.getLayerStatsRaw(layerId) || {};
      const source = String(stats.source || dataManager.getAll().find((item) => item.id === layerId)?.source || '').trim() || null;
      const feed = {
        state: layerFeedState({ ...stats, source }),
        source,
        count: Number.isFinite(Number(stats.count)) ? Number(stats.count) : null,
      };

      const nearest = await createAnalystEngine(analystProviders(viewer, dataManager, {
        recordLimitByLayer: { [layerId]: Number.MAX_SAFE_INTEGER },
      })).query({
        layers: [layerId],
        scope: { kind: 'view' },
        filters: [{ field: 'onGround', op: 'eq', value: false }],
        sortBy: 'distance',
        sortDir: 'asc',
        limit: 1,
      });
      const aircraft = nearest?.items?.[0] || null;
      if (!aircraft || !current()) {
        return {
          ok: false,
          action: 'select_nearest_aircraft',
          stage: 'nearest',
          cancelled: !current(),
          error: !current()
            ? 'Nearest-aircraft selection was cancelled'
            : (feed.state === 'unavailable'
              ? `${layer.label || layerId} is enabled, but ${feed.source || 'its aircraft feed'} is unavailable`
              : `${layer.label || layerId} is enabled${feed.state === 'fallback' ? ` on the ${feed.source || 'fallback'} feed` : ''}, but no airborne aircraft is loaded in the ${location.label || 'destination'} view yet`),
          location,
          layer,
          feed,
          count: nearest?.count || 0,
        };
      }

      const stableAircraftId = aircraft.icao24 || aircraft.id;
      const selection = await trackEntity(viewer, dataManager, styleManager, {
        query: stableAircraftId,
        layerId,
      });
      if (selection?.ok !== true) {
        return {
          ok: false,
          action: 'select_nearest_aircraft',
          stage: 'selection',
          error: selection?.error || 'The nearest airborne aircraft could not be selected',
          location,
          layer,
          feed,
          selection,
        };
      }
      return {
        ok: true,
        action: 'select_nearest_aircraft',
        location: location.label,
        layerId,
        label: selection.label,
        feed,
        aircraft: {
          id: stableAircraftId,
          callsign: aircraft.callsign || null,
          altitudeM: aircraft.altitudeM ?? null,
          distanceKm: aircraft.distanceKm ?? null,
          onGround: false,
        },
      };
    }

    if (name === 'set_visual_style') {
      const style = normalizeStyle(args.style);
      if (!style) throw new Error(`Unknown visual style: ${args.style || 'missing'}`);
      styleManager.setStyle(style);
      return { ok: true, action: 'set_visual_style', style };
    }

    if (name === 'set_panel_open') {
      const panelId = normalizePanelId(args.panelId || args.panel);
      if (!panelId) throw new Error(`Unknown panel: ${args.panelId || args.panel || 'missing'}`);
      const open = args.open !== false;
      setPanelOpen(styleManager, panelId, open);
      return { ok: true, action: 'set_panel_open', panelId, open };
    }

    if (name === 'set_context_mode') {
      if (!styleManager?.setContextMode) {
        return { ok: false, action: 'set_context_mode', error: 'Context mode control unavailable' };
      }
      const mode = normalizeContextMode(args.mode || args.contextMode);
      if (mode === null && args.mode != null && String(args.mode || '').trim() !== 'off') {
        return {
          ok: false,
          action: 'set_context_mode',
          error: `Unknown context mode: ${args.mode || 'missing'}`,
        };
      }
      const cancellationState = () => withContextModeVocabulary(
        typeof styleManager.getContextModeState === 'function'
          ? styleManager.getContextModeState()
          : {},
      );
      if (!current()) {
        return {
          ok: false,
          action: 'set_context_mode',
          cancelled: true,
          error: 'Context request was cancelled before it could run',
          ...cancellationState(),
        };
      }
      if (mode && mode !== 'off') {
        setPanelOpen(styleManager, 'global-context-panel', true);
      }
      const result = await styleManager.setContextMode(mode === 'off' ? null : mode, {
        signal: runOptions.signal,
        isCurrent: runOptions.isCurrent,
      });
      if (!current() && result?.ok !== true) {
        return {
          ...withContextModeVocabulary(result),
          ok: false,
          action: 'set_context_mode',
          cancelled: true,
          error: result?.error || 'Context request was cancelled before it completed',
          ...cancellationState(),
        };
      }
      const contactsWindow = ['contacts', 'flights'].includes(mode)
        ? activeContactsWindow(dataManager)
        : null;
      return {
        ...withContextModeVocabulary(result),
        ...(contactsWindow ? { contactsWindow } : {}),
      };
    }

    if (name === 'control_cockpit') {
      if (!styleManager?.controlCockpit) {
        return { ok: false, action: 'control_cockpit', error: 'Cockpit control unavailable' };
      }
      const rawAction = args.action || args.command;
      const action = normalizeCockpitAction(rawAction);
      const notificationToken = args.notificationToken || null;
      if (!action) {
        return {
          ok: false,
          action: 'control_cockpit',
          error: `Unknown cockpit action: ${args.action || args.command || 'missing'}`,
        };
      }
      const inferred = normalizeCockpitNavigationHints(rawAction);
      const targetLayer = normalizeCockpitTargetLayer(
        args.targetLayer || inferred.targetLayer || args.layer || args.layerId,
      );
      const aircraftClass = normalizeAircraftClassFilter(args.aircraftClass || inferred.aircraftClass || args.type || args.filterType);
      let contextChangedForEntry = false;
      let priorContextMode = null;
      let rollbackTarget = null;
      if (action === 'enter' && typeof styleManager.setContextMode === 'function') {
        if (!current()) {
          return {
            ok: false,
            action: 'control_cockpit',
            cancelled: true,
            error: 'Cockpit entry was cancelled before it could run',
            state: styleManager.getCockpitState?.() || null,
          };
        }
        rollbackTarget = styleManager.getAircraftTrackingTarget?.() || null;
        const contextState = typeof styleManager.getContextModeState === 'function'
          ? styleManager.getContextModeState()
          : {};
        priorContextMode = contextState?.mode || null;
        const contactsReady = contextState?.mode === 'flights'
          && contextState?.active !== false
          && contextState?.changing !== true;
        if (!contactsReady) {
          const contextResult = await styleManager.setContextMode('flights', {
            signal: runOptions.signal,
            isCurrent: runOptions.isCurrent,
            // Cockpit entry establishes Contacts as its own precondition. That
            // is internal choreography, not an operator Context request, so it
            // must stay inert: claiming here would cancel a pending shared
            // style/detection restore the operator never overrode.
            claimVisualAuthority: false,
          });
          contextChangedForEntry = contextResult?.ok === true;
          if (contextResult?.ok !== true || !current()) {
            const contextRollback = contextChangedForEntry
              ? await styleManager.setContextMode(priorContextMode, {
                claimVisualAuthority: false,
              })
              : null;
            return {
              ok: false,
              action: 'control_cockpit',
              cancelled: !current() || Boolean(contextResult?.cancelled),
              error: contextResult?.error || 'Contacts context could not be established for Cockpit entry',
              context: contextResult ? withContextModeVocabulary(contextResult) : null,
              contextRollback: withContextModeVocabulary(contextRollback),
              state: styleManager.getCockpitState?.() || null,
            };
          }
        }
      }
      // Contacts activation can adopt a newer explicit aircraft selection.
      // Sample only after that transaction settles so an older voice snapshot
      // cannot overwrite the operator's newer choice.
      const selectedTarget = action === 'enter'
        ? selectedCockpitTarget(dataManager)
        : null;
      let cockpitResult;
      try {
        cockpitResult = await styleManager.controlCockpit(action, {
          notificationToken,
          targetLayer,
          aircraftClass,
          selectedTarget,
          rollbackTarget,
        });
      } catch (error) {
        cockpitResult = {
          ok: false,
          action: 'control_cockpit',
          error: error instanceof Error ? error.message : String(error),
          state: styleManager.getCockpitState?.() || null,
        };
      }
      if (action === 'enter' && cockpitResult?.ok !== true && contextChangedForEntry) {
        const contextRollback = await styleManager.setContextMode(priorContextMode, {
          // Undoing this action's own precondition — still choreography.
          claimVisualAuthority: false,
          ...(current() ? {
            signal: runOptions.signal,
            isCurrent: runOptions.isCurrent,
          } : {}),
        });
        return { ...cockpitResult, contextRollback: withContextModeVocabulary(contextRollback) };
      }
      return cockpitResult;
    }

    if (name === 'show_data_layers_menu') {
      const layerId = normalizeLayerId(args.layerId || args.layer);
      setPanelOpen(styleManager, 'data-panel', true);
      const focusedLayer = layerId && dataManager.layers.has(layerId)
        ? focusDataLayerRow(layerId)
        : null;
      return {
        ok: true,
        action: 'show_data_layers_menu',
        panelId: 'data-panel',
        focusedLayer,
        layers: dataManager.getAll()
          .filter((layer) => layer.showInTogglePanel !== false)
          .map((layer) => ({
          id: layer.id,
          name: layer.name,
          enabled: layer.enabled,
          count: layer.stats?.count || 0,
          })),
      };
    }

    if (name === 'fly_to_location') {
      return flyToRequestedLocation(viewer, args, {
        runImmediate: typeof styleManager?.runImmediateLocationNavigation === 'function'
          ? (navigate) => styleManager.runImmediateLocationNavigation(navigate)
          : null,
        beginDeferred: typeof styleManager?.beginDeferredLocationNavigation === 'function'
          ? () => styleManager.beginDeferredLocationNavigation()
          : null,
        reassertDeferred: typeof styleManager?.reassertDeferredLocationNavigation === 'function'
          ? (generation) => styleManager.reassertDeferredLocationNavigation(generation)
          : null,
        onStart: () => {
          if (typeof styleManager?.beginLocationNavigation === 'function') {
            styleManager.beginLocationNavigation();
            return;
          }
          interruptCameraMotion('nav:fly_to_location');
          if (viewer.trackedEntity) stopAllTracking(viewer, dataManager);
        },
      });
    }

    if (name === 'adjust_camera_zoom') {
      return adjustCameraZoom(viewer, args);
    }

    if (name === 'zoom_to_globe') {
      if (typeof styleManager?.resetToGlobeView === 'function') {
        return styleManager.resetToGlobeView();
      }
      const result = flyToGlobeView(viewer);
      return {
        ok: true,
        action: 'zoom_to_globe',
        heightKm: Math.round(GLOBE_VIEW.heightM / 1000),
        centeredOn: {
          latitude: Number(result.latitude.toFixed(2)),
          longitude: Number(result.longitude.toFixed(2)),
        },
      };
    }

    if (name === 'next_iss_pass') {
      return nextIssPass(viewer, args);
    }

    if (name === 'analyst_query') {
      return runAnalystQuery(viewer, dataManager, args);
    }

    if (name === 'move_camera') {
      return moveCamera(args, (navigate, releaseOptions) => runManagedVoiceNavigation(
        styleManager, 'camera', 'move_camera', navigate, releaseOptions,
      ));
    }

    if (name === 'fly_route') {
      return flyRoute(
        annotations?.list?.() || [],
        args,
        (lat, lon) => cachedGroundFloor(lat, lon),
        (navigate) => runManagedVoiceNavigation(styleManager, 'route', 'fly_route', navigate),
        (cells) => warmGroundFloor(cells),
      );
    }

    if (name === 'get_entity_context') {
      return getEntityContext(viewer, dataManager, styleManager, args);
    }

    if (name === 'get_current_view_state') {
      return getCurrentViewState(viewer, styleManager, dataManager, sceneDirector);
    }

    if (name === 'set_hud') {
      const out = { ok: true, action: 'set_hud' };
      if (args.layout != null) {
        const result = styleManager.setHudLayout(args.layout);
        if (!result.ok) return { ...result, action: 'set_hud' };
        Object.assign(out, result);
      }
      if (args.visible != null) {
        const result = styleManager.setHudVisible(args.visible);
        if (!result.ok) return { ...result, action: 'set_hud' };
        Object.assign(out, result);
      }
      return { ...out, hud: styleManager.getControlState().hud };
    }

    if (name === 'set_detection') {
      const result = styleManager.setDetection({
        enabled: typeof args.enabled === 'boolean' ? args.enabled : undefined,
        mode: typeof args.mode === 'string' ? args.mode : undefined,
        densityPct: Number.isFinite(Number(args.densityPct)) ? Number(args.densityPct) : undefined,
        allocationStrategy: typeof args.allocationStrategy === 'string' ? args.allocationStrategy : undefined,
      });
      return { action: 'set_detection', ...result };
    }

    if (name === 'set_map_stack') {
      const stackId = normalizeStackId(args.stack);
      if (!stackId) throw new Error(`Unknown map stack: ${args.stack || 'missing'}`);
      const result = await styleManager.setMapStack(stackId);
      return { action: 'set_map_stack', requested: stackId, ...result };
    }

    if (name === 'set_post_processing') {
      const out = { ok: true, action: 'set_post_processing' };
      if (args.bloom && typeof args.bloom === 'object') {
        Object.assign(out, styleManager.setBloom({
          enabled: typeof args.bloom.enabled === 'boolean' ? args.bloom.enabled : undefined,
          intensityPct: Number.isFinite(Number(args.bloom.intensityPct)) ? Number(args.bloom.intensityPct) : undefined,
        }));
      }
      if (args.sharpen && typeof args.sharpen === 'object') {
        Object.assign(out, styleManager.setSharpen({
          enabled: typeof args.sharpen.enabled === 'boolean' ? args.sharpen.enabled : undefined,
          intensityPct: Number.isFinite(Number(args.sharpen.intensityPct)) ? Number(args.sharpen.intensityPct) : undefined,
        }));
      }
      return out;
    }

    if (name === 'control_scene') {
      return controlScene(sceneDirector, args);
    }

    if (name === 'control_cctv') {
      return controlCctv(dataManager, args, styleManager);
    }

    if (name === 'control_radio') {
      return controlRadio(viewer, dataManager, args, runOptions);
    }

    if (name === 'track_entity') {
      return trackEntity(viewer, dataManager, styleManager, args);
    }

    if (name === 'stop_tracking') {
      return stopAllTracking(viewer, dataManager);
    }

    if (name === 'frame_overhead') {
      return frameOverhead(viewer, dataManager, styleManager, args);
    }

    if (name === 'annotate_map') {
      return annotateMap(annotations, args);
    }

    if (name === 'clear_annotations') {
      return clearAnnotations(annotations);
    }

    throw new Error(`Unknown GEV tool: ${name}`);
  };
}
