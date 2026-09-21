// CCTV camera picker — custom ARIA listbox, the replacement for the native
// `<select id="cctv-camera-select">`. The native popup is OS-rendered and
// ignores author CSS (Windows Chrome renders it opaque white regardless of
// the closed-state dark styling; macOS Chrome happens to honor it). Swapping
// to an ordinary `<button>` trigger + `<ul role="listbox">` popup makes the
// open state plain page HTML/CSS, so it renders identically everywhere.
//
// Split mirrors `src/mapStackChips.js`: a render function that rebuilds DOM
// only when the underlying camera set/order actually changes, and a cheap
// sync function called every render tick that only touches attributes/text
// on the already-built `<li>` items. Ordering itself is NOT owned here — it
// stays `orderCctvCameraOptions()` in `cctvPanelMixin.js` so that function's
// existing test coverage keeps its import path unchanged; this module always
// receives already-ordered input.

export const CCTV_CAMERA_OPTION_CLASS = 'cctv-camera-option';

/**
 * Display label for one camera, shared by the popup's `<li>` items and the
 * trigger's own text so the two can never drift onto different formats.
 * Unofficial/demo-only sources (see DATA_SOURCES.md) get a `⚠ ` prefix.
 * @param {{city?: string, name?: string, sourceKind?: string}} camera
 * @returns {string}
 */
export function cctvCameraOptionLabel(camera) {
  const unofficial = String(camera?.sourceKind || '').startsWith('unofficial');
  const base = `${camera?.city ?? ''} · ${camera?.name ?? ''}`;
  return unofficial ? `⚠ ${base}` : base;
}

/**
 * Whether the popup's `<li>` items are out of sync with the ordered camera
 * list and need a full rebuild — same diff the old `<option>` rebuild did
 * (length change or an id mismatch at any index), just read from
 * `dataset.cameraId` instead of `<option>.value`.
 * @param {HTMLElement|null} listboxEl - The `<ul role="listbox">` element.
 * @param {Array<{id: string}>} orderedCameras - Already-ordered camera list.
 * @returns {boolean}
 */
export function shouldRebuildCctvCameraListbox(listboxEl, orderedCameras) {
  const children = listboxEl?.children || [];
  if (children.length !== orderedCameras.length) return true;
  return orderedCameras.some((camera, idx) => children[idx]?.dataset?.cameraId !== camera.id);
}

/**
 * Rebuilds the popup's `<li role="option">` items from scratch. Only called
 * when `shouldRebuildCctvCameraListbox` says the set/order actually changed.
 * @param {HTMLElement|null} listboxEl - The `<ul role="listbox">` element.
 * @param {Array<object>} orderedCameras - Already-ordered camera list.
 * @param {Document} [doc] - Document override (tests).
 * @returns {void}
 */
export function renderCctvCameraListboxOptions(listboxEl, orderedCameras, doc) {
  if (!listboxEl) return;
  const ownerDoc = doc || listboxEl.ownerDocument || globalThis.document;
  if (!ownerDoc?.createElement) return;

  listboxEl.innerHTML = '';
  for (const camera of orderedCameras) {
    const option = ownerDoc.createElement('li');
    option.id = `cctv-cam-opt-${camera.id}`;
    option.className = CCTV_CAMERA_OPTION_CLASS;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.dataset.cameraId = camera.id;
    option.textContent = cctvCameraOptionLabel(camera);
    listboxEl.appendChild(option);
  }
}

/**
 * Cheap per-tick sync: never rebuilds DOM, only re-points `aria-selected` on
 * the existing `<li>` items and refreshes the trigger's disabled state, label,
 * and `data-selected-camera-id` (the `_activeCctvCameraId()` read path).
 * Never touches open/close state — that's owned by the panel's disclosure
 * wiring, not this render/sync pair.
 * @param {{trigger?: HTMLElement|null, listbox?: HTMLElement|null}} elements
 * @param {{cameras?: Array<object>, activeId?: string, enabled?: boolean}} state
 * @returns {void}
 */
export function syncCctvCameraListboxState({ trigger, listbox } = {}, { cameras = [], activeId = '', enabled = false } = {}) {
  const cameraList = Array.isArray(cameras) ? cameras : [];
  const activeCamera = activeId ? cameraList.find((camera) => camera.id === activeId) || null : null;

  if (trigger) {
    trigger.disabled = !enabled || cameraList.length === 0;
    trigger.textContent = activeCamera ? cctvCameraOptionLabel(activeCamera) : 'Select camera';
    trigger.dataset.selectedCameraId = activeCamera ? activeCamera.id : '';
  }

  if (listbox) {
    for (const option of Array.from(listbox.children || [])) {
      const isActive = !!activeCamera && option?.dataset?.cameraId === activeCamera.id;
      option.setAttribute?.('aria-selected', String(isActive));
    }
  }
}

/**
 * Pure key-to-action mapping for the open popup — no DOM, no side effects,
 * so it's testable without simulating real keyboard events. The caller
 * (`cctvPanelMixin.js`'s disclosure wiring) is responsible for actually
 * moving `aria-activedescendant`, scrolling the highlighted item into view,
 * committing a selection, or closing the popup based on the returned action.
 *
 * ArrowDown/ArrowUp move the highlight one step, clamped at the ends (no
 * wraparound) once a highlight exists; with nothing highlighted yet,
 * ArrowDown starts at the first item and ArrowUp at the last, matching
 * common combobox convention. Home/End jump straight to an end. Enter/Space
 * commit whatever is currently highlighted. Escape always requests a close,
 * even with an empty list.
 * @param {string} key - `event.key` from the keydown event.
 * @param {{items?: string[], highlightedId?: string|null}} state - `items` is
 *   the camera ids in display order; `highlightedId` is the id currently
 *   highlighted (not necessarily selected), or null/undefined if none.
 * @returns {{type: 'highlight'|'commit'|'close', id?: string}|null} An action
 *   descriptor, or null if the key is not handled.
 */
export function handleCctvListboxKeydown(key, state = {}) {
  if (key === 'Escape') return { type: 'close' };

  const items = Array.isArray(state.items) ? state.items : [];
  if (items.length === 0) return null;

  const currentIndex = state.highlightedId ? items.indexOf(state.highlightedId) : -1;

  switch (key) {
    case 'ArrowDown': {
      const nextIndex = currentIndex === -1 ? 0 : Math.min(currentIndex + 1, items.length - 1);
      return { type: 'highlight', id: items[nextIndex] };
    }
    case 'ArrowUp': {
      const nextIndex = currentIndex === -1 ? items.length - 1 : Math.max(currentIndex - 1, 0);
      return { type: 'highlight', id: items[nextIndex] };
    }
    case 'Home':
      return { type: 'highlight', id: items[0] };
    case 'End':
      return { type: 'highlight', id: items[items.length - 1] };
    case 'Enter':
    case ' ':
      return currentIndex === -1 ? null : { type: 'commit', id: items[currentIndex] };
    default:
      return null;
  }
}
