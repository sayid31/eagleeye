// Moved out of gevActions.js (gevActionsCctv).

import { CCTV_FOCUS_RESULT } from '../data/cctvFocusResult.js';

/** Voice CCTV control over the cctv layer module's public surface. */
export async function controlCctv(dataManager, args = {}, styleManager = null) {
  const action = String(args.action || '').toLowerCase();
  // Registration-existence check only — does NOT force-resolve a not-yet-
  // loaded lazy CCTV module just to answer "does this layer exist" (plan
  // §3.2/§3.6). Every subsequent read/mutation below routes through the
  // dataManager facade instead of a captured module reference.
  if (!dataManager.layers.has('cctv')) {
    return { ok: false, action: 'control_cctv', error: 'CCTV layer unavailable' };
  }

  if (action === 'enable' || action === 'disable') {
    await dataManager.setEnabled('cctv', action === 'enable', { origin: 'voice' });
    return { ok: true, action: 'control_cctv', enabled: dataManager.isEnabled('cctv') };
  }
  if (!dataManager.isEnabled('cctv')) {
    return { ok: false, action: 'control_cctv', error: 'CCTV layer is off — enable it first' };
  }

  const summarize = () => {
    const ui = dataManager.getLayerUIState('cctv') || {};
    return {
      activeCameraId: ui.activeCameraId || null,
      activeCamera: ui.activeCamera?.name || ui.activeCamera?.id || null,
      cameraCount: Array.isArray(ui.cameras) ? ui.cameras.length : (ui.count || 0),
      showCoverage: !!ui.showCoverage,
      coverageMode: ui.coverageMode || (ui.showCoverage ? 'on' : 'off'),
      showProjection: !!ui.showProjection,
      calibrationMode: !!ui.calibrationMode,
      autoHop: !!ui.autoHop,
    };
  };

  if (action === 'select') {
    const query = String(args.cameraQuery || '').trim().toLowerCase();
    if (!query) throw new Error('control_cctv select needs cameraQuery');
    const cams = dataManager.getLayerUIState('cctv')?.cameras || [];
    const match = cams.find((cam) => String(cam.id || '').toLowerCase() === query)
      || cams.find((cam) => String(cam.name || '').toLowerCase() === query)
      || cams.find((cam) => String(cam.name || '').toLowerCase().includes(query));
    if (!match) {
      return { ok: false, action: 'control_cctv', error: `No camera matched "${args.cameraQuery}"`, ...summarize() };
    }
    styleManager?.supersedeDeferredNavigation?.();
    const selected = dataManager.callLayerMethod('cctv', 'selectCamera', match.id);
    const focusResult = selected
      ? dataManager.focusCamera('cctv', match.id, 1.8)
      : CCTV_FOCUS_RESULT.NO_ACTIVE_CAMERA;
    return {
      action: 'control_cctv',
      selected: match.name || match.id,
      ...summarize(),
      ...cctvVoiceFocusOutcome(focusResult, { cameraSelected: !!selected }),
    };
  }
  if (action === 'next' || action === 'prev') {
    styleManager?.supersedeDeferredNavigation?.();
    const nextId = dataManager.callLayerMethod('cctv', 'cycleCamera', action === 'next' ? 1 : -1);
    const focusResult = nextId
      ? dataManager.focusCamera('cctv', nextId, 1.8)
      : CCTV_FOCUS_RESULT.NO_ACTIVE_CAMERA;
    return {
      action: 'control_cctv',
      ...summarize(),
      ...cctvVoiceFocusOutcome(focusResult, { cameraSelected: !!nextId }),
    };
  }
  if (action === 'nearest') {
    styleManager?.supersedeDeferredNavigation?.();
    const nearestId = dataManager.callLayerMethod('cctv', 'focusNearest', { focus: false });
    const focusResult = nearestId
      ? dataManager.focusCamera('cctv', nearestId, 1.8)
      : CCTV_FOCUS_RESULT.NO_ACTIVE_CAMERA;
    return {
      action: 'control_cctv',
      ...summarize(),
      ...cctvVoiceFocusOutcome(focusResult, { cameraSelected: !!nearestId }),
    };
  }
  if (action === 'focus') {
    const activeId = dataManager.getLayerUIState('cctv')?.activeCameraId;
    if (activeId) styleManager?.supersedeDeferredNavigation?.();
    const focusResult = activeId
      ? dataManager.focusCamera('cctv', activeId)
      : CCTV_FOCUS_RESULT.NO_ACTIVE_CAMERA;
    return { action: 'control_cctv', ...summarize(), ...cctvVoiceFocusOutcome(focusResult) };
  }
  if (action === 'viewshed') {
    // Color-coded coverage volumes; enabled:false drops back to plain
    // coverage wireframes (not off — "hide coverage" is the coverage action).
    const next = (typeof args.enabled === 'boolean' && !args.enabled) ? 'on' : 'viewshed';
    dataManager.setLayerParams('cctv', { coverageMode: next }, { origin: 'voice' });
    return { ok: true, action: 'control_cctv', ...summarize() };
  }
  if (action === 'adjust') {
    const current = summarize();
    const next = typeof args.enabled === 'boolean' ? args.enabled : !current.calibrationMode;
    dataManager.setLayerParams('cctv', { calibrationMode: next }, { origin: 'voice' });
    return { ok: true, action: 'control_cctv', ...summarize() };
  }
  if (action === 'coverage') {
    const current = summarize();
    const next = typeof args.enabled === 'boolean' ? args.enabled : !current.showCoverage;
    dataManager.setLayerParams('cctv', { coverageMode: next ? 'on' : 'off' }, { origin: 'voice' });
    return { ok: true, action: 'control_cctv', ...summarize() };
  }
  if (action === 'projection' || action === 'autohop') {
    const key = action === 'projection' ? 'showProjection' : 'autoHop';
    const current = summarize();
    const next = typeof args.enabled === 'boolean' ? args.enabled : !current[key];
    dataManager.setLayerParams('cctv', { [key]: next }, { origin: 'voice' });
    return { ok: true, action: 'control_cctv', ...summarize() };
  }
  throw new Error(`Unknown CCTV action: ${args.action || 'missing'}`);
}

// Voice Radio controls (RADIO_COUNTRY_CENTERS, knownRadioLocation,
// controlRadio and its private helpers) now live in gevRadioActions.js —
// mechanical relocation, see that file's header for the split-import
// rationale (normalizeLocationId, readLayerLifecycleSummary).

/**
 * Maps a CCTV focus code to an honest voice-tool result.
 * @param {string|boolean} focusResult CCTV focus result code.
 * @param {Object} [options]
 * @param {boolean} [options.cameraSelected=false] Whether this action first selected a camera.
 * @returns {{ok: boolean, error: string|null}} Voice-facing result fields.
 */
export function cctvVoiceFocusOutcome(focusResult, { cameraSelected = false } = {}) {
  if (focusResult === CCTV_FOCUS_RESULT.FOCUSED || focusResult === true) {
    return { ok: true, error: null };
  }
  if (focusResult === CCTV_FOCUS_RESULT.TRACKING_HOLDS_VIEW) {
    return {
      ok: false,
      error: cameraSelected
        ? 'Camera selected; tracking holds the view — say untrack to fly'
        : 'Camera active; tracking holds the view — say untrack first',
    };
  }
  if (focusResult === CCTV_FOCUS_RESULT.COCKPIT_ACTIVE) {
    return {
      ok: false,
      error: cameraSelected
        ? 'Camera selected; in cockpit — exit cockpit to fly to it'
        : 'In cockpit — exit cockpit to fly to a camera',
    };
  }
  return { ok: false, error: 'No active camera to focus' };
}
