// Decorates the existing Data Layers rows (rendered by DataLayerManager) with
// grouping and honest status. Never re-implements toggling or feed logic.
import {
  LAYER_GROUPS, layerLabel, layerOrder, layerShellStatus, summarizeSources,
} from './layerStatus.js';

/**
 * Decide what each row should show. Pure.
 * @param {Array<object>} layers `DataLayerManager.getAll()` rows.
 * @param {number} [now] Epoch ms.
 */
export function planRows(layers, now = Date.now()) {
  return layers
    .filter((layer) => layer.showInTogglePanel)
    .map((layer, index) => {
      const status = layerShellStatus(layer, now);
      const order = layerOrder(layer.id, index);
      return {
        id: layer.id,
        label: layerLabel(layer.id, layer.name),
        originalName: layer.name,
        statusKey: status.key,
        statusText: status.detail ? `${status.label} · ${status.detail}` : status.label,
        ...order,
      };
    });
}

/** @returns {number} Count of enabled layers. */
export function activeCount(layers) {
  return summarizeSources(layers).active;
}

function ensureHeading(container, group) {
  let heading = container.querySelector(`:scope > [data-group-heading="${group.id}"]`);
  if (!heading) {
    heading = document.createElement('div');
    heading.className = 'ee-layer-group';
    heading.dataset.groupHeading = group.id;
    heading.textContent = group.label;
    container.appendChild(heading);
  }
  return heading;
}

/**
 * Apply a plan to the rendered rows. Idempotent: a second call with the same
 * plan changes nothing, so it is safe from a MutationObserver.
 * @param {HTMLElement} container `#data-toggles`.
 * @param {ReturnType<typeof planRows>} plan
 */
export function applyRowPlan(container, plan) {
  for (const group of LAYER_GROUPS) {
    const heading = ensureHeading(container, group);
    const order = String(LAYER_GROUPS.indexOf(group) * 1000);
    if (heading.style.order !== order) heading.style.order = order;
  }
  for (const entry of plan) {
    const row = container.querySelector(`:scope > [data-layer-id="${entry.id}"]`);
    if (!row) continue;
    const order = String(entry.rowOrder);
    if (row.style.order !== order) row.style.order = order;
    // `.data-name` keeps its declared text (voice focus reads it); the visible
    // Indonesian label is a sibling and `.data-name` is visually hidden by CSS.
    const left = row.querySelector('.data-toggle-left');
    let label = left?.querySelector('.ee-layer-label');
    if (left && !label) {
      label = document.createElement('span');
      label.className = 'ee-layer-label';
      left.appendChild(label);
    }
    if (label && label.textContent !== entry.label) label.textContent = entry.label;
    let status = row.querySelector(':scope > .ee-layer-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'ee-layer-status';
      status.innerHTML = '<span class="shell-dot"></span><span class="ee-layer-status-text"></span>';
      row.insertBefore(status, row.querySelector('.data-toggle-meta'));
    }
    if (status.dataset.state !== entry.statusKey) status.dataset.state = entry.statusKey;
    const text = status.querySelector('.ee-layer-status-text');
    if (text.textContent !== entry.statusText) text.textContent = entry.statusText;
  }
}
