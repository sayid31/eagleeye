// Shell presentation of data layers: honest status, grouping and Indonesian labels.
// Pure functions over `layerFeedState` (managerFeedState.js) — no new feed logic lives here.
import { layerFeedState } from '../data/managerFeedState.js';

/** Layers backed by bundled/static datasets: "Live" would overstate them. */
export const STATIC_LAYER_IDS = Object.freeze([
  'local-datacenters',
  'local-dams',
  'local-sumbar-tsunami',
  'military-installations',
]);

export const LAYER_GROUPS = Object.freeze([
  { id: 'pergerakan', label: 'Pergerakan' },
  { id: 'lingkungan', label: 'Lingkungan' },
  { id: 'kota', label: 'Kota' },
]);

const GROUP_BY_LAYER = Object.freeze({
  flights: 'pergerakan',
  military: 'pergerakan',
  'ais-live-vessels': 'pergerakan',
  satellites: 'pergerakan',
  'rocket-launches': 'pergerakan',
  earthquakes: 'lingkungan',
  'local-firms': 'lingkungan',
  'local-dams': 'lingkungan',
  'local-sumbar-tsunami': 'lingkungan',
});

/** Display labels; layers not listed keep the name the layer module declares. */
export const LAYER_LABELS = Object.freeze({
  flights: 'Pesawat sipil',
  military: 'Pesawat militer',
  'ais-live-vessels': 'Kapal (AIS)',
  satellites: 'Satelit',
  'rocket-launches': 'Misi antariksa (30 hari)',
  earthquakes: 'Gempa 24 jam',
  'local-firms': 'Titik api (NASA FIRMS)',
  'local-dams': 'Bendungan',
  'local-sumbar-tsunami': 'Tsunami Sumbar (tidak resmi)',
  'local-datacenters': 'Pusat data',
  traffic: 'Lalu lintas',
  cctv: 'CCTV',
  radio: 'Radio',
  bikeshare: 'Sepeda bersama',
  'military-installations': 'Instalasi militer',
  'military-awareness': 'Konteks global',
});

/** @param {string} id Layer id. @returns {string} Group id (defaults to `kota`). */
export function layerGroupId(id) {
  return GROUP_BY_LAYER[id] || 'kota';
}

/** @param {string} id Layer id. @param {string} [fallback] Declared name. */
export function layerLabel(id, fallback = id) {
  return LAYER_LABELS[id] || fallback;
}

/**
 * Flex `order` for a row and for its group heading, so the registry order can
 * stay untouched while the panel reads grouped.
 * @param {string} id Layer id.
 * @param {number} registryIndex Position in the registry.
 * @returns {{group:string, groupOrder:number, headingOrder:number, rowOrder:number}}
 */
export function layerOrder(id, registryIndex) {
  const group = layerGroupId(id);
  const groupIndex = LAYER_GROUPS.findIndex((entry) => entry.id === group);
  return {
    group,
    groupOrder: groupIndex,
    headingOrder: groupIndex * 1000,
    rowOrder: groupIndex * 1000 + 1 + registryIndex,
  };
}

/**
 * Indonesian "N jam lalu" for a past timestamp; null when unknown.
 * @param {number|null|undefined} timestamp Epoch ms.
 * @param {number} [now] Epoch ms.
 */
export function agoLabel(timestamp, now = Date.now()) {
  if (!Number.isFinite(timestamp)) return null;
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return 'baru saja';
  if (seconds < 60) return `${seconds} detik lalu`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
  return `${Math.floor(seconds / 86400)} hari lalu`;
}

/**
 * Collapse a `DataLayerManager.getAll()` row into the three states the shell
 * shows. Never reports Live for a layer that is off, loading, faulted or static.
 * @param {{id?:string, enabled:boolean, lifecycleState?:string,
 *   lifecycleUncertain?:boolean, stats?:object}} layer
 * @param {number} [now] Epoch ms.
 * @returns {{key:'live'|'static'|'degraded'|'loading'|'off', label:string, detail:string}}
 */
export function layerShellStatus(layer, now = Date.now()) {
  const stats = layer?.stats || {};
  const transitioning = layer?.lifecycleState === 'enabling' || layer?.lifecycleState === 'disabling';
  if (transitioning) return { key: 'loading', label: 'Memuat', detail: '' };
  if (layer?.lifecycleUncertain) {
    return { key: 'degraded', label: 'Terganggu', detail: 'status belum pasti' };
  }
  if (!layer?.enabled) return { key: 'off', label: 'Mati', detail: '' };
  const feed = layerFeedState(stats);
  const ago = agoLabel(stats.lastUpdate, now);
  switch (feed) {
    case 'loading':
      return { key: 'loading', label: 'Memuat', detail: '' };
    case 'stale':
      return { key: 'degraded', label: 'Terganggu', detail: ago ? `data ${ago}` : 'data usang' };
    case 'fallback':
      return { key: 'degraded', label: 'Terganggu', detail: 'memakai sumber cadangan' };
    case 'unavailable':
      return { key: 'degraded', label: 'Terganggu', detail: 'sumber tidak tersedia' };
    case 'degraded':
      return { key: 'degraded', label: 'Terganggu', detail: 'sebagian data bermasalah' };
    default:
      return STATIC_LAYER_IDS.includes(layer?.id)
        ? { key: 'static', label: 'Data statis', detail: '' }
        : { key: 'live', label: 'Live', detail: '' };
  }
}

/**
 * Top-bar source-health summary over enabled layers only.
 * @param {Array<object>} layers `getAll()` rows.
 * @param {number} [now] Epoch ms.
 * @returns {{live:number, degraded:number, active:number}}
 */
export function summarizeSources(layers, now = Date.now()) {
  let live = 0;
  let degraded = 0;
  let active = 0;
  for (const layer of layers || []) {
    if (!layer?.enabled) continue;
    active += 1;
    const { key } = layerShellStatus(layer, now);
    if (key === 'live') live += 1;
    else if (key === 'degraded') degraded += 1;
  }
  return { live, degraded, active };
}
