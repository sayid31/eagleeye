// src/cctvListboxMixin.js
/**
 * CCTV camera picker: the portal listbox (open/close/position/highlight,
 * keyboard handling) and camera selection by id.
 *
 * Part of the StyleManager CCTV panel prototype mixin, split out of
 * `cctvPanelMixin.js` to keep each file within its size budget. Same contract
 * as that file: methods run with `this` bound to the StyleManager instance and
 * are `Object.assign`ed onto its prototype through `cctvPanelMixin`.
 */
import { handleCctvListboxKeydown } from './cctvCameraListbox.js';

export const cctvListboxMixin = {
  /**
   * Wires the camera picker's custom ARIA listbox: trigger open/close, item
   * selection (click and keyboard), click-outside, and Escape-to-close. This
   * replaces a native `<select>` — see the module header — so the open popup
   * is ordinary page HTML/CSS instead of OS-rendered chrome (the actual
   * cross-platform white-popup bug fix).
   *
   * `aria-activedescendant` on the trigger (not roving tabindex) keeps focus
   * on one element the whole time the popup is open, matching the disclosure
   * pattern already used in `radioPanelMixin.js`. All listeners share one
   * `AbortController` so re-init (e.g. panel rebuild) can't arm duplicates.
   *
   * The popup `<ul>` is reparented onto `document.body` here (a "portal") —
   * left in `index.html` under `.cctv-camera-picker`, `position: fixed`
   * resolves against the CCTV panel instead of the viewport, because
   * `.cctv-panel-inner` has `backdrop-filter` and the CSS spec makes any
   * element with a `backdrop-filter`/`filter`/`transform` the *containing
   * block* for its `position: fixed` descendants. Without the portal, the
   * popup's computed top/left in `_positionCctvListbox()` land relative to
   * the panel's box, not the screen — a large mispositioned dark rectangle
   * (field-reported 2026-09). `_initCctvPanel()` runs once from the
   * constructor, so this reparent can't run twice and duplicate the node.
   * @returns {void}
   */
  _initCctvCameraListbox() {
    if (!this._cctvCameraTrigger || !this._cctvCameraListbox) return;
    document.body.appendChild(this._cctvCameraListbox);
    this._cctvListboxAbort?.abort();
    this._cctvListboxAbort = new AbortController();
    const { signal } = this._cctvListboxAbort;
    this._cctvListboxHighlightedId = null;

    this._cctvCameraTrigger.addEventListener('click', () => {
      if (this._isCctvListboxOpen()) this._closeCctvListbox();
      else this._openCctvListbox();
    }, { signal });

    this._cctvCameraListbox.addEventListener('click', (event) => {
      const item = event.target.closest?.('.cctv-camera-option');
      const cameraId = item?.dataset?.cameraId;
      if (!cameraId) return;
      this._closeCctvListbox({ returnFocus: true });
      void this._selectCctvCameraFromListbox(cameraId);
    }, { signal });

    this._cctvCameraTrigger.addEventListener('keydown', (event) => {
      if (!this._isCctvListboxOpen()) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
          event.preventDefault();
          this._openCctvListbox();
        }
        return;
      }
      const items = Array.from(this._cctvCameraListbox.children)
        .map((li) => li.dataset.cameraId)
        .filter(Boolean);
      const action = handleCctvListboxKeydown(event.key, {
        items,
        highlightedId: this._cctvListboxHighlightedId,
      });
      if (!action) return;
      event.preventDefault();
      if (action.type === 'highlight') this._highlightCctvListboxItem(action.id);
      else if (action.type === 'commit') {
        this._closeCctvListbox({ returnFocus: true });
        void this._selectCctvCameraFromListbox(action.id);
      } else if (action.type === 'close') {
        this._closeCctvListbox({ returnFocus: true });
      }
    }, { signal });

    document.addEventListener('pointerdown', (event) => {
      if (!this._isCctvListboxOpen()) return;
      if (event.target?.closest?.('#cctv-camera-listbox, #cctv-camera-trigger')) return;
      this._closeCctvListbox();
    }, { signal });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this._isCctvListboxOpen()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this._closeCctvListbox({ returnFocus: true });
    }, { capture: true, signal });
  },

  /**
   * Opens the camera picker popup: positions it against the trigger, makes
   * it visible, and highlights the active (or first) camera.
   * @returns {void}
   */
  _openCctvListbox() {
    if (!this._cctvCameraTrigger || this._cctvCameraTrigger.disabled) return;
    this._cctvCameraListbox.hidden = false;
    this._cctvCameraTrigger.setAttribute('aria-expanded', 'true');
    this._positionCctvListbox();
    const activeId = this._activeCctvCameraId();
    const items = Array.from(this._cctvCameraListbox.children).map((li) => li.dataset.cameraId);
    const startId = (activeId && items.includes(activeId)) ? activeId : (items[0] || null);
    if (startId) this._highlightCctvListboxItem(startId, { scrollIntoView: true });
  },

  /**
   * Closes the camera picker popup.
   * @param {{returnFocus?: boolean}} [options] - Return focus to the trigger.
   * @returns {void}
   */
  _closeCctvListbox({ returnFocus = false } = {}) {
    if (!this._cctvCameraTrigger) return;
    this._cctvCameraListbox.hidden = true;
    this._cctvCameraTrigger.setAttribute('aria-expanded', 'false');
    this._cctvCameraTrigger.removeAttribute('aria-activedescendant');
    this._cctvListboxHighlightedId = null;
    for (const item of this._cctvCameraListbox.children) item.classList.remove('highlighted');
    if (returnFocus) this._cctvCameraTrigger.focus({ preventScroll: true });
  },

  /**
   * Whether the camera picker popup is currently open. Used by `ui.js`'s
   * global hotkey guards so arrow-key navigation inside the popup can't also
   * fire style/POI hotkeys (the same reason those guards already bail out of
   * a focused `<select>`/`<input>`/`<textarea>`).
   * @returns {boolean}
   */
  _isCctvListboxOpen() {
    return this._cctvCameraTrigger?.getAttribute('aria-expanded') === 'true';
  },

  /**
   * Repositions the open popup against the trigger's current viewport
   * position. `position: fixed` (not `absolute`) because `.cctv-panel-inner`
   * can be `overflow-y: auto` when the CCTV panel is docked in
   * `#right-context-rail`, which would clip an absolutely-positioned popup.
   * Relies on the popup being portaled onto `document.body` (see
   * `_initCctvCameraListbox`) — without that, `.cctv-panel-inner`'s
   * `backdrop-filter` would make it the containing block for this `fixed`
   * element instead of the viewport, and these viewport-relative coordinates
   * would land in the wrong place. Flips to open upward if there isn't
   * enough room below.
   *
   * Width/left are taken from `.cctv-panel-inner`'s content box (panel
   * width minus its own padding), not the trigger's own width — the trigger
   * sits between PREV/NEXT and is only ~1/3 of the panel's width, which made
   * a trigger-width popup uncomfortably narrow and truncated every label to
   * a couple of characters (field-reported). Matching the full panel width
   * instead lines the popup up with the panel's other full-width rows
   * (CALIBRATION block, PROJECTION/CAL row, etc).
   * @returns {void}
   */
  _positionCctvListbox() {
    if (!this._cctvCameraTrigger || this._cctvCameraListbox.hidden) return;
    const triggerRect = this._cctvCameraTrigger.getBoundingClientRect();
    const inner = this._cctvPanel?.querySelector('.cctv-panel-inner') || null;
    const innerRect = inner?.getBoundingClientRect() || triggerRect;
    const innerStyle = inner ? getComputedStyle(inner) : null;
    const paddingLeft = innerStyle ? parseFloat(innerStyle.paddingLeft) || 0 : 0;
    const paddingRight = innerStyle ? parseFloat(innerStyle.paddingRight) || 0 : 0;
    const left = innerRect.left + paddingLeft;
    const width = Math.max(0, innerRect.width - paddingLeft - paddingRight);

    const maxHeight = 260;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const openUpward = spaceBelow < maxHeight && triggerRect.top > spaceBelow;
    this._cctvCameraListbox.style.left = `${Math.round(left)}px`;
    this._cctvCameraListbox.style.width = `${Math.round(width)}px`;
    this._cctvCameraListbox.style.maxHeight = `${Math.round(Math.max(120, Math.min(maxHeight, openUpward ? triggerRect.top - 8 : spaceBelow - 8)))}px`;
    if (openUpward) {
      this._cctvCameraListbox.style.top = '';
      this._cctvCameraListbox.style.bottom = `${Math.round(window.innerHeight - triggerRect.top)}px`;
    } else {
      this._cctvCameraListbox.style.bottom = '';
      this._cctvCameraListbox.style.top = `${Math.round(triggerRect.bottom)}px`;
    }
  },

  /**
   * Moves the keyboard highlight (distinct from the actually-selected
   * camera) to the given item, updating `aria-activedescendant` and
   * scrolling it into view.
   * @param {string} cameraId
   * @param {{scrollIntoView?: boolean}} [options]
   * @returns {void}
   */
  _highlightCctvListboxItem(cameraId, { scrollIntoView = true } = {}) {
    this._cctvListboxHighlightedId = cameraId;
    for (const item of this._cctvCameraListbox.children) {
      const isHighlighted = item.dataset.cameraId === cameraId;
      item.classList.toggle('highlighted', isHighlighted);
      if (isHighlighted) {
        this._cctvCameraTrigger.setAttribute('aria-activedescendant', item.id);
        if (scrollIntoView) item.scrollIntoView?.({ block: 'nearest' });
      }
    }
  },

  /**
   * Activates a camera picked from the listbox: enables the layer if needed,
   * flies to the camera, and persists the selection. Shared by item click and
   * Enter/Space keyboard commit — the toggle-enable/focus-flight/persist logic
   * is unchanged from the old `<select>` `change` handler, just no longer
   * keyed off `.value`.
   * @param {string} cameraId
   * @returns {Promise<void>}
   */
  async _selectCctvCameraFromListbox(cameraId) {
    if (!cameraId) return;
    if (!await this._toggleCctvEnabled(true)) return;
    // Picking a camera from the popup flies to it. The catalog spans three
    // metros, so a bare selection used to leave the view in the old city
    // with a camera active thousands of km away.
    this._runExplicitCctvFocus(
      () => (this._dataManager?.callLayerMethod('cctv', 'selectCamera', cameraId) ? cameraId : null),
      (selectedId) => this._dataManager?.focusCamera('cctv', selectedId, 2.2),
    );
    this._dataManager?.setLayerParams('cctv', { selectedCameraId: cameraId }, { origin: 'user' });
  },

  /**
   * Public entry for other pickers (the shell's camera search): same enable,
   * fly-to and persist path as choosing a camera in the manual picker.
   * @param {string} cameraId
   * @returns {Promise<void>}
   */
  selectCctvCameraAndFly(cameraId) {
    return this._selectCctvCameraFromListbox(cameraId);
  },

  /**
   * Returns the currently active CCTV camera ID from state or the picker trigger.
   * @returns {string} Camera ID, or empty string if none.
   */
  _activeCctvCameraId() {
    return this._cctvState?.activeCameraId || this._cctvCameraTrigger?.dataset.selectedCameraId || '';
  },
};
