import {
  allocatePanelStackHeights,
  panelStackAutoCollapseIndices,
  resolveLeftStackBottomBoundary,
  resolvePanelStackCorridor,
} from './panelStackLayout.js';
import { shouldHideCollapsedRightPanels } from './rightRailPolicy.js';
import { resolveHudRailLayout } from './cockpitMath.js';
import { PANEL_POSITION_STORAGE_VERSION, PANEL_Z_BASE, PANEL_Z_MAX } from './panelPositionConstants.js';

/** Versioned localStorage namespace prefix to invalidate stale panel layouts. */
const PANEL_LAYOUT_STORAGE_VERSION = 'v6';
const SHARE_PANEL_STATE_SPECS = Object.freeze([
  { id: 'control-panel', pinnable: true },
  { id: 'location-bar', pinnable: true },
  { id: 'data-panel' },
  { id: 'cctv-panel' },
  { id: 'radio-panel' },
  { id: 'scene-panel' },
  { id: 'global-context-panel' },
  { id: 'pp-toggles' },
  { id: 'param-slider-panel' },
]);
/**
 * Fixed UI regions that can occupy the left accordion's vertical lane.
 * Rectangles are filtered at runtime for visibility and horizontal overlap,
 * so right-side/center controls do not reduce the lane unless they actually
 * intersect it at the current viewport size.
 */
const LEFT_STACK_OBSTACLE_SELECTOR = [
  '#cockpit-hud .cockpit-topline',
  '#cockpit-hud .cockpit-topline > div',
  '#title-bar',
  '#style-indicator',
  '#top-center-actions',
  '#traffic-sync-chip',
  '#cctv-sync-chip',
  '#intel-hud .hud-top-left',
  '#intel-hud .hud-top-right',
  '#intel-hud .hud-bottom-left',
  '#intel-hud .hud-bottom-right',
  '#intel-hud .hud-top-bar',
  '#intel-hud .hud-bottom-bar',
  '#intel-hud .hud-left-edge',
  '#intel-hud .hud-right-edge',
  '#cockpit-context',
  '#cesium-credits .cesium-credit-logoContainer',
  '#cesium-credits .cesium-credit-textContainer',
  '#location-bar',
  '#control-panel',
  '#gev-voice-control',
  '#pp-toggles',
  '#param-slider-panel',
].join(', ');
/**
 * Fixed UI regions that can occupy the right control lane. Runtime rectangle
 * filtering keeps the rail clear of whichever HUD variant is currently
 * visible without tying the layout to one screen height.
 */
const RIGHT_STACK_OBSTACLE_SELECTOR = [
  '#cockpit-hud .cockpit-topline',
  '#cockpit-hud .cockpit-topline > div',
  '#title-bar',
  '#style-indicator',
  '#top-center-actions',
  '#traffic-sync-chip',
  '#cctv-sync-chip',
  '#intel-hud .hud-top-left',
  '#intel-hud .hud-top-right',
  '#intel-hud .hud-bottom-left',
  '#intel-hud .hud-bottom-right',
  '#intel-hud .hud-top-bar',
  '#intel-hud .hud-bottom-bar',
  '#intel-hud .hud-left-edge',
  '#intel-hud .hud-right-edge',
  '#cockpit-context',
  '#cockpit-signal-stream',
  '#cesium-credits .cesium-credit-logoContainer',
  '#cesium-credits .cesium-credit-textContainer',
  '#command-dock',
  '#gev-voice-control',
].join(', ');

/**
 * Prototype mixin for StyleManager (see `ui.js`): adaptive panel layout,
 * drag/position persistence, and collapse-state plumbing for the left/right
 * panel stacks, plus the generic panel-collapse and share-state entry points
 * (`setPanelCollapsed`, `_buildSharePanelState`, `_restorePanelState`) that
 * every other panel group calls into.
 *
 * Every method here still runs with `this` bound to the live StyleManager
 * instance, reading the same constructor-initialized fields ui.js declares
 * (`_leftPanelStack`, `_rightPanelStack`, `_panelZCounter`, etc.) and calling
 * sibling methods defined elsewhere on the prototype (e.g. `_syncCctvPanelViewport`,
 * `_layoutRightPanels`, `_updateCommandDockTrayStack`) via ordinary `this.foo()`
 * calls — file location does not affect `this` binding or method dispatch.
 *
 * This is a mechanical method-body relocation to shrink `ui.js`, not a logic
 * extraction: unlike the repo's usual "pure policy function" modules
 * (`panelStackLayout.js`, `rightRailPolicy.js`, `contextModePolicy.js`, ...),
 * this file's exported object is `Object.assign`ed directly onto
 * `StyleManager.prototype` in `ui.js`. `StyleManager` remains ONE class; this
 * is just where a third of its methods happen to be typed out. Please don't
 * "fix" this into a delegate/composed object — the whole point is that no
 * call site anywhere in `ui.js` needed to change.
 */
export const panelAdaptiveLayoutMixin = {
  /**
   * Returns the versioned localStorage key for a panel's saved position.
   * @param {string} panelId - DOM id of the panel.
   * @returns {string} localStorage key.
   */
  _panelStorageKey(panelId) {
    return `gev:panel-pos:${PANEL_POSITION_STORAGE_VERSION}:${panelId}`;
  },

  /**
   * Returns the versioned localStorage key for a panel's collapsed state.
   * @param {string} panelId - DOM id of the panel.
   * @returns {string} localStorage key.
   */
  _panelCollapseStorageKey(panelId) {
    return `gev:panel-collapsed:${PANEL_LAYOUT_STORAGE_VERSION}:${panelId}`;
  },

  /**
   * Restores a panel's collapsed/expanded state from localStorage.
   * Falls back to the CSS class default if no saved state exists.
   * @param {string} panelId - DOM id of the panel.
   * @returns {void}
   */
  _restorePanelCollapsedState(panelId, { allowStored = true } = {}) {
    const panelEl = document.getElementById(panelId);
    if (!panelEl) return;
    let collapsed = panelEl.classList.contains('collapsed');
    let stored = null;
    if (allowStored) {
      try {
        stored = localStorage.getItem(this._panelCollapseStorageKey(panelId));
        if (stored === '1') collapsed = true;
        if (stored === '0') collapsed = false;
      } catch {
        // storage unavailable
      }
    }
    // DISPLAY starts COLLAPSED for a first-time visitor, then respects the
    // user's persisted choice like every other panel.
    //
    // It used to start expanded, to advertise the HUD / DETECT / 3D toggles.
    // That reason expired when those became ON by default: the rail now opens
    // to offer controls for things already happening, while competing with the
    // first-run mission card for the one first impression there is. A stored
    // choice still wins in both directions, so anyone who opens it keeps it.
    if (panelId === 'pp-toggles' && stored === null) collapsed = true;
    panelEl.classList.toggle('collapsed', collapsed);
    this._syncPanelCollapseButton(panelEl);
  },

  /**
   * Persists a panel's collapsed state ('1' or '0') to localStorage.
   * @param {string} panelId - DOM id of the panel.
   * @param {boolean} collapsed - Whether the panel is collapsed.
   * @returns {void}
   */
  _savePanelCollapsedState(panelId, collapsed) {
    try {
      localStorage.setItem(this._panelCollapseStorageKey(panelId), collapsed ? '1' : '0');
    } catch {
      // storage unavailable
    }
  },

  /**
   * Builds one fixed right-side rail from Display, CCTV, its parameter
   * controls, and Global Context (which owns the nested Radio companion).
   * The rail then measures the live HUD chrome at runtime so it can stay
   * aligned and within the available vertical corridor.
   * @returns {void}
   */
  _initRightPanelAdaptiveLayout() {
    const stack = this._rightPanelStack;
    if (!stack || !this._ppToggles) return;

    this._ppToggles.style.removeProperty('top');
    this._ppToggles.style.removeProperty('right');
    this._ppToggles.style.removeProperty('bottom');
    this._ppToggles.style.removeProperty('left');
    this._ppToggles.style.removeProperty('z-index');
    this._ppToggles.classList.remove('panel-draggable', 'panel-dragging');
    this._ppToggles.querySelector('.pp-header-row')?.removeAttribute('title');
    stack.prepend(this._ppToggles);
    const globalContextPanel = document.getElementById('global-context-panel');
    if (this._cctvPanel) {
      this._cctvPanel.style.removeProperty('top');
      this._cctvPanel.style.removeProperty('right');
      this._cctvPanel.style.removeProperty('bottom');
      this._cctvPanel.style.removeProperty('left');
      this._cctvPanel.style.removeProperty('z-index');
      this._cctvPanel.classList.remove('panel-draggable', 'panel-dragging');
      stack.insertBefore(this._cctvPanel, globalContextPanel);
      this._syncPanelCollapseButton(this._cctvPanel);
    }
    if (this._sliderPanel) {
      this._sliderPanel.style.removeProperty('top');
      this._sliderPanel.style.removeProperty('right');
      this._sliderPanel.style.removeProperty('bottom');
      this._sliderPanel.style.removeProperty('left');
      this._sliderPanel.style.removeProperty('max-height');
      const detectionGroup = this._detectionBtn?.closest('.pp-toggle-group');
      if (detectionGroup) detectionGroup.after(this._sliderPanel);
      else this._ppToggles.append(this._sliderPanel);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this._rightStackResizeObserver = new ResizeObserver(() => {
        this._scheduleRightPanelLayout();
      });
      this._rightStackResizeObserver.observe(stack);
      for (const panel of [this._ppToggles, this._cctvPanel, globalContextPanel]) {
        if (panel) this._rightStackResizeObserver.observe(panel);
      }
      document.querySelectorAll(RIGHT_STACK_OBSTACLE_SELECTOR).forEach((element) => {
        this._rightStackResizeObserver.observe(element);
      });
    }

    if (typeof MutationObserver !== 'undefined') {
      this._rightStackMutationObserver = new MutationObserver(() => {
        this._scheduleRightPanelLayout();
      });
      this._rightStackMutationObserver.observe(stack, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'hidden', 'data-variant'],
      });
      const hud = document.getElementById('intel-hud');
      if (hud) {
        this._rightStackMutationObserver.observe(hud, {
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'hidden', 'data-variant'],
        });
      }
    }

    const transitionHud = document.getElementById('intel-hud');
    if (transitionHud) {
      this._rightStackHudTransitionHandler = (event) => {
        if (event.propertyName === 'opacity' || event.propertyName === 'visibility') {
          this._scheduleRightPanelLayout({ reconsiderAutoCollapse: true });
        }
      };
      transitionHud.addEventListener('transitionend', this._rightStackHudTransitionHandler);
    }

    this._scheduleRightPanelLayout();
  },

  _scheduleRightPanelLayout({ reconsiderAutoCollapse = false } = {}) {
    if (reconsiderAutoCollapse) this._rightStackReconsiderAutoCollapse = true;
    if (!this._rightPanelStack || this._rightStackLayoutFrame !== null) return;
    this._rightStackLayoutFrame = requestAnimationFrame(() => {
      this._rightStackLayoutFrame = null;
      if (this._rightStackReconsiderAutoCollapse) {
        this._rightStackReconsiderAutoCollapse = false;
        for (const panel of this._rightPanelStack.querySelectorAll('.layout-auto-collapsed')) {
          panel.classList.remove('collapsed', 'layout-auto-collapsed');
          this._syncPanelCollapseButton(panel);
        }
      }
      this._syncRightPanelAdaptiveLayout();
    });
  },

  /**
   * Places the right rail inside the visible HUD-safe corridor. When the
   * corridor is too short, the expanded panel receives the remaining height
   * with internal scrolling. Tactical HUD hides collapsed sibling launchers
   * while a panel is expanded; other HUD layouts keep them visible.
   * @returns {void}
   */
  _syncRightPanelAdaptiveLayout() {
    const stack = this._rightPanelStack;
    if (!stack) return;

    const panels = [...stack.children].filter((panel) => panel.matches('[data-panel-id]'));
    if (!this.hud.visible || this.hud.getVariant() !== 'tactical') {
      for (const panel of panels.filter((item) => item.classList.contains('layout-auto-collapsed'))) {
        panel.classList.remove('collapsed', 'layout-auto-collapsed');
        this._syncPanelCollapseButton(panel);
      }
    }
    const isMobile = window.matchMedia('(max-width: 720px)').matches;
    const hasExpandedPanel = panels.some((panel) => (
      !panel.classList.contains('collapsed') && (!isMobile || panel.id !== 'pp-toggles')
    ));
    const exclusive = shouldHideCollapsedRightPanels({
      hudVariant: this.hud.getVariant(),
      hasExpandedPanel,
    });
    stack.classList.toggle('layout-exclusive', exclusive);
    for (const panel of panels) {
      if (exclusive && panel.classList.contains('collapsed')) panel.setAttribute('aria-hidden', 'true');
      else panel.removeAttribute('aria-hidden');
    }

    if (isMobile) {
      stack.classList.remove('layout-focus');
      stack.style.removeProperty('--right-stack-safe-top');
      stack.style.removeProperty('--right-stack-max-height');
      for (const panel of panels) panel.style.removeProperty('--right-panel-allocated-height');
      stack.dataset.layoutMode = 'mobile';
      return;
    }

    const viewportHeight = Math.max(1, window.innerHeight);
    const safeGap = Math.max(8, viewportHeight * 0.012);
    const stackRect = stack.getBoundingClientRect();
    const leftStackTop = this._leftPanelStack?.getBoundingClientRect().top;
    const alignedTop = Number.isFinite(leftStackTop)
      ? leftStackTop
      : viewportHeight * 0.26;
    const obstacleRects = [];

    for (const obstacle of document.querySelectorAll(RIGHT_STACK_OBSTACLE_SELECTOR)) {
      if (stack.contains(obstacle)) continue;
      let hiddenByAncestor = false;
      for (let element = obstacle; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          hiddenByAncestor = true;
          break;
        }
      }
      if (hiddenByAncestor) continue;
      const rect = obstacle.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      obstacleRects.push({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      });
    }

    const visiblePanels = panels.filter((panel) => (
      !exclusive || !panel.classList.contains('collapsed')
    ));
    const displayScrollTop = this._displayPortalScrollRestoreOwner === 'standard'
      ? this._standardDisplayScrollTop
      : (this._ppToggles?.scrollTop || 0);
    // Measure intrinsic content, not the allocation written by the previous
    // layout pass. Display is the exception: its own scrollHeight already
    // exposes every control, and removing its live allocation can reset the
    // user's scroll position while HUD or preset content is settling.
    for (const panel of visiblePanels) {
      if (!panel.classList.contains('collapsed') && panel !== this._ppToggles) {
        panel.style.removeProperty('--right-panel-allocated-height');
      }
    }
    const gap = parseFloat(getComputedStyle(stack).rowGap) || 0;
    const naturalHeight = visiblePanels.reduce((total, panel) => (
      total + Math.max(
        panel.getBoundingClientRect().height,
        panel.scrollHeight || 0,
        panel.classList.contains('collapsed') ? 42 : 0,
      )
    ), 0) + gap * Math.max(0, visiblePanels.length - 1);
    const layout = resolveHudRailLayout({
      viewportHeight,
      panelHeight: naturalHeight,
      laneLeft: stackRect.left,
      laneRight: stackRect.right,
      obstacles: obstacleRects,
      baseTop: alignedTop,
      baseBottom: viewportHeight * 0.96,
      gap: safeGap,
      align: 'start',
    });
    if (!layout) return;
    const { safeTop, safeBottom, maxHeight: availableHeight } = layout;
    const stabilityBand = viewportHeight * 0.01;
    const wasFocused = stack.classList.contains('layout-focus');
    const shouldFocus = wasFocused
      ? naturalHeight > availableHeight - stabilityBand * 2
      : naturalHeight > availableHeight - stabilityBand;
    const layoutTop = shouldFocus ? safeTop : layout.top;
    const collapsedHeight = visiblePanels.reduce((total, panel) => (
      panel.classList.contains('collapsed')
        ? total + panel.getBoundingClientRect().height
        : total
    ), 0);
    const expandedPanelsInDomOrder = visiblePanels.filter((panel) => !panel.classList.contains('collapsed'));
    const focusedExpandedPanel = expandedPanelsInDomOrder.find((panel) => panel.contains(document.activeElement));
    const preferredExpandedPanel = expandedPanelsInDomOrder.find(
      (panel) => panel.id === this._rightStackPreferredPanelId,
    ) || focusedExpandedPanel;
    // Match the left lane: allocation order follows the latest explicit
    // disclosure, not DOM order. A focused panel is the fallback owner so
    // temporary presentation collapse never strands keyboard focus.
    const expandedPanels = preferredExpandedPanel
      ? [preferredExpandedPanel, ...expandedPanelsInDomOrder.filter((panel) => panel !== preferredExpandedPanel)]
      : expandedPanelsInDomOrder;
    const expandedAvailableHeight = Math.max(
      0,
      safeBottom - layoutTop - collapsedHeight - gap * Math.max(0, visiblePanels.length - 1),
    );
    const expandedHeights = allocatePanelStackHeights({
      naturalHeights: expandedPanels.map((panel) => Math.max(
        panel.getBoundingClientRect().height,
        panel.scrollHeight || 0,
      )),
      availableHeight: expandedAvailableHeight,
    });
    const autoCollapseIndices = this.hud.visible ? panelStackAutoCollapseIndices({
      naturalHeights: expandedPanels.map((panel) => Math.max(
        panel.getBoundingClientRect().height,
        panel.scrollHeight || 0,
      )),
      allocatedHeights: expandedHeights,
      collapseLaterPanels: shouldFocus && this.hud.getVariant() === 'tactical',
    }) : [];
    if (autoCollapseIndices.length) {
      for (const index of autoCollapseIndices) {
        const panel = expandedPanels[index];
        panel.classList.add('collapsed', 'layout-auto-collapsed');
        this._syncPanelCollapseButton(panel);
      }
      this._scheduleRightPanelLayout();
      return;
    }
    // Write-if-changed. This pass runs on the 500 ms stats cadence, and an
    // unconditional REMOVE-then-SET of an unchanged allocation is two style
    // mutations per tick on `#pp-toggles` (the one panel the measure-strip
    // above deliberately skips) — churn that reads as a genuine panel move to
    // the world-overlay host's occluder observer and defeats parked-idle
    // render savings. Only a real allocation change may touch the attribute.
    expandedPanels.forEach((panel, index) => {
      const next = `${expandedHeights[index].toFixed(1)}px`;
      if (panel.style.getPropertyValue('--right-panel-allocated-height') !== next) {
        panel.style.setProperty('--right-panel-allocated-height', next);
      }
    });
    for (const panel of panels) {
      if (expandedPanels.includes(panel)) continue;
      panel.style.removeProperty('--right-panel-allocated-height');
    }

    stack.style.setProperty('--right-stack-safe-top', `${layoutTop.toFixed(1)}px`);
    stack.style.setProperty('--right-stack-max-height', `${Math.max(0, safeBottom - layoutTop).toFixed(1)}px`);
    stack.classList.toggle('layout-focus', shouldFocus);
    stack.dataset.layoutMode = shouldFocus ? 'focus' : 'normal';
    stack.dataset.safeTop = layoutTop.toFixed(1);
    stack.dataset.safeBottom = safeBottom.toFixed(1);
    stack.dataset.availableHeight = availableHeight.toFixed(1);
    stack.dataset.requiredHeight = naturalHeight.toFixed(1);
    stack.dataset.expandedCount = String(expandedPanels.length);

    if (this._ppToggles && expandedPanels.includes(this._ppToggles)) {
      const maxScrollTop = Math.max(0, this._ppToggles.scrollHeight - this._ppToggles.clientHeight);
      this._ppToggles.scrollTop = Math.min(displayScrollTop, maxScrollTop);
    }

  },

  /**
   * Initializes the adaptive left accordion. The layout engine measures the
   * actual HUD/chrome rectangles that intersect the left lane, then decides
   * whether collapsed sibling labels can remain visible beside the expanded
   * panel. No decision is keyed to a specific panel or HUD variant.
   * @returns {void}
   */
  _initLeftPanelAdaptiveLayout() {
    const stack = this._leftPanelStack;
    if (!stack) return;

    if (typeof ResizeObserver !== 'undefined') {
      this._leftStackResizeObserver = new ResizeObserver(() => {
        this._scheduleLeftPanelLayout();
      });
      this._leftStackResizeObserver.observe(stack);
      stack.querySelectorAll(':scope > [data-panel-id]').forEach((panel) => {
        this._leftStackResizeObserver.observe(panel);
        const inner = [...panel.children].find((child) => !child.classList.contains('panel-glow'));
        if (inner) this._leftStackResizeObserver.observe(inner);
      });
      document.querySelectorAll(LEFT_STACK_OBSTACLE_SELECTOR).forEach((element) => {
        this._leftStackResizeObserver.observe(element);
      });
    }

    if (typeof MutationObserver !== 'undefined') {
      this._leftStackMutationObserver = new MutationObserver(() => {
        this._scheduleLeftPanelLayout();
      });
      this._leftStackMutationObserver.observe(stack, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class'],
      });
      const hud = document.getElementById('intel-hud');
      if (hud) {
        this._leftStackMutationObserver.observe(hud, {
          attributes: true,
          attributeFilter: ['class', 'data-variant'],
        });
      }
      const credits = document.getElementById('cesium-credits');
      if (credits) {
        this._leftStackMutationObserver.observe(credits, {
          subtree: true,
          childList: true,
        });
      }
    }

    const transitionHud = document.getElementById('intel-hud');
    if (transitionHud) {
      this._leftStackHudTransitionHandler = (event) => {
        if (event.propertyName === 'opacity' || event.propertyName === 'visibility') {
          this._scheduleLeftPanelLayout({ reconsiderAutoCollapse: true });
          // The Cockpit strip hangs off the HUD's REC readout, so it has to
          // remeasure on the same event: the readout keeps its rect through
          // the whole fade and only stops counting once the HUD has retired.
          this.cockpitView?.scheduleContextLayout();
        }
      };
      transitionHud.addEventListener('transitionend', this._leftStackHudTransitionHandler);
    }

    this._leftStackCockpitModeHandler = () => {
      // Cockpit mode repositions the peripheral HUD and reveals its own
      // bottom-left context card. Measure after those styles have committed so
      // the accordion remains in the same obstacle-safe lane instead of
      // jumping to a cockpit-specific top anchor.
      this._scheduleLeftPanelLayout();
      requestAnimationFrame(() => this._scheduleLeftPanelLayout());
      setTimeout(() => this._scheduleLeftPanelLayout(), 300);
    };
    window.addEventListener('gev:cockpit-mode-changed', this._leftStackCockpitModeHandler);

    this._scheduleLeftPanelLayout();
  },

  /**
   * Batches adaptive accordion work into one animation frame.
   * @returns {void}
   */
  _scheduleLeftPanelLayout({ reconsiderAutoCollapse = false } = {}) {
    if (reconsiderAutoCollapse) this._leftStackReconsiderAutoCollapse = true;
    if (!this._leftPanelStack || this._leftStackLayoutFrame !== null) return;
    this._leftStackLayoutFrame = requestAnimationFrame(() => {
      this._leftStackLayoutFrame = null;
      if (this._leftStackReconsiderAutoCollapse) {
        this._leftStackReconsiderAutoCollapse = false;
        for (const panel of this._leftPanelStack.querySelectorAll('.layout-auto-collapsed')) {
          panel.classList.remove('collapsed', 'layout-auto-collapsed');
          this._syncPanelCollapseButton(panel);
        }
      }
      this._syncLeftPanelAdaptiveLayout();
    });
  },

  /**
   * Estimates an expanded panel's unconstrained content height from its
   * visible direct children and their scroll extents. This avoids treating a
   * flex-grown panel as naturally tall while still accounting for nested lists.
   * @param {HTMLElement} panel - Expanded accordion panel.
   * @returns {number} Natural height in rendered CSS pixels.
   */
  _measureLeftPanelNaturalHeight(panel) {
    const inner = [...panel.children].find((child) => !child.classList.contains('panel-glow'));
    if (!inner) return Math.ceil(panel.scrollHeight || panel.getBoundingClientRect().height);

    const innerRect = inner.getBoundingClientRect();
    const panelStyle = getComputedStyle(panel);
    const innerStyle = getComputedStyle(inner);
    const paddingBottom = parseFloat(innerStyle.paddingBottom) || 0;
    let contentBottom = parseFloat(innerStyle.paddingTop) || 0;

    for (const child of inner.children) {
      const childStyle = getComputedStyle(child);
      if (childStyle.display === 'none' || childStyle.visibility === 'hidden') continue;
      const childRect = child.getBoundingClientRect();
      const marginBottom = parseFloat(childStyle.marginBottom) || 0;
      const naturalChildHeight = Math.max(childRect.height, child.scrollHeight || 0);
      const childBottom = childRect.top - innerRect.top + naturalChildHeight + marginBottom;
      contentBottom = Math.max(contentBottom, childBottom);
    }

    const wrapperChrome = (parseFloat(panelStyle.borderTopWidth) || 0)
      + (parseFloat(panelStyle.borderBottomWidth) || 0)
      + (parseFloat(panelStyle.paddingTop) || 0)
      + (parseFloat(panelStyle.paddingBottom) || 0);
    return Math.ceil(contentBottom + paddingBottom + wrapperChrome);
  },

  /**
   * Measures a live obstacle-free corridor for the left accordion and toggles
   * focus mode only when the expanded panel plus sibling labels cannot fit.
   * Safe boundaries are written as viewport-relative CSS values.
   * @returns {void}
   */
  _syncLeftPanelAdaptiveLayout() {
    const stack = this._leftPanelStack;
    if (!stack) return;

    const panels = [...stack.querySelectorAll(':scope > [data-panel-id]')];
    if (!panels.length) return;
    if (!this.hud.visible || this.hud.getVariant() !== 'tactical') {
      for (const panel of panels.filter((item) => item.classList.contains('layout-auto-collapsed'))) {
        panel.classList.remove('collapsed', 'layout-auto-collapsed');
        this._syncPanelCollapseButton(panel);
      }
    }

    // The existing narrow-screen composition has its own full-width stack.
    // Keep this desktop lane engine from fighting those dedicated rules.
    if (window.matchMedia('(max-width: 720px)').matches) {
      stack.classList.remove('layout-focus');
      stack.classList.remove('layout-tail');
      stack.style.removeProperty('--left-stack-safe-top');
      stack.style.removeProperty('--left-stack-safe-bottom');
      stack.style.removeProperty('--left-stack-centered-height');
      stack.dataset.layoutMode = 'mobile';
      for (const panel of panels) {
        panel.removeAttribute('aria-hidden');
        panel.style.removeProperty('--left-panel-allocated-height');
      }
      return;
    }

    const viewportHeight = Math.max(1, window.innerHeight);
    const stackRect = stack.getBoundingClientRect();
    const baseTop = viewportHeight * 0.26;
    const baseBottomInset = viewportHeight * 0.04;
    const safeGap = viewportHeight * 0.012;
    let obstacleSafeTop = viewportHeight * 0.04;
    let safeTop = baseTop;
    let safeBottom = viewportHeight - baseBottomInset;
    const bottomObstacles = [];

    for (const obstacle of document.querySelectorAll(LEFT_STACK_OBSTACLE_SELECTOR)) {
      if (stack.contains(obstacle)) continue;
      let hiddenByAncestor = false;
      for (let element = obstacle; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          hiddenByAncestor = true;
          break;
        }
      }
      if (hiddenByAncestor) continue;
      const rect = obstacle.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const overlapsHorizontally = rect.right > stackRect.left && rect.left < stackRect.right;
      if (!overlapsHorizontally) continue;

      if (rect.top < baseTop && rect.bottom <= viewportHeight * 0.5) {
        const obstacleBottom = rect.bottom + safeGap;
        obstacleSafeTop = Math.max(obstacleSafeTop, obstacleBottom);
        safeTop = Math.max(safeTop, obstacleBottom);
      } else if (rect.top >= baseTop) {
        bottomObstacles.push({ top: rect.top });
      }
    }
    safeBottom = resolveLeftStackBottomBoundary({
      baseBottom: safeBottom,
      obstacles: bottomObstacles,
      safeGap,
    });

    const obstacleSafeBottom = safeBottom;

    // Keep the accordion visually centered when the balanced corridor remains
    // useful. During live viewport-height changes, retain the aligned lane
    // instead of extending a tiny midpoint corridor through a lower obstacle.
    const minimumLaneHeight = viewportHeight * 0.16;
    ({ safeTop, safeBottom } = resolvePanelStackCorridor({
      viewportHeight,
      safeTop,
      safeBottom,
      obstacleSafeTop,
      obstacleSafeBottom,
      minimumHeight: minimumLaneHeight,
    }));
    const viewportMidpoint = viewportHeight * 0.5;
    for (const panel of panels) {
      const rect = panel.getBoundingClientRect();
      if (panel.classList.contains('collapsed') && rect.height > 0) {
        this._leftStackCollapsedHeights.set(panel.id, rect.height);
      }
    }

    const expandedPanelsInDomOrder = panels.filter((panel) => !panel.classList.contains('collapsed'));
    const preferredExpandedPanel = expandedPanelsInDomOrder.find(
      (panel) => panel.id === this._leftStackPreferredPanelId,
    );
    // Auto-collapse is a presentation fallback, not permission to undo the
    // user's newest disclosure. Measure and allocate that explicitly opened
    // panel first so an older expanded sibling yields when the corridor cannot
    // usefully present both (for example Map Stack followed by Scenes).
    const expandedPanels = preferredExpandedPanel
      ? [preferredExpandedPanel, ...expandedPanelsInDomOrder.filter((panel) => panel !== preferredExpandedPanel)]
      : expandedPanelsInDomOrder;
    // Clear the prior pass before reading intrinsic heights. The allocated
    // outer height and the inner scroller otherwise feed their constrained
    // size back into the next HUD-mode calculation.
    for (const panel of expandedPanels) {
      panel.style.removeProperty('--left-panel-allocated-height');
    }
    const availableHeight = Math.max(0, safeBottom - safeTop);
    const naturalExpandedHeights = expandedPanels.map((panel) => this._measureLeftPanelNaturalHeight(panel));
    const naturalExpandedHeight = naturalExpandedHeights.reduce((sum, height) => sum + height, 0);
    const siblingHeight = panels.reduce((total, panel) => {
      if (!panel.classList.contains('collapsed')) return total;
      const measured = this._leftStackCollapsedHeights.get(panel.id);
      return total + (measured || panel.getBoundingClientRect().height || 0);
    }, 0);
    let requiredHeight = siblingHeight;

    const rowGap = parseFloat(getComputedStyle(stack).rowGap) || 0;
    if (expandedPanels.length) {
      requiredHeight += naturalExpandedHeight;
      requiredHeight += rowGap * Math.max(0, panels.length - 1);
    } else {
      requiredHeight += rowGap * Math.max(0, panels.length - 1);
    }

    const wasFocused = stack.classList.contains('layout-focus');
    const wasTail = stack.classList.contains('layout-tail');
    const wasConstrained = wasFocused || wasTail;
    const stabilityBand = viewportHeight * 0.01;
    const exceedsCenteredCorridor = expandedPanels.length > 0 && (wasConstrained
      ? requiredHeight > availableHeight - stabilityBand * 2
      : requiredHeight > availableHeight - stabilityBand);
    const tailRequiredHeight = naturalExpandedHeight
      + siblingHeight
      + rowGap * Math.max(0, panels.length - 1);
    // A compact expansion should not make the whole control stack jump down
    // merely to center a few short rows. Preserve the normal top anchor when
    // the centered stack would begin below it; tall stacks can still grow
    // upward around the viewport midpoint as their content requires.
    const centeredTailTop = viewportMidpoint - tailRequiredHeight * 0.5;
    const tailLayoutTop = Math.min(centeredTailTop, safeTop);
    const tailLayoutBottom = tailLayoutTop + tailRequiredHeight;
    const tailAvailableHeight = Math.max(0, obstacleSafeBottom - obstacleSafeTop);
    const tailTolerance = wasTail ? stabilityBand : -stabilityBand;
    const shouldTail = expandedPanels.length > 0
      && tailLayoutTop >= obstacleSafeTop - tailTolerance
      && tailLayoutBottom <= obstacleSafeBottom + tailTolerance;
    const shouldFocus = exceedsCenteredCorridor && !shouldTail;
    // Focus mode owns the lane, so let every expanded panel share the full
    // obstacle-safe corridor. Tail/normal layouts keep the balanced
    // viewport centering used for compact accordion stacks.
    const layoutTop = shouldFocus
      ? obstacleSafeTop
      : shouldTail ? tailLayoutTop : safeTop;
    const layoutBottom = shouldFocus
      ? obstacleSafeBottom
      : shouldTail ? tailLayoutBottom : safeBottom;
    const topPct = (layoutTop / viewportHeight) * 100;
    const bottomPct = ((viewportHeight - layoutBottom) / viewportHeight) * 100;
    const topValue = `${topPct.toFixed(3)}vh`;
    const bottomValue = `${bottomPct.toFixed(3)}vh`;
    const expandedAvailableHeight = shouldFocus
      ? Math.max(0, layoutBottom - layoutTop
        - rowGap * Math.max(0, expandedPanels.length - 1))
      : naturalExpandedHeight;
    const allocatedExpandedHeights = allocatePanelStackHeights({
      naturalHeights: naturalExpandedHeights,
      availableHeight: expandedAvailableHeight,
    });
    const autoCollapseIndices = this.hud.visible ? panelStackAutoCollapseIndices({
      naturalHeights: naturalExpandedHeights,
      allocatedHeights: allocatedExpandedHeights,
      collapseLaterPanels: shouldFocus && this.hud.getVariant() === 'tactical',
    }) : [];
    if (autoCollapseIndices.length) {
      for (const index of autoCollapseIndices) {
        const panel = expandedPanels[index];
        panel.classList.add('collapsed', 'layout-auto-collapsed');
        this._syncPanelCollapseButton(panel);
      }
      this._scheduleLeftPanelLayout();
      return;
    }
    if (stack.style.getPropertyValue('--left-stack-safe-top') !== topValue) {
      stack.style.setProperty('--left-stack-safe-top', topValue);
    }
    if (stack.style.getPropertyValue('--left-stack-safe-bottom') !== bottomValue) {
      stack.style.setProperty('--left-stack-safe-bottom', bottomValue);
    }
    stack.style.removeProperty('--left-stack-centered-height');
    for (const panel of panels) panel.style.removeProperty('--left-panel-allocated-height');
    expandedPanels.forEach((panel, index) => {
      panel.style.setProperty('--left-panel-allocated-height', `${allocatedExpandedHeights[index].toFixed(1)}px`);
    });

    stack.classList.toggle('layout-focus', shouldFocus);
    stack.classList.toggle('layout-tail', shouldTail);
    stack.dataset.layoutMode = shouldFocus ? 'focus' : shouldTail ? 'tail' : 'normal';
    stack.dataset.safeTopPct = topPct.toFixed(2);
    stack.dataset.safeBottomPct = (100 - bottomPct).toFixed(2);
    stack.dataset.availableHeightPct = ((availableHeight / viewportHeight) * 100).toFixed(2);
    stack.dataset.requiredHeightPct = ((requiredHeight / viewportHeight) * 100).toFixed(2);
    stack.dataset.tailAvailableHeightPct = ((tailAvailableHeight / viewportHeight) * 100).toFixed(2);
    stack.dataset.expandedCount = String(expandedPanels.length);

    // Cockpit Display/Radio live in the opposite margin and no longer borrow
    // this corridor: the left accordion's top is solved against left-lane
    // obstacles, which put the strip straight through the briefing card.
    // CockpitView.syncSignalLayout() owns `--cockpit-utility-top` instead.

    for (const panel of panels) {
      const hiddenSibling = shouldFocus && panel.classList.contains('collapsed');
      if (hiddenSibling) panel.setAttribute('aria-hidden', 'true');
      else panel.removeAttribute('aria-hidden');
    }
    // The right controls share this top baseline; update them after the left
    // accordion commits an HUD-variant or obstacle-driven position change.
    this._scheduleRightPanelLayout();
  },

  /**
   * Updates collapse button glyphs based on panel state. Right-rail panels
   * use directional arrows; left-stack panels use +/- symbols.
   * @param {HTMLElement} panelEl - The panel DOM element.
   * @returns {void}
   */
  _syncPanelCollapseButton(panelEl) {
    const isRightRail = ['pp-toggles', 'cctv-panel', 'global-context-panel'].includes(panelEl?.id);
    const collapsed = panelEl.classList.contains('collapsed');
    panelEl.querySelectorAll('.panel-collapse-btn[data-collapse-target]').forEach((btn) => {
      const owner = btn.closest('[data-panel-id], #param-slider-panel');
      if (owner !== panelEl) return;
      if (isRightRail) {
        btn.textContent = collapsed ? '◀' : '▶';
      } else {
        btn.textContent = collapsed ? '+' : '−';
      }
      btn.setAttribute('aria-expanded', String(!collapsed));
      const panelName = panelEl.querySelector('.panel-title, .pp-header-label')?.textContent?.trim() || 'panel';
      const action = collapsed ? 'Expand' : 'Collapse';
      btn.title = `${action} ${panelName}`;
      btn.setAttribute('aria-label', `${action} ${panelName}`);
      if (panelEl.id === 'radio-panel') {
        const action = collapsed ? 'Expand' : 'Collapse';
        btn.title = `${action} Radio`;
        btn.setAttribute('aria-label', `${action} Radio section`);
      }
    });
    const dockToggle = panelEl.querySelector(`[data-dock-toggle-target="${panelEl.id}"]`);
    if (dockToggle) {
      const panelName = panelEl.querySelector('.panel-title')?.textContent?.trim() || 'panel';
      const action = collapsed ? 'Expand' : 'Collapse';
      dockToggle.setAttribute('aria-expanded', String(!collapsed));
      dockToggle.setAttribute('aria-label', `${action} ${panelName}`);
      dockToggle.title = `${action} ${panelName}`;
    }
    if (panelEl.id === 'radio-panel' && this._contextRadioDetailsBtn) {
      this._contextRadioDetailsBtn.setAttribute('aria-expanded', String(!collapsed));
    }
    if (panelEl.id === 'radio-panel' || panelEl.id === 'global-context-panel') {
      this._syncContextRadioLauncherState();
    }
  },

  /**
   * Converts a panel from left-positioned to right-anchored so it expands
   * leftward on resize. Used for the right-rail parameter panel.
   * @param {HTMLElement} panelEl - The panel to re-anchor.
   * @returns {void}
   */
  _pinPanelToRight(panelEl) {
    if (!panelEl) return;
    const rect = panelEl.getBoundingClientRect();
    const rightOffset = Math.max(6, Math.round(window.innerWidth - rect.right));
    panelEl.style.right = `${rightOffset}px`;
    panelEl.style.left = 'auto';
  },

  /**
   * Restores a panel's top/left position from localStorage.
   * Right-rail panels are additionally pinned to the right edge.
   * @param {string} panelId - DOM id of the panel.
   * @param {HTMLElement} panelEl - The panel DOM element.
   * @returns {void}
   */
  _restorePanelPosition(panelId, panelEl) {
    try {
      const raw = localStorage.getItem(this._panelStorageKey(panelId));
      if (!raw) return;
      const pos = JSON.parse(raw);
      if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return;
      // Clamp to the viewport: a position saved at one window size would otherwise land off-screen at
      // another (audit U2 — observed a panel at x:-192). The drag handler clamps; restore must too.
      const { left, top } = this._clampToViewport(Math.round(pos.left), Math.round(pos.top), panelEl);
      panelEl.style.left = `${left}px`;
      panelEl.style.top = `${top}px`;
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
      if (panelId === 'pp-toggles') {
        this._pinPanelToRight(panelEl);
      }
    } catch {
      // ignore malformed saved panel position
    }
  },

  /**
   * Clamp a desired left/top so the panel stays fully on-screen (6px inset), matching the drag
   * clamp (ui.js ~1822). Width/height are position-independent, so reading the rect first is safe.
   * @param {number} left - desired left (px)
   * @param {number} top - desired top (px)
   * @param {HTMLElement} panelEl - the panel element
   * @returns {{left:number, top:number}}
   */
  _clampToViewport(left, top, panelEl) {
    const rect = panelEl.getBoundingClientRect();
    const maxLeft = Math.max(6, window.innerWidth - rect.width - 6);
    const maxTop = Math.max(6, window.innerHeight - rect.height - 6);
    return {
      left: Math.max(6, Math.min(maxLeft, left)),
      top: Math.max(6, Math.min(maxTop, top)),
    };
  },

  /**
   * Persists a panel's current bounding-rect position to localStorage.
   * @param {string} panelId - DOM id of the panel.
   * @param {HTMLElement} panelEl - The panel DOM element.
   * @returns {void}
   */
  _savePanelPosition(panelId, panelEl) {
    const rect = panelEl.getBoundingClientRect();
    try {
      localStorage.setItem(this._panelStorageKey(panelId), JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
      }));
    } catch {
      // storage unavailable
    }
  },

  /**
   * Promotes a panel to the top of the panel z band [PANEL_Z_BASE, PANEL_Z_MAX].
   * Renormalizes all promoted panels when the band is exhausted so panels can
   * never climb above the voice pill (150), toasts (200), or clean-view exit (300).
   * @param {HTMLElement} panelEl - Panel to bring to front.
   * @returns {void}
   */
  _promotePanelZ(panelEl) {
    this._panelZCounter += 1;
    if (this._panelZCounter > PANEL_Z_MAX) {
      const promoted = [...document.querySelectorAll('.panel-draggable')]
        .filter((el) => el.style.zIndex)
        .sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex));
      let z = PANEL_Z_BASE + 1;
      for (const el of promoted) {
        el.style.zIndex = String(z);
        z += 1;
      }
      this._panelZCounter = z;
    }
    panelEl.style.zIndex = String(this._panelZCounter);
  },

  /**
   * Makes a panel draggable via its handle element. Implements:
   * - Z-order promotion: each pointerdown increments the global z-counter
   *   so the clicked panel floats above siblings.
   * - Viewport clamping: drag moves are clamped to a 6px inset from all edges.
   * - Right-rail pinning: pp-toggles panel is re-anchored right after drag.
   * - CCTV viewport sync: cctv-panel recalculates scroll height after drag.
   * @param {string} panelId - DOM id of the panel.
   * @param {HTMLElement} panelEl - The panel DOM element.
   * @param {HTMLElement} handleEl - The drag handle element within the panel.
   * @returns {void}
   */
  _makePanelDraggable(panelId, panelEl, handleEl) {
    // Z-order promotion: bring clicked panel to front of the stacking context
    panelEl.addEventListener('pointerdown', () => {
      this._promotePanelZ(panelEl);
    });

    handleEl.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('.panel-collapse-btn')) return;
      if (event.target.closest('input, select, option, button:not(.panel-collapse-btn)')) return;

      event.preventDefault();
      const rect = panelEl.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const offsetX = startX - rect.left;
      const offsetY = startY - rect.top;

      panelEl.style.left = `${rect.left}px`;
      panelEl.style.top = `${rect.top}px`;
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
      panelEl.classList.add('panel-dragging');
      this._promotePanelZ(panelEl);

      const onMove = (moveEvent) => {
        const nextLeftRaw = moveEvent.clientX - offsetX;
        const nextTopRaw = moveEvent.clientY - offsetY;
        const maxLeft = Math.max(6, window.innerWidth - rect.width - 6);
        const maxTop = Math.max(6, window.innerHeight - rect.height - 6);
        const nextLeft = Math.max(6, Math.min(maxLeft, nextLeftRaw));
        const nextTop = Math.max(6, Math.min(maxTop, nextTopRaw));
        panelEl.style.left = `${nextLeft}px`;
        panelEl.style.top = `${nextTop}px`;
        if (panelId === 'pp-toggles') {
          this._layoutRightPanels();
        }
        if (panelId === 'cctv-panel') {
          this._syncCctvPanelViewport();
        }
      };

      const onUp = () => {
        panelEl.classList.remove('panel-dragging');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (panelId === 'pp-toggles') {
          this._pinPanelToRight(panelEl);
        }
        this._savePanelPosition(panelId, panelEl);
        if (panelId === 'cctv-panel') {
          this._syncCctvPanelViewport();
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
  },

  _buildSharePanelState() {
    const specs = [];
    for (const spec of SHARE_PANEL_STATE_SPECS) {
      const panelEl = document.getElementById(spec.id);
      if (!panelEl) continue;
      // Responsive auto-collapse is presentation only; the recipient should
      // restore the user's explicit expanded preference at its own viewport.
      const collapsed = panelEl.classList.contains('layout-auto-collapsed')
        ? false
        : panelEl.classList.contains('collapsed');
      const entry = { id: spec.id, collapsed };
      if (spec.pinnable) entry.pinned = panelEl.classList.contains('dock-pinned');
      specs.push(entry);
    }
    return specs.length ? { specs } : null;
  },

  _restorePanelState(panelState) {
    if (!panelState || !Array.isArray(panelState.specs)) return;
    const specsById = new Map(panelState.specs.map((spec) => [spec.id, spec]));
    for (const spec of SHARE_PANEL_STATE_SPECS) {
      const state = specsById.get(spec.id);
      if (!state || typeof state.collapsed !== 'boolean') continue;
      if (spec.pinnable && typeof state.pinned === 'boolean') {
        this._setCommandDockPanelPinState(spec.id, state.pinned, {
          restore: true,
          persist: false,
          syncShare: false,
        });
      }
      const nextCollapsed = state.pinned && spec.pinnable ? false : state.collapsed;
      this.setPanelCollapsed(spec.id, nextCollapsed, {
        restore: true,
        persist: false,
        syncShare: false,
      });
    }
    this.shareLinkManager?.onPanelStateChange?.();
  },

  /**
   * Programmatically collapses or expands a panel, persists the state,
   * and triggers layout recalculation for dependent panels.
   * @param {string} panelId - DOM id of the panel.
   * @param {boolean} collapsed - Whether to collapse the panel.
   * @param {object} [options] Disclosure ownership options.
   * @param {boolean} [options.explicit=false] Whether a direct user action owns the panel lane.
   * @returns {void}
   */
  setPanelCollapsed(panelId, collapsed, {
    explicit = false,
    restore = false,
    persist = true,
    syncShare = true,
  } = {}) {
    const panelEl = document.getElementById(panelId);
    if (!panelEl) return;
    if (explicit && !restore) this.shareLinkManager?.claimRestoreLane?.('panel', panelId);
    const nextCollapsed = Boolean(collapsed);
    const wasAutoCollapsed = panelEl.classList.contains('layout-auto-collapsed');
    const leftOwnerPanel = this._leftPanelStack?.contains(panelEl) ? panelEl : null;
    const rightOwnerPanel = panelId === 'radio-panel'
      ? document.getElementById('global-context-panel')
      : (this._rightPanelStack?.contains(panelEl) ? panelEl : null);
    const priorLeftOwner = this._leftStackPreferredPanelId;
    const priorRightOwner = this._rightStackPreferredPanelId;
    if (explicit && !restore && !nextCollapsed && leftOwnerPanel) {
      this._leftStackPreferredPanelId = leftOwnerPanel.id;
    } else if (explicit && !restore && nextCollapsed && leftOwnerPanel?.id === this._leftStackPreferredPanelId) {
      this._leftStackPreferredPanelId = null;
    }
    if (explicit && !restore && !nextCollapsed && rightOwnerPanel) {
      this._rightStackPreferredPanelId = rightOwnerPanel.id;
    } else if (
      explicit
      && !restore
      && nextCollapsed
      && rightOwnerPanel?.id === this._rightStackPreferredPanelId
    ) {
      this._rightStackPreferredPanelId = null;
    }
    if (panelEl.classList.contains('collapsed') === nextCollapsed && !wasAutoCollapsed) {
      this._syncPanelCollapseButton(panelEl);
      if (priorLeftOwner !== this._leftStackPreferredPanelId) {
        this._scheduleLeftPanelLayout({ reconsiderAutoCollapse: true });
      }
      if (priorRightOwner !== this._rightStackPreferredPanelId) {
        this._scheduleRightPanelLayout({ reconsiderAutoCollapse: true });
      }
      return;
    }
    panelEl.classList.remove('layout-auto-collapsed');
    if (!nextCollapsed && this.cockpitView?.active && panelId === 'data-panel') {
      this._cockpitContextCollapsedForDataPanel = !this.cockpitView.contextCollapsed;
      if (this._cockpitContextCollapsedForDataPanel) {
        this.cockpitView.setContextCollapsed(true);
      }
    }
    if (!nextCollapsed && panelId === 'global-context-panel'
        && this._contextRadioDock?.classList.contains('disclosure-open')) {
      this._setRadioDisclosure?.(false);
    }
    if (!nextCollapsed && panelId === 'radio-panel'
        && document.getElementById('global-context-panel')?.classList.contains('collapsed')) {
      this.setPanelCollapsed('global-context-panel', false, { restore, persist, syncShare });
    }
    if (!nextCollapsed && !restore && panelId === 'location-bar') {
      const otherPanel = document.getElementById('control-panel');
      if (otherPanel && !otherPanel.classList.contains('dock-pinned')) {
        this.setPanelCollapsed('control-panel', true, { restore, persist, syncShare });
      }
    } else if (!nextCollapsed && !restore && panelId === 'control-panel') {
      const otherPanel = document.getElementById('location-bar');
      if (otherPanel && !otherPanel.classList.contains('dock-pinned')) {
        this.setPanelCollapsed('location-bar', true, { restore, persist, syncShare });
      }
    }
    panelEl.classList.toggle('collapsed', nextCollapsed);
    if (nextCollapsed && this.cockpitView?.active && panelId === 'data-panel'
        && this._cockpitContextCollapsedForDataPanel) {
      this._cockpitContextCollapsedForDataPanel = false;
      this.cockpitView.setContextCollapsed(false);
    }
    this._syncPanelCollapseButton(panelEl);
    if (persist !== false) this._savePanelCollapsedState(panelId, nextCollapsed);
    if (panelId === 'pp-toggles') {
      this._layoutRightPanels();
    }
    if (this._rightPanelStack?.contains(panelEl)) {
      this._scheduleRightPanelLayout({ reconsiderAutoCollapse: true });
    }
    if (panelId === 'cctv-panel') {
      this._syncCctvPanelViewport();
    }
    requestAnimationFrame(() => this._updateCommandDockTrayStack());
    this._scheduleLeftPanelLayout({
      reconsiderAutoCollapse: this._leftPanelStack?.contains(panelEl) === true,
    });
    if (syncShare) this.shareLinkManager?.onPanelStateChange?.();
  },
};
