// src/log/layerHealthLog.js
/**
 * Report data-layer health to the Server Log from the browser.
 *
 * Most layer failures happen only in the browser (a fetch timing out, a
 * payload that will not parse) and were only ever written to the browser
 * console, so the /admin Server Log never showed why a layer read
 * "Terganggu". This module watches the same `layerFeedState` the layer rows
 * show and reports each transition into — and back out of — a fault, with the
 * layer, the state and the layer's own reason. A failed enable/disable is
 * reported from the manager's `visibility-failed` event.
 *
 * Transition-based: an unchanged fault is not re-sent; the server merges
 * repeats within an hour anyway.
 *
 * @module log/layerHealthLog
 */

import { layerFeedState } from '../data/managerFeedState.js';
import { layerLabel } from '../shell/layerStatus.js';
import { logClientEvent } from './clientLog.js';

/** How often enabled layers are re-checked. */
export const LAYER_HEALTH_POLL_MS = 5000;

const FAULTS = Object.freeze({
  unavailable: { level: 'error', text: 'sumber tidak tersedia' },
  degraded: { level: 'warn', text: 'sebagian data bermasalah' },
  stale: { level: 'warn', text: 'data usang' },
  fallback: { level: 'warn', text: 'memakai sumber cadangan' },
});

/** The layer's own explanation for its state, as one line. */
export function layerFaultReason(stats = {}) {
  const raw = stats.error || stats.lastError || stats.managerRefreshError;
  const reason = raw instanceof Error ? raw.message : String(raw ?? '').trim();
  return reason || 'tanpa keterangan dari layer';
}

/**
 * Compare enabled layers against the last reported state.
 * @param {Map<string, string>} previous layerId → `state|reason` last reported.
 * @param {Array<object>} layers `DataLayerManager.getAll()` rows.
 * @returns {{events: object[], next: Map<string, string>}}
 */
export function layerHealthEvents(previous, layers) {
  const next = new Map();
  const events = [];
  for (const layer of layers || []) {
    if (!layer?.id || !layer.enabled || layer.lifecycleState !== 'enabled') continue;
    const before = previous.get(layer.id);
    const state = layerFeedState(layer.stats);
    if (state === 'loading') {
      if (before) next.set(layer.id, before);
      continue;
    }
    const label = layerLabel(layer.id, layer.name || layer.id);
    const fault = FAULTS[state];
    if (!fault) {
      if (before) {
        events.push({ level: 'info', source: 'layer', code: 'layer.recovered', message: `${label} — normal kembali`, detail: { layer: layer.id } });
      }
      continue;
    }
    const reason = layerFaultReason(layer.stats);
    const key = `${state}|${reason}`;
    next.set(layer.id, key);
    if (key === before) continue;
    events.push({
      level: fault.level,
      source: 'layer',
      code: `layer.${state}`,
      message: `${label} — ${fault.text}: ${reason}`,
      detail: { layer: layer.id, state, count: Number(layer.stats?.count) || 0 },
    });
  }
  return { events, next };
}

/**
 * Event for a manager `visibility-failed` notification, or null for anything else.
 * @param {{type?: string, layerId?: string, phase?: string, error?: unknown}} change
 * @param {string} [name] Module name, for the label fallback.
 */
export function layerVisibilityFailureEvent(change, name) {
  if (change?.type !== 'visibility-failed' || !change.layerId) return null;
  const label = layerLabel(change.layerId, name || change.layerId);
  const reason = change.error instanceof Error ? change.error.message : String(change.error ?? '').trim();
  const phase = change.phase || 'enable';
  return {
    level: 'error',
    source: 'layer',
    code: 'layer.visibility_failed',
    message: `${label} — gagal saat ${phase}: ${reason || 'tanpa keterangan'}`,
    detail: { layer: change.layerId, phase },
  };
}

/**
 * Start reporting. Call once after the manager's layers are registered.
 * @param {{getAll: () => object[], subscribe: (fn: Function) => Function}} dataManager
 * @param {{log?: (event: object) => void, every?: (fn: Function, ms: number) => any}} [deps]
 * @returns {() => void} Stops reporting.
 */
export function installLayerHealthLog(dataManager, {
  log = logClientEvent,
  every = (fn, ms) => setInterval(fn, ms),
  cancel = (handle) => clearInterval(handle),
} = {}) {
  let reported = new Map();
  const check = () => {
    try {
      const { events, next } = layerHealthEvents(reported, dataManager.getAll());
      reported = next;
      for (const event of events) log(event);
    } catch (error) {
      console.warn(`[client-log] layer health check failed: ${error?.message || error}`);
    }
  };
  const unsubscribe = dataManager.subscribe((change) => {
    const event = layerVisibilityFailureEvent(change);
    if (event) log(event);
  });
  const handle = every(check, LAYER_HEALTH_POLL_MS);
  return () => {
    cancel(handle);
    unsubscribe?.();
  };
}
