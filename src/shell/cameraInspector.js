// Camera search, placed under the camera screen in the existing CCTV panel.
// Results come from the CCTV layer's public state and picking one calls the
// layer's public selectCamera, so no CCTV behaviour is duplicated here.
import { searchCameras, statusTone } from './cameraInspectorModel.js';
import { inspectorMarkup } from './cameraInspectorMarkup.js';

const PANEL_TITLE = 'Kamera';
const HINT_LAYER_OFF = 'Nyalakan lapisan CCTV (atau pakai Cari manual) untuk mencari kamera.';
const HINT_NO_MATCH = 'Tidak ada kamera yang cocok.';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Mount the search into #cctv-panel. Returns a disposer.
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
  const results = $('cam-search-results');
  const searchInput = $('cam-search-input');

  $('cam-inspector-advanced').addEventListener('click', (event) => {
    const open = panel.classList.toggle('ee-advanced-open');
    event.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  let lastState = null;

  function renderSearch() {
    const query = searchInput.value;
    results.hidden = !query.trim();
    if (results.hidden) return results.replaceChildren();
    const hits = searchCameras(query, lastState?.cameras);
    if (!hits.length) {
      return results.replaceChildren(el('li', 'cam-search-empty', lastState?.enabled ? HINT_NO_MATCH : HINT_LAYER_OFF));
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
    // Calibration needs its numeric readout, so ADJUST reveals the legacy controls.
    if (state?.calibrationMode) panel.classList.add('ee-advanced-open');
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
