// Pure presentation for a Data Layers row: the meta line, the switch state and
// count/age formatting. No DOM, no manager state — the toggle-panel mixin
// (managerTogglePanel.js) reads `getAll()` rows and applies these results.
import { layerFeedState, FEED_STATE_LABELS } from './managerFeedState.js';

/** Lifecycle transition → user-visible (English) label; the state keys stay English. */
export const LIFECYCLE_LABELS = Object.freeze({
  enabling: 'TURNING ON',
  disabling: 'TURNING OFF',
});

/**
 * Compact a feature count for the row ("1.2K").
 * @param {number} n Count.
 * @returns {string}
 */
export function formatLayerCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/**
 * Short English age for the row meta line ("3m lalu").
 * @param {number} timestamp Epoch ms.
 * @param {number} [now] Epoch ms.
 * @returns {string}
 */
export function formatLayerAge(timestamp, now = Date.now()) {
  const diff = Math.floor((now - timestamp) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/**
 * The row's meta line: lifecycle phase, uncertainty, error, or source + age.
 * @param {{source?:string, enabled?:boolean, lifecycleState?:string,
 *   lifecycleUncertain?:boolean, stats?:object}} layer `getAll()` row.
 * @param {number} [now] Epoch ms.
 * @returns {string}
 */
export function buildLayerMetaText(layer, now = Date.now()) {
  const stats = layer.stats || {};
  const feedState = layerFeedState(stats);
  const stateLabel = FEED_STATE_LABELS[feedState];
  const source = stats.source || layer.source;
  const lifecycleState = layer.lifecycleState || (layer.enabled ? 'enabled' : 'disabled');
  if (lifecycleState === 'enabling' || lifecycleState === 'disabling') {
    return `${LIFECYCLE_LABELS[lifecycleState]} · ${source}`;
  }
  if (layer.lifecycleUncertain) {
    return `UNCERTAIN · ${source} · cycle state needs reconciling`;
  }
  const presentedError = stats.error || stats.lastError || stats.managerRefreshError;
  if (presentedError) {
    if (typeof stats.retryInSec === 'number' && stats.retryInSec > 0) {
      return `${stateLabel} · ${source} · ${presentedError} · retry ${stats.retryInSec}s`;
    }
    return `${stateLabel} · ${source} · ${presentedError}`;
  }
  const ago = stats.lastUpdate ? formatLayerAge(stats.lastUpdate, now) : 'never';
  if (stats.loading) {
    const loadingLabel = typeof stats.loadingLabel === 'string' && stats.loadingLabel.trim()
      ? stats.loadingLabel.trim()
      : 'loading...';
    return `${source} · ${loadingLabel}`;
  }
  if (feedState === 'fallback') {
    const detail = typeof stats.loadingLabel === 'string' && stats.loadingLabel.trim()
      ? stats.loadingLabel.trim()
      : (stats.coverage || ago);
    return `${stateLabel} · ${source} · ${detail}`;
  }
  if (feedState === 'stale') {
    const retry = typeof stats.retryInSec === 'number' && stats.retryInSec > 0
      ? ` · retrying in ${stats.retryInSec}s`
      : '';
    return `${stateLabel} · ${source} · ${ago}${retry}`;
  }
  if (typeof stats.loadingLabel === 'string' && stats.loadingLabel.trim()) {
    return `${source} · ${stats.loadingLabel.trim()}`;
  }
  return `${source} · ${ago}`;
}

/**
 * What the row switch shows. It presents the latest intent, so a layer still
 * loading reads ON and the click that follows means "cancel". The transition
 * label follows the same intent: a revoked enable whose cleanup has not yet
 * run is already heading OFF.
 * @param {{name?:string, enabled:boolean, effectiveEnabled?:boolean,
 *   lifecycleState?:string, lifecycleUncertain?:boolean, stats?:object}} layer `getAll()` row.
 * @returns {{on:boolean, transitioning:boolean, phase:'enabling'|'disabling'|null,
 *   uncertain:boolean, feedClass:string|null, state:string, text:string, ariaLabel:string}}
 */
export function toggleButtonPresentation(layer) {
  const feedState = layer.enabled ? layerFeedState(layer.stats) : 'off';
  const transitioning = layer.lifecycleState === 'enabling' || layer.lifecycleState === 'disabling';
  const uncertain = Boolean(layer.lifecycleUncertain);
  const on = layer.effectiveEnabled ?? layer.enabled;
  const phase = transitioning ? (on ? 'enabling' : 'disabling') : null;
  const text = phase
    ? LIFECYCLE_LABELS[phase]
    : (uncertain ? 'UNCERTAIN' : (layer.enabled ? FEED_STATE_LABELS[feedState] : 'OFF'));
  return {
    on,
    transitioning,
    phase,
    uncertain,
    feedClass: layer.enabled && !uncertain ? feedState : null,
    state: phase || (uncertain ? 'uncertain' : feedState),
    text,
    ariaLabel: `${layer.name}: ${text}`,
  };
}
