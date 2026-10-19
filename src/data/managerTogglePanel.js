import { layerFeedState, FEED_STATE_LABELS } from './managerFeedState.js';

/** Lifecycle transition → user-visible (Indonesian) label; the state keys stay English. */
const LIFECYCLE_LABELS = Object.freeze({
  enabling: 'MENYALAKAN',
  disabling: 'MEMATIKAN',
});

/**
 * Prototype mixin for `DataLayerManager` (see `manager.js`): the toggle-panel
 * DOM rendering block (build/refresh/row-controls/button-state/formatting).
 * First use of the `Object.assign(Class.prototype, mixinObject)` pattern in
 * `manager.js` — the pattern itself is already proven 6× elsewhere in this
 * codebase (`StyleManager` in `ui.js` ×5, `cockpitControlMixin.js`).
 *
 * This is a mechanical method-body relocation, not a logic extraction: every
 * method here still reads/writes `this.*` (`this._toggleContainer`,
 * `this.layers`, `this.getAll()`, `this.setEnabled()`, etc.) exactly as it
 * did as a `DataLayerManager` method body; only the location moved. No call
 * site anywhere needed to change — `this.buildTogglePanel(...)` and friends
 * resolve identically via prototype dispatch.
 *
 * Explicitly NOT moved: the toggle/lifecycle-transition state machine
 * (`toggle`, `_enqueueToggle`, `_setLifecycleTransition`, `_settleLifecycle`,
 * `setEnabled`, `_setEnabledWithIntent`) — that's Wave 3 item #34 in the
 * split plan, CLAUDE.md's own documented highest-risk region (race-guarded
 * past-bug-class code backed by a 122KB `manager.test.mjs`), and stays put
 * pending its own dedicated discussion.
 */
export const managerTogglePanelMixin = {
  /**
   * Build the toggle panel UI inside the given container element.
   */
  buildTogglePanel(container) {
    this._toggleContainer = container;
    this._renderToggles();
  },

  _renderToggles() {
    if (!this._toggleContainer) return;
    this._toggleContainer.innerHTML = '';

    for (const layer of this.getAll()) {
      if (!layer.showInTogglePanel) continue;
      const row = document.createElement('div');
      row.className = 'data-toggle-row';
      row.dataset.layerId = layer.id;

      const topRow = document.createElement('div');
      topRow.className = 'data-toggle-top';

      const left = document.createElement('div');
      left.className = 'data-toggle-left';
      left.innerHTML = `<span class="data-icon">${layer.icon}</span><span class="data-name">${layer.name}</span>`;

      const right = document.createElement('div');
      right.className = 'data-toggle-right';

      const count = document.createElement('span');
      count.className = 'data-count';
      count.textContent = layer.stats.count ? this._formatCount(layer.stats.count) : '—';

      const toggle = document.createElement('button');
      toggle.className = `data-toggle-btn${layer.enabled ? ' active' : ''}`;
      this._syncToggleButton(toggle, layer);
      toggle.addEventListener('click', async () => {
        toggle.disabled = true;
        try {
          await this.setEnabled(layer.id, !this.isEnabled(layer.id), { origin: 'user' });
        } catch (error) {
          console.warn(`[Data] ${layer.id} toggle error:`, error);
        } finally {
          toggle.disabled = false;
        }
      });

      right.appendChild(count);
      right.appendChild(toggle);
      topRow.appendChild(left);
      topRow.appendChild(right);

      const bottomRow = document.createElement('div');
      bottomRow.className = 'data-toggle-meta';
      bottomRow.textContent = this._buildMetaText(layer);

      row.appendChild(topRow);
      row.appendChild(bottomRow);

      // Optional per-layer sub-controls (chips + color legend). The click
      // listener is delegated and attached once here, so it survives
      // _refreshTogglePanel — which only rewrites the container's contents.
      // Container presence is gated on registration-time staticMeta (never
      // force-resolves a not-yet-loaded lazy layer just to size the row);
      // the actual getRowControls() call stays module-resolved-gated in
      // _rowControlsFor below, since an unresolved layer has no controls to
      // show regardless.
      const rowEntry = this.layers.get(layer.id);
      if (rowEntry?.staticMeta?.hasRowControls) {
        // A layer whose controls settle asynchronously (a chunked catalog load
        // that can also fail) pushes a re-render through this; nothing else
        // would repaint the row before its next scheduled refresh.
        rowEntry.module?.setRowControlsListener?.(() => this._refreshTogglePanel());
        const controls = document.createElement('div');
        controls.className = 'data-toggle-controls';
        controls.addEventListener('click', (event) => {
          const button = event.target?.closest?.('.data-toggle-chip');
          if (!button || button.disabled) return;
          // Re-read the live descriptor rather than trusting the rendered
          // chip, so a stale row can never apply an inverted toggle.
          const chip = this._rowControlsFor(layer.id)?.chips
            ?.find((entry) => entry.id === button.dataset.chipId);
          if (chip?.params) this.setLayerParams(layer.id, chip.params, { origin: 'user' });
        });
        row.appendChild(controls);
        this._syncRowControls(controls, layer);
      }

      this._toggleContainer.appendChild(row);
    }
  },

  /**
   * Read a layer's optional row-control descriptor, tolerating a throw so one
   * misbehaving layer cannot blank the whole panel. Resolved from the registry
   * rather than the `getAll()` projection, which deliberately omits `module`.
   * @param {string} layerId Registered layer id.
   * @returns {{ chips?: Array<object>, legend?: Array<object> }|null} Descriptor.
   */
  _rowControlsFor(layerId) {
    const module = this.layers.get(layerId)?.module;
    if (typeof module?.getRowControls !== 'function') return null;
    try {
      return module.getRowControls() || null;
    } catch (error) {
      console.warn(`[Data] ${layerId} getRowControls error:`, error);
      return null;
    }
  },

  /**
   * Render a layer's row chips and color legend, and keep the whole block
   * hidden while the layer is off (or while a dependency owner has surrendered
   * it) so a quiet row stays quiet.
   *
   * Chip BUTTONS are reconciled in place, keyed by chip id, rather than
   * rebuilt: this runs on every panel refresh — including the one the chip's
   * own click triggers — and replacing the node would drop keyboard focus
   * mid-interaction. Legend entries hold no focus and no listeners, so they
   * are replaced freely.
   * @param {HTMLElement|null} container The row's `.data-toggle-controls` node.
   * @param {object} layer Registered layer entry.
   */
  _syncRowControls(container, layer) {
    if (!container) return;
    const controls = layer.enabled ? this._rowControlsFor(layer.id) : null;
    const chips = controls?.chips || [];
    const legend = controls?.legend || [];
    container.hidden = chips.length === 0 && legend.length === 0;

    for (const node of [...container.children]) {
      if (String(node.className).split(/\s+/).includes('data-toggle-legend-item')) node.remove();
    }

    const stale = new Map();
    for (const node of [...container.children]) {
      if (node.dataset?.chipId) stale.set(node.dataset.chipId, node);
    }

    for (const chip of chips) {
      let button = stale.get(chip.id);
      stale.delete(chip.id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.dataset.chipId = chip.id;
        container.appendChild(button);
      }
      const state = chip.state || (chip.active ? 'active' : 'idle');
      button.className = `data-toggle-chip chip-${state}${chip.active ? ' active' : ''}`;
      if (button.textContent !== chip.label) button.textContent = chip.label;
      button.title = chip.title || '';
      button.disabled = Boolean(chip.disabled);
      button.setAttribute('aria-pressed', chip.active ? 'true' : 'false');
      button.setAttribute('aria-busy', chip.busy ? 'true' : 'false');
    }
    for (const node of stale.values()) node.remove();

    for (const item of legend) {
      const entry = document.createElement('span');
      entry.className = 'data-toggle-legend-item';
      if (item.blurb) entry.title = item.blurb;
      const swatch = document.createElement('span');
      swatch.className = 'data-toggle-legend-swatch';
      swatch.style.background = item.color;
      const text = document.createElement('span');
      text.textContent = `${item.label} ${this._formatCount(item.count)}`;
      entry.append(swatch, text);
      container.appendChild(entry);
    }
  },

  _refreshTogglePanel() {
    if (!this._toggleContainer) return;
    // Skip DOM churn while hidden; visibilitychange (main.js) triggers one
    // refresh on return. (perf wave 2)
    if (typeof document !== 'undefined' && document.hidden) {
      this._panelRefreshPendingOnVisible = true;
      return;
    }
    for (const layer of this.getAll()) {
      const row = this._toggleContainer.querySelector(`[data-layer-id="${layer.id}"]`);
      if (!row) continue;

      const btn = row.querySelector('.data-toggle-btn');
      if (btn) {
        this._syncToggleButton(btn, layer);
      }

      const count = row.querySelector('.data-count');
      if (count) {
        count.textContent = layer.stats.count ? this._formatCount(layer.stats.count) : '—';
      }

      const meta = row.querySelector('.data-toggle-meta');
      if (meta) {
        meta.textContent = this._buildMetaText(layer);
      }

      this._syncRowControls(row.querySelector('.data-toggle-controls'), layer);
    }
  },

  _buildMetaText(layer) {
    const stats = layer.stats || {};
    const feedState = layerFeedState(stats);
    const stateLabel = FEED_STATE_LABELS[feedState];
    const source = stats.source || layer.source;
    const lifecycleState = layer.lifecycleState || (layer.enabled ? 'enabled' : 'disabled');
    if (lifecycleState === 'enabling' || lifecycleState === 'disabling') {
      return `${LIFECYCLE_LABELS[lifecycleState]} · ${source}`;
    }
    if (layer.lifecycleUncertain) {
      return `TIDAK PASTI · ${source} · status siklus perlu direkonsiliasi`;
    }
    const presentedError = stats.error || stats.lastError || stats.managerRefreshError;
    if (presentedError) {
      if (typeof stats.retryInSec === 'number' && stats.retryInSec > 0) {
        return `${stateLabel} · ${source} · ${presentedError} · coba lagi ${stats.retryInSec}d`;
      }
      return `${stateLabel} · ${source} · ${presentedError}`;
    }
    const ago = stats.lastUpdate ? this._timeAgo(stats.lastUpdate) : 'belum pernah';
    if (stats.loading) {
      const loadingLabel = typeof stats.loadingLabel === 'string' && stats.loadingLabel.trim()
        ? stats.loadingLabel.trim()
        : 'memuat...';
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
        ? ` · mencoba lagi dalam ${stats.retryInSec}d`
        : '';
      return `${stateLabel} · ${source} · ${ago}${retry}`;
    }
    if (typeof stats.loadingLabel === 'string' && stats.loadingLabel.trim()) {
      return `${source} · ${stats.loadingLabel.trim()}`;
    }
    return `${source} · ${ago}`;
  },

  _syncToggleButton(button, layer) {
    const feedState = layer.enabled ? layerFeedState(layer.stats) : 'off';
    const transitioning = layer.lifecycleState === 'enabling' || layer.lifecycleState === 'disabling';
    const uncertain = Boolean(layer.lifecycleUncertain);
    button.classList.toggle('active', layer.enabled);
    button.classList.toggle('transitioning', transitioning);
    button.classList.toggle('enabling', layer.lifecycleState === 'enabling');
    button.classList.toggle('disabling', layer.lifecycleState === 'disabling');
    button.classList.toggle('lifecycle-uncertain', uncertain);
    for (const state of Object.keys(FEED_STATE_LABELS)) {
      button.classList.toggle(`feed-${state}`, layer.enabled && !uncertain && feedState === state);
    }
    button.dataset.feedState = transitioning
      ? layer.lifecycleState
      : (uncertain ? 'uncertain' : feedState);
    button.disabled = transitioning;
    button.textContent = transitioning
      ? LIFECYCLE_LABELS[layer.lifecycleState]
      : (uncertain ? 'TIDAK PASTI' : (layer.enabled ? FEED_STATE_LABELS[feedState] : 'MATI'));
    button.setAttribute('aria-label', `${layer.name}: ${button.textContent}`);
  },

  _formatCount(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  },

  _timeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 5) return 'baru saja';
    if (diff < 60) return `${diff}d lalu`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
    return `${Math.floor(diff / 3600)}j lalu`;
  },
};
