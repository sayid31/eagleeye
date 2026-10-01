// StyleManager panel chrome: command dock, auto-hover, drag and right-rail layout.
import { COCKPIT_LAYOUT_SETTLE_MS } from './uiConstants.js';
import { PANEL_POSITION_STORAGE_VERSION } from './panelPositionConstants.js';

export const panelChromeMixin = {
/**
   * On window resize, keep the draggable panel on-screen — a panel positioned near an edge can fall
   * outside a now-smaller viewport (audit U2). pp-toggles is right-pinned, so re-pin (horizontal) and
   * clamp its top. No-op until the panel has been positioned (explicit inline top).
   * @returns {void}
   */
  _reclampDraggablePanels() {
    const el = this._ppToggles;
    if (!el || !el.style.top || el.style.top === 'auto') return;
    const top = parseInt(el.style.top, 10);
    if (!Number.isFinite(top)) return;
    el.style.top = `${this._clampToViewport(0, top, el).top}px`;
    this._pinPanelToRight(el);
  },

/**
   * Keeps both responsive panel lanes and Cockpit's utility strip on the same
   * measured layout commit. HUD visibility transitions can outlive the first
   * animation frame, so variant changes receive one bounded settling pass.
   * @param {{settle?: boolean}} [options] Whether to remeasure after transitions.
   * @returns {void}
   */
  _scheduleAdaptivePanelLayout({ settle = false } = {}) {
    this._scheduleLeftPanelLayout({ reconsiderAutoCollapse: true });
    this._scheduleRightPanelLayout({ reconsiderAutoCollapse: true });
    this.cockpitView?.scheduleContextLayout();
    if (!settle) return;
    clearTimeout(this._adaptivePanelSettleTimer);
    this._adaptivePanelSettleTimer = setTimeout(() => {
      this._adaptivePanelSettleTimer = null;
      this._scheduleLeftPanelLayout({ reconsiderAutoCollapse: true });
      this._scheduleRightPanelLayout({ reconsiderAutoCollapse: true });
      this.cockpitView?.scheduleContextLayout();
    }, COCKPIT_LAYOUT_SETTLE_MS);
  },

/**
   * Initializes panel collapse buttons and restores persisted collapsed state.
   * Also sets up hover-expand behavior for the style presets and location bar panels.
   * @returns {void}
   */
  _initPanelChrome() {
    const targets = new Set();
    document.querySelectorAll('.panel-collapse-btn[data-collapse-target]').forEach((btn) => {
      const targetId = btn.dataset.collapseTarget;
      if (targetId) targets.add(targetId);
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.collapseTarget;
        if (!targetId) return;
        const nextCollapsed = !document.getElementById(targetId)?.classList.contains('collapsed');
        this.setPanelCollapsed(targetId, nextCollapsed, { explicit: true });
      });
    });

    for (const targetId of targets) {
      this._restorePanelCollapsedState(targetId, {
        allowStored: !this._initialShareState,
      });
    }
    // The command dock always starts compact; either wing reveals on hover,
    // focus, or click and collapses again after the interaction moves away.
    this.setPanelCollapsed('control-panel', true, { syncShare: false, persist: false });
    this.setPanelCollapsed('location-bar', true, { syncShare: false, persist: false });
    this._initAutoHoverPanel('control-panel', { openDelayMs: 140, closeDelayMs: 420 });
    this._initAutoHoverPanel('location-bar', { openDelayMs: 140, closeDelayMs: 420 });
    this._initCommandDockPins();
    this._initCommandDockTrayMetrics();
    this._maybeNotifyLayoutReset();
  },

/**
   * Allows either command-dock tray to remain open until explicitly unpinned.
   * Both trays may be pinned; transient and error trays stack above them.
   * @returns {void}
   */
  _initCommandDockPins() {
    document.querySelectorAll('.dock-pin-btn[data-pin-target]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const panelId = button.dataset.pinTarget;
        this._setCommandDockPanelPinState(panelId);
      });
    });
  },

_setCommandDockPanelPinState(panelId, pin, {
    restore = false,
    persist = true,
    syncShare = true,
  } = {}) {
    const panelEl = document.getElementById(panelId);
    const button = document.querySelector(`.dock-pin-btn[data-pin-target="${panelId}"]`);
    if (!panelEl || !button) return undefined;
    const shouldPin = typeof pin === 'boolean'
      ? pin
      : !panelEl.classList.contains('dock-pinned');
    panelEl.classList.toggle('dock-pinned', shouldPin);
    button.setAttribute('aria-pressed', String(shouldPin));
    document.querySelectorAll('#command-dock .dock-pinned-top').forEach((pinnedPanel) => {
      pinnedPanel.classList.remove('dock-pinned-top');
    });
    if (shouldPin) {
      panelEl.classList.add('dock-pinned-top');
      this.setPanelCollapsed(panelId, false, {
        explicit: !restore,
        restore,
        persist,
        syncShare: false,
      });
    } else {
      const remainingPinnedPanel = document.querySelector('#command-dock .dock-pinned');
      remainingPinnedPanel?.classList.add('dock-pinned-top');
      if (!restore && !panelEl.matches(':hover')) {
        this.setPanelCollapsed(panelId, true, {
          explicit: true,
          persist,
          syncShare: false,
        });
      }
    }
    this._updateCommandDockTrayStack();
    if (syncShare) {
      if (!restore) this.shareLinkManager?.claimRestoreLane?.('panel', panelId);
      this.shareLinkManager?.onPanelStateChange?.();
    }
    return shouldPin;
  },

/**
   * Tracks the live pinned-tray height so a hovered sibling can stack above it
   * without hardcoded content dimensions.
   * @returns {void}
   */
  _initCommandDockTrayMetrics() {
    const dock = document.getElementById('command-dock');
    if (!dock) return;
    this._commandDockTrayObserver?.disconnect?.();
    if (typeof ResizeObserver === 'function') {
      this._commandDockTrayObserver = new ResizeObserver(() => this._updateCommandDockTrayStack());
      dock.querySelectorAll('.dock-popover-content').forEach((tray) => {
        this._commandDockTrayObserver.observe(tray);
      });
    }
    this._updateCommandDockTrayStack();
  },

/**
   * Writes each pinned tray height and their combined stack height as CSS
   * variables. The most recently pinned tray forms the upper level.
   * @returns {void}
   */
  _updateCommandDockTrayStack() {
    const dock = document.getElementById('command-dock');
    if (!dock) return;
    const locationPanel = dock.querySelector('#location-bar.dock-pinned:not(.collapsed)');
    const presetsPanel = dock.querySelector('#control-panel.dock-pinned:not(.collapsed)');
    const locationHeight = locationPanel?.querySelector('.dock-popover-content')?.getBoundingClientRect().height || 0;
    const presetsHeight = presetsPanel?.querySelector('.dock-popover-content')?.getBoundingClientRect().height || 0;
    const pinnedCount = Number(locationHeight > 0) + Number(presetsHeight > 0);
    const locationHeightPx = Math.ceil(locationHeight);
    const presetsHeightPx = Math.ceil(presetsHeight);
    const topPinnedPanel = dock.querySelector('.dock-pinned-top.dock-pinned:not(.collapsed)');
    const lowerPinnedPanel = topPinnedPanel?.id === 'location-bar' ? presetsPanel : locationPanel;
    const lowerPinnedHeight = lowerPinnedPanel
      ?.querySelector('.dock-popover-content')
      ?.getBoundingClientRect().height || 0;
    const stackHeight = pinnedCount > 1
      ? `calc(${locationHeightPx}px + ${presetsHeightPx}px + 1.2rem)`
      : `${locationHeightPx + presetsHeightPx}px`;
    dock.style.setProperty('--dock-location-pinned-height', `${locationHeightPx}px`);
    dock.style.setProperty('--dock-presets-pinned-height', `${presetsHeightPx}px`);
    dock.style.setProperty('--dock-lower-pinned-height', `${Math.ceil(lowerPinnedHeight)}px`);
    dock.style.setProperty('--dock-pinned-stack-height', stackHeight);
    dock.classList.toggle('dock-has-pinned-tray', pinnedCount > 0);
    dock.classList.toggle('dock-has-two-pinned-trays', pinnedCount > 1);
  },

/**
   * One-time toast when stored v6 panel positions are superseded by the v7
   * layout defaults (positions reset; collapsed states are preserved).
   * @returns {void}
   */
  _maybeNotifyLayoutReset() {
    try {
      const marker = `gev:layout-reset-notified:${PANEL_POSITION_STORAGE_VERSION}`;
      if (localStorage.getItem(marker)) return;
      localStorage.setItem(marker, '1');
      const hadOldPositions = Object.keys(localStorage)
        .some((key) => key.startsWith('gev:panel-pos:v6:'));
      if (hadOldPositions) {
        this._showToast('Panel layout updated — positions reset to new defaults');
      }
    } catch {
      // storage unavailable
    }
  },

/**
   * Configures intentional hover-expand / leave-collapse behavior on a panel.
   * Uses separate open/close timers to prevent accidental flicker from fast
   * mouse passes. Wheel events cancel pending opens to avoid surprise expansion
   * during scroll-through.
   * @param {string} panelId - DOM id of the panel element.
   * @param {object} [options]
   * @param {number} [options.openDelayMs=850] - Hover dwell time before auto-expanding.
   * @param {number} [options.closeDelayMs=1000] - Delay after pointer leaves before collapsing.
   * @returns {void}
   */
  _initAutoHoverPanel(panelId, { openDelayMs = 850, closeDelayMs = 1000 } = {}) {
    const panelEl = document.getElementById(panelId);
    if (!panelEl) return;
    const disclosure = panelEl.querySelector(`[data-dock-toggle-target="${panelId}"]`);
    let openTimer = null;
    let closeTimer = null;
    let lastWheelTime = 0;
    let disclosureFocusTimer = null;

    const clearOpen = () => {
      if (!openTimer) return;
      clearTimeout(openTimer);
      openTimer = null;
    };

    const clearClose = () => {
      if (!closeTimer) return;
      clearTimeout(closeTimer);
      closeTimer = null;
    };

    const scheduleOpen = () => {
      clearOpen();
      openTimer = window.setTimeout(() => {
        openTimer = null;
        if (!panelEl.matches(':hover')) return;
        if (performance.now() - lastWheelTime < 280) return;
        if (!panelEl.classList.contains('collapsed')) return;
        this.setPanelCollapsed(panelId, false);
      }, openDelayMs);
    };

    // Focus inside the tray defers the unpinned auto-dismiss, but only for the
    // KEYBOARD: the disclosure hands focus to a Map Source tile on Enter/Space,
    // and closing the tray out from under that focus would strand the caret.
    // Plain `document.activeElement` is the wrong test — Chromium focuses a
    // <button> on mouse press, so once Map Source moved into this tray a tile
    // CLICK left focus parked inside and the popover never dismissed on
    // mouse-away (owner field report; Location, whose input is genuinely
    // keyboard-focused when clicked, still dismissed). `:focus-visible` is the
    // platform's own pointer-vs-keyboard focus signal, so a typed-into field
    // still holds the tray open while a clicked tile does not. A browser
    // without `:focus-visible` keeps the conservative hold.
    const keyboardFocusInside = () => {
      const active = document.activeElement;
      if (!active || !panelEl.contains(active)) return false;
      try { return active.matches(':focus-visible'); } catch { return true; }
    };

    const scheduleClose = () => {
      clearClose();
      closeTimer = window.setTimeout(() => {
        closeTimer = null;
        if (panelEl.matches(':hover') || keyboardFocusInside()) return;
        if (panelEl.classList.contains('dock-pinned')) return;
        if (panelEl.classList.contains('collapsed')) return;
        this.setPanelCollapsed(panelId, true);
      }, closeDelayMs);
    };

    panelEl.addEventListener('wheel', () => {
      lastWheelTime = performance.now();
      clearOpen();
    }, { passive: true });

    panelEl.addEventListener('click', (event) => {
      if (event.target.closest('.panel-collapse-btn, .dock-tray-toggle')) return;
      clearOpen();
      clearClose();
      if (panelEl.classList.contains('collapsed')) {
        this.setPanelCollapsed(panelId, false, { explicit: true });
      }
    });

    panelEl.addEventListener('pointerenter', (event) => {
      const pointerType = event.pointerType || 'mouse';
      if (pointerType !== 'mouse' && pointerType !== 'pen') return;
      clearClose();
      if (panelEl.classList.contains('collapsed')) {
        scheduleOpen();
      }
    });

    panelEl.addEventListener('pointerleave', (event) => {
      const pointerType = event.pointerType || 'mouse';
      if (pointerType !== 'mouse' && pointerType !== 'pen') return;
      clearOpen();
      scheduleClose();
    });

    panelEl.addEventListener('pointerdown', () => {
      clearOpen();
      clearClose();
    });

    const focusMapSource = () => {
      if (panelId !== 'control-panel') return;
      panelEl.querySelector('.map-stack-chip.active, .map-stack-chip')?.focus?.({ preventScroll: true });
    };

    const scheduleMapSourceFocus = () => {
      clearTimeout(disclosureFocusTimer);
      disclosureFocusTimer = window.setTimeout(() => {
        disclosureFocusTimer = null;
        if (!panelEl.classList.contains('collapsed')) focusMapSource();
      }, 240);
    };

    const toggleDisclosure = ({ focusSource = false } = {}) => {
      clearOpen();
      clearClose();
      const shouldOpen = panelEl.classList.contains('collapsed');
      this.setPanelCollapsed(panelId, !shouldOpen, { explicit: true });
      if (shouldOpen && focusSource) scheduleMapSourceFocus();
    };

    disclosure?.addEventListener('click', (event) => {
      event.stopPropagation();
      // Keep native button activation semantics: Enter activates on keydown,
      // Space on keyup, and pointer clicks report a non-zero detail. Scheduling
      // focus from the synthesized click avoids a key latch that can outlive the
      // disclosure after a long Enter hold moves focus into the tray.
      toggleDisclosure({ focusSource: event.detail === 0 });
    });
    disclosure?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // The application-level Space shortcut must not steal activation from a
      // focused disclosure. One non-repeating keydown is enough; no keyup latch
      // is retained after focus moves into the tray.
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      toggleDisclosure({ focusSource: true });
    });

    panelEl.addEventListener('focusin', () => clearClose());
    panelEl.addEventListener('focusout', (event) => {
      if (panelEl.contains(event.relatedTarget)) return;
      scheduleClose();
    });
    panelEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || panelEl.classList.contains('collapsed')) return;
      event.preventDefault();
      clearOpen();
      clearClose();
      this.setPanelCollapsed(panelId, true, { explicit: true });
      disclosure?.focus?.({ preventScroll: true });
    });
  },

/**
   * Sets up drag-to-reposition for legacy floating controls. The right rail
   * and left accordion remain fixed so their HUD alignment is deterministic.
   * @returns {void}
   */
  _initPanelDrag() {
    const dragSpecs = [
      {
        id: 'pp-toggles',
        panel: this._ppToggles,
        handle: this._ppToggles?.querySelector('.panel-drag-handle.compact'),
      },
    ].filter(Boolean);

    for (const spec of dragSpecs) {
      if (!spec.panel || !spec.handle) continue;
      this._restorePanelPosition(spec.id, spec.panel);
      this._makePanelDraggable(spec.id, spec.panel, spec.handle);
    }
    // Keep a positioned panel on-screen when its HEIGHT changes after restore — it expands to its
    // full row set a frame or two later, so the restore-time clamp used a stale (shorter) height and
    // the panel could still hang off the bottom (audit U2). Re-clamp on every size change.
    if (this._ppToggles && typeof ResizeObserver !== 'undefined') {
      this._draggableResizeObserver = new ResizeObserver(() => this._reclampDraggablePanels());
      this._draggableResizeObserver.observe(this._ppToggles);
    }
  },

/**
   * Positions the parameter slider panel directly below the right-rail toggle
   * panel, right-aligned to it. Clamps to viewport bounds to prevent overflow.
   * Runs inside a rAF to batch with other layout reads.
   * @returns {void}
   */
  _layoutRightPanels() {
    this._scheduleRightPanelLayout();
  },

/**
   * Recalculates the CCTV panel max-height based on its current top position
   * and the window height, enabling internal scroll without viewport overflow.
   *
   * Deliberately left in ui.js rather than moved into panelAdaptiveLayoutMixin.js
   * or a future cctvPanelMixin.js: it's called from both groups plus the
   * constructor, with no single natural owner between them.
   * @returns {void}
   */
  _syncCctvPanelViewport() {
    if (!this._cctvPanel) return;
    const inner = this._cctvPanel.querySelector('.cctv-panel-inner');
    requestAnimationFrame(() => {
      if (this._cctvPanel.parentElement?.id === 'right-context-rail') {
        this._cctvPanel.style.maxHeight = '';
        if (inner) inner.style.maxHeight = '';
        this._scheduleRightPanelLayout();
        return;
      }
      const rect = this._cctvPanel.getBoundingClientRect();
      const availableHeight = Math.max(190, Math.floor(window.innerHeight - rect.top - 12));
      this._cctvPanel.style.maxHeight = `${availableHeight}px`;
      if (inner) {
        inner.style.maxHeight = `${availableHeight}px`;
      }
    });
  },
};

