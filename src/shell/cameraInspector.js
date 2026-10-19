// Camera inspector: a read-only view over the CCTV layer state, placed at the
// top of the existing CCTV panel. Every action proxies to a control that
// already exists (focus, ADJUST, collapse) or to the layer's public
// selectCamera, so no CCTV behaviour is duplicated here.
import {
  inspectorBadges, inspectorRows, nearbyCameras, searchCameras,
} from './cameraInspectorModel.js';
import { inspectorMarkup } from './cameraInspectorMarkup.js';

const PANEL_TITLE = 'Kamera';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Mount the inspector into #cctv-panel. Returns a disposer.
 * @param {{dataManager: object}} deps
 * @returns {() => void}
 */
export function initCameraInspector({ dataManager }) {
  const panel = document.getElementById('cctv-panel');
  const header = panel?.querySelector('.panel-header');
  if (!panel || !header || document.getElementById('cam-inspector')) return () => {};

  header.insertAdjacentHTML('afterend', inspectorMarkup());
  const title = header.querySelector('.panel-title');
  if (title) title.textContent = PANEL_TITLE;
  const $ = (id) => document.getElementById(id);

  const click = (id) => document.getElementById(id)?.click();
  $('cam-inspector-center').addEventListener('click', () => click('cctv-focus-btn'));
  $('cam-inspector-calibrate').addEventListener('click', () => click('cctv-adjust-btn'));
  $('cam-inspector-close').addEventListener('click', () => {
    panel.querySelector('.panel-collapse-btn')?.click();
  });
  $('cam-inspector-advanced').addEventListener('click', (event) => {
    const open = panel.classList.toggle('ee-advanced-open');
    event.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  $('cam-inspector-nearby').addEventListener('click', (event) => {
    const id = event.target.closest?.('[data-camera-id]')?.dataset.cameraId;
    if (id) dataManager.callLayerMethod('cctv', 'selectCamera', id);
  });

  let lastState = null;
  const results = $('cam-search-results');
  const searchInput = $('cam-search-input');

  function renderSearch() {
    const query = searchInput.value;
    const hits = searchCameras(query, lastState?.cameras);
    results.hidden = !query.trim();
    if (results.hidden) return results.replaceChildren();
    if (!hits.length) {
      const empty = el('li', 'cam-search-empty', lastState?.enabled
        ? 'Tidak ada kamera yang cocok.'
        : 'Nyalakan lapisan CCTV (atau pakai Cari manual) untuk mencari kamera.');
      return results.replaceChildren(empty);
    }
    results.replaceChildren(...hits.map((hit) => {
      const item = el('li');
      const button = el('button', 'cam-nearby-btn');
      button.type = 'button';
      button.dataset.cameraId = hit.id;
      const dot = el('span', 'shell-dot');
      dot.dataset.tone = hit.tone;
      button.append(dot, el('span', 'cam-nearby-name', hit.name), el('span', 'cam-nearby-dist', hit.city));
      item.append(button);
      return item;
    }));
  }
  searchInput.addEventListener('input', renderSearch);
  results.addEventListener('click', (event) => {
    const id = event.target.closest?.('[data-camera-id]')?.dataset.cameraId;
    if (!id) return;
    dataManager.callLayerMethod('cctv', 'selectCamera', id);
    searchInput.value = '';
    renderSearch();
  });

  function render(state) {
    lastState = state;
    if (searchInput.value) renderSearch();
    const camera = state?.enabled ? state.activeCamera : null;
    $('cam-inspector-empty').hidden = !!camera;
    $('cam-inspector-body').hidden = !camera;
    if (!camera) return;
    $('cam-inspector-name').textContent = camera.name || camera.id;
    $('cam-inspector-city').textContent = camera.city || '';

    $('cam-inspector-badges').replaceChildren(...inspectorBadges(camera).map((badge) => {
      const node = el('span', 'cam-badge', badge.label);
      node.dataset.tone = badge.tone;
      node.dataset.badge = badge.key;
      return node;
    }));

    const rows = [];
    for (const row of inspectorRows(camera)) {
      rows.push(el('dt', '', row.label), el('dd', '', row.value));
    }
    $('cam-inspector-rows').replaceChildren(...rows);

    $('cam-inspector-nearby').replaceChildren(...nearbyCameras(camera, state.cameras).map((near) => {
      const item = el('li');
      const button = el('button', 'cam-nearby-btn');
      button.type = 'button';
      button.dataset.cameraId = near.id;
      const dot = el('span', 'shell-dot');
      dot.dataset.tone = near.tone;
      button.append(dot, el('span', 'cam-nearby-name', near.name || near.id), el('span', 'cam-nearby-dist', near.distance));
      item.append(button);
      return item;
    }));

    const adjusting = !!state.calibrationMode;
    $('cam-inspector-calibrate').setAttribute('aria-pressed', adjusting ? 'true' : 'false');
    // Calibration needs its numeric readout, so ADJUST reveals the legacy controls.
    if (adjusting) panel.classList.add('ee-advanced-open');
  }

  const unsubscribe = dataManager.subscribeLayer('cctv', render);
  const initial = dataManager.getLayerUIState('cctv');
  if (initial) render(initial);

  return () => {
    unsubscribe?.();
    $('cam-inspector')?.remove();
    panel.classList.remove('ee-advanced-open');
  };
}
