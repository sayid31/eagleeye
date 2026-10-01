// Moved out of gevActions.js (gevActionsLayers).



/**
 * Read one layer's authoritative visibility and lifecycle presentation state.
 * Falls back to stable enabled/disabled state for lightweight adapters that do
 * not expose the manager lifecycle API.
 * @param {object|null} dataManager Layer manager or lightweight adapter.
 * @param {string} layerId Registered layer identifier.
 * @param {object} [options] Fallback options.
 * @param {boolean} [options.fallbackEnabled=false] Observed state when no manager read is available.
 * @returns {{enabled:boolean,lifecycleState:string,lifecycleUncertain:boolean}} Lifecycle summary.
 */
export function readLayerLifecycleSummary(dataManager, layerId, { fallbackEnabled = false } = {}) {
  let lifecycle = null;
  try {
    lifecycle = dataManager?.getLayerLifecycleState?.(layerId) || null;
  } catch {
    lifecycle = null;
  }
  if (lifecycle) {
    const enabled = Boolean(lifecycle.enabled);
    return {
      enabled,
      lifecycleState: lifecycle.lifecycleState || (enabled ? 'enabled' : 'disabled'),
      lifecycleUncertain: Boolean(lifecycle.uncertain ?? lifecycle.lifecycleUncertain),
    };
  }

  let enabled = Boolean(fallbackEnabled);
  try {
    const managerEnabled = dataManager?.isEnabled?.(layerId);
    if (typeof managerEnabled === 'boolean') enabled = managerEnabled;
  } catch {
    // Retain the caller's observed fallback when the lightweight adapter fails.
  }
  return {
    enabled,
    lifecycleState: enabled ? 'enabled' : 'disabled',
    lifecycleUncertain: false,
  };
}

export function setPanelOpen(styleManager, panelId, open) {
  if (styleManager && typeof styleManager.setPanelCollapsed === 'function') {
    styleManager.setPanelCollapsed(panelId, !open, { explicit: true });
  } else {
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.toggle('collapsed', !open);
  }
}

export function focusDataLayerRow(layerId) {
  const row = document.querySelector(`#data-toggles [data-layer-id="${CSS.escape(layerId)}"]`);
  if (!row) return null;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  row.classList.remove('gev-voice-focus');
  void row.offsetWidth;
  row.classList.add('gev-voice-focus');
  window.setTimeout(() => row.classList.remove('gev-voice-focus'), 3000);
  const name = row.querySelector('.data-name')?.textContent?.trim() || layerId;
  return { id: layerId, name };
}
