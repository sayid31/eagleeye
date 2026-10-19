// Mounts the shell chrome (top bar, icon rail, status bar) and keeps it in sync.
// Presentation only: every action proxies to an existing control, and layer
// state is read from DataLayerManager.getAll() without writing to it.
import * as Cesium from 'cesium';
import { forward as toMGRS } from 'mgrs';
import { ellipsoidalToMslDisplayM, geoidHeight } from '../data/geoid.js';
import { activeCount, applyRowPlan, planRows } from './layerRows.js';
import { summarizeSources } from './layerStatus.js';
import {
  formatAltitude, formatDms, formatMgrs, formatUtcClock, healthLabels,
} from './shellFormat.js';
import { panelsToCollapse } from './railPlan.js';
import { RAIL_ITEMS, railMarkup, statusBarMarkup, topBarMarkup } from './shellMarkup.js';

const REFRESH_MS = 1500;
const CLOCK_MS = 1000;
const POSITION_MS = 500;
const PANEL_TITLE = 'Layer data';
const RAIL_PANELS = Object.freeze({ layers: 'data-panel', camera: 'cctv-panel', scenes: 'scene-panel',
  display: 'pp-toggles', context: 'global-context-panel',
});

/**
 * Mount the shell. Returns a disposer that removes the markup and timers.
 * @param {{viewer: object, dataManager: object}} deps
 * @returns {() => void}
 */
export function initShell({ viewer, dataManager }) {
  if (document.getElementById('shell-topbar')) return () => {};
  document.body.classList.add('ee-shell');
  document.body.insertAdjacentHTML('afterbegin', topBarMarkup() + railMarkup() + statusBarMarkup());

  const $ = (id) => document.getElementById(id);
  const cleanups = [];

  // Search proxies to the existing location search so its flight/hand-off
  // rules (navigation generations, deferred restore) stay in one place.
  const input = $('shell-search-input');
  const legacy = document.getElementById('location-search');
  const onSearchKey = (event) => {
    if (event.key !== 'Enter' || !legacy || !input.value.trim()) return;
    legacy.value = input.value.trim();
    legacy.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.blur();
  };
  input.addEventListener('keydown', onSearchKey);
  const onGlobalKey = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus();
    }
  };
  document.addEventListener('keydown', onGlobalKey);
  cleanups.push(() => document.removeEventListener('keydown', onGlobalKey));

  const onRailClick = (event) => {
    const button = event.target.closest?.('.shell-rail-btn');
    if (!button) return;
    const item = RAIL_ITEMS.find((entry) => entry.id === button.dataset.railId);
    const panelId = RAIL_PANELS[item?.id];
    if (panelId && document.getElementById(panelId)?.classList.contains('collapsed')) {
      const expanded = [...document.querySelectorAll('.panel-collapsible:not(.collapsed)')].map((el) => el.id);
      for (const id of panelsToCollapse(panelId, expanded)) {
        document.querySelector(`.panel-collapse-btn[data-collapse-target="${id}"]`)?.click();
      }
    }
    document.querySelector(item?.target || '')?.click();
    syncRail();
  };
  $('shell-rail').addEventListener('click', onRailClick);

  function syncRail() {
    for (const [railId, panelId] of Object.entries(RAIL_PANELS)) {
      const button = document.querySelector(`.shell-rail-btn[data-rail-id="${railId}"]`);
      const open = !document.getElementById(panelId)?.classList.contains('collapsed');
      button?.classList.toggle('active', open);
      button?.setAttribute('aria-pressed', open ? 'true' : 'false');
    }
  }

  function refreshLayers() {
    const layers = dataManager.getAll();
    const container = $('data-toggles');
    if (container) applyRowPlan(container, planRows(layers));
    const summary = summarizeSources(layers);
    const labels = healthLabels(summary);
    $('shell-health-live').textContent = labels.live;
    $('shell-health-degraded').textContent = labels.degraded;
    $('shell-health-degraded-wrap').hidden = !labels.degraded;
    syncRail();
    syncPanelHeader(layers);
  }

  function syncPanelHeader(layers) {
    const header = document.querySelector('#data-panel .panel-header');
    if (!header) return;
    const title = header.querySelector('.panel-title');
    if (title && title.textContent !== PANEL_TITLE) title.textContent = PANEL_TITLE;
    let chip = header.querySelector('.ee-active-count');
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'ee-active-count';
      header.querySelector('.panel-divider')?.after(chip);
    }
    const text = `${activeCount(layers)} aktif`;
    if (chip.textContent !== text) chip.textContent = text;
  }

  function refreshPosition() {
    const cartographic = viewer.camera.positionCartographic;
    if (!cartographic) return;
    const lat = Cesium.Math.toDegrees(cartographic.latitude);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    let mgrs = '—';
    try {
      mgrs = formatMgrs(toMGRS([lon, lat], 4));
    } catch {
      // MGRS is undefined near the poles (outside 80°S–84°N); keep the dash.
    }
    let geoidN = null;
    try {
      geoidN = geoidHeight(lat, lon);
    } catch {
      // Geoid grid not loaded yet: ellipsoidal height is shown until it is.
    }
    const msl = ellipsoidalToMslDisplayM(cartographic.height, Number.isFinite(geoidN) ? geoidN : null);
    $('shell-coords').textContent = `${formatDms(lat, 'lat')} ${formatDms(lon, 'lon')}`;
    $('shell-mgrs').textContent = `MGRS ${mgrs}`;
    $('shell-alt').textContent = `Alt ${formatAltitude(msl)}`;
  }

  const tick = () => { $('shell-clock').textContent = formatUtcClock(new Date()); };
  tick();
  refreshLayers();
  refreshPosition();
  const timers = [
    setInterval(tick, CLOCK_MS),
    setInterval(refreshLayers, REFRESH_MS),
    setInterval(refreshPosition, POSITION_MS),
  ];
  const unsubscribe = dataManager.subscribe(refreshLayers);

  return () => {
    timers.forEach(clearInterval);
    unsubscribe();
    cleanups.forEach((fn) => fn());
    for (const id of ['shell-topbar', 'shell-rail', 'shell-statusbar']) $(id)?.remove();
    document.body.classList.remove('ee-shell');
  };
}
