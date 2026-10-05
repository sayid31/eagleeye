// Scene-recipe picker — custom ARIA listbox replacing the native
// `<select id="scene-select">`. The native popup is OS-rendered (opaque white,
// ignores author CSS); a `<button>` trigger + `<ul role="listbox">` popup is
// plain page HTML/CSS, styled like the CCTV camera picker (`cctvCameraListbox.js`).
// The popup is portaled onto `document.body` for the same reason the CCTV one
// is: panels use `backdrop-filter`, which becomes the containing block of
// `position: fixed` descendants and would misplace the popup.

import { handleCctvListboxKeydown } from '../cctvCameraListbox.js';

export const SCENE_OPTION_CLASS = 'scene-picker-option';
const POPUP_MAX_HEIGHT_PX = 260;
const POPUP_MIN_HEIGHT_PX = 120;
const POPUP_EDGE_GAP_PX = 8;
const POPUP_VIEWPORT_MARGIN_PX = 8;
const EMPTY_LABEL = 'No scenes';

/**
 * Popup placement under (or, if cramped, above) the trigger.
 * `minWidth` is the trigger width; the popup may grow past it (up to `maxWidth`,
 * the room left of the viewport edge) so long scene names aren't clipped.
 * @param {{left: number, bottom: number, top: number, width: number}} triggerRect
 * @param {number} viewportHeight
 * @param {number} [viewportWidth]
 * @returns {{left: number, minWidth: number, maxWidth: number, maxHeight: number, openUpward: boolean, top?: number, bottom?: number}}
 */
export function computeScenePopupPlacement(triggerRect, viewportHeight, viewportWidth = Infinity) {
  const spaceBelow = viewportHeight - triggerRect.bottom;
  const openUpward = spaceBelow < POPUP_MAX_HEIGHT_PX && triggerRect.top > spaceBelow;
  const room = (openUpward ? triggerRect.top : spaceBelow) - POPUP_EDGE_GAP_PX;
  const placement = {
    left: Math.round(triggerRect.left),
    minWidth: Math.round(triggerRect.width),
    maxWidth: Math.round(Math.max(triggerRect.width, viewportWidth - triggerRect.left - POPUP_VIEWPORT_MARGIN_PX)),
    maxHeight: Math.round(Math.max(POPUP_MIN_HEIGHT_PX, Math.min(POPUP_MAX_HEIGHT_PX, room))),
    openUpward,
  };
  if (openUpward) placement.bottom = Math.round(viewportHeight - triggerRect.top);
  else placement.top = Math.round(triggerRect.bottom);
  return placement;
}

/**
 * Wires a trigger/listbox pair into a scene picker.
 * @param {Object} options
 * @param {HTMLElement} options.trigger - The `<button>` showing the selection.
 * @param {HTMLElement} options.listbox - The `<ul role="listbox">` popup.
 * @param {(sceneId: string) => void} options.onSelect - Called on a committed pick.
 * @param {Document} [options.doc] - Document override (tests).
 * @param {Window} [options.win] - Window override (tests).
 * @returns {{render: Function, setDisabled: Function, isOpen: Function, open: Function, close: Function, destroy: Function}}
 */
export function createScenePicker({ trigger, listbox, onSelect, doc = globalThis.document, win = globalThis.window }) {
  const abort = new AbortController();
  const { signal } = abort;
  let highlightedId = null;
  let selectedId = null;

  doc.body.appendChild(listbox);

  const isOpen = () => trigger.getAttribute('aria-expanded') === 'true';
  const optionIds = () => Array.from(listbox.children).map((li) => li.dataset.sceneId).filter(Boolean);

  function position() {
    const placement = computeScenePopupPlacement(trigger.getBoundingClientRect(), win.innerHeight, win.innerWidth);
    listbox.style.left = `${placement.left}px`;
    listbox.style.minWidth = `${placement.minWidth}px`;
    listbox.style.maxWidth = `${placement.maxWidth}px`;
    listbox.style.maxHeight = `${placement.maxHeight}px`;
    listbox.style.top = placement.openUpward ? '' : `${placement.top}px`;
    listbox.style.bottom = placement.openUpward ? `${placement.bottom}px` : '';
  }

  function highlight(sceneId) {
    highlightedId = sceneId;
    for (const item of listbox.children) {
      const on = item.dataset.sceneId === sceneId;
      item.classList.toggle('highlighted', on);
      if (on) {
        trigger.setAttribute('aria-activedescendant', item.id);
        item.scrollIntoView?.({ block: 'nearest' });
      }
    }
  }

  function open() {
    if (trigger.disabled || !listbox.children.length) return;
    listbox.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    position();
    const ids = optionIds();
    highlight(ids.includes(selectedId) ? selectedId : ids[0]);
  }

  function close({ returnFocus = false } = {}) {
    listbox.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    highlightedId = null;
    for (const item of listbox.children) item.classList.remove('highlighted');
    if (returnFocus) trigger.focus({ preventScroll: true });
  }

  function commit(sceneId) {
    close({ returnFocus: true });
    if (sceneId && sceneId !== selectedId) onSelect(sceneId);
  }

  /**
   * Rebuilds the options and syncs the trigger text/selection.
   * @param {Array<{id: string, title: string}>} scenes
   * @param {string|null} nextSelectedId
   */
  function render(scenes, nextSelectedId) {
    selectedId = nextSelectedId || null;
    listbox.innerHTML = '';
    for (const scene of scenes) {
      const li = doc.createElement('li');
      li.id = `scene-opt-${scene.id}`;
      li.className = SCENE_OPTION_CLASS;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(scene.id === selectedId));
      li.dataset.sceneId = scene.id;
      li.textContent = scene.title;
      listbox.appendChild(li);
    }
    const current = scenes.find((scene) => scene.id === selectedId);
    trigger.textContent = current ? current.title : EMPTY_LABEL;
    trigger.dataset.selectedSceneId = current ? current.id : '';
    if (isOpen()) close();
  }

  /** Disables the trigger (and closes the popup) while a scene is running. */
  function setDisabled(disabled) {
    trigger.disabled = !!disabled;
    if (disabled && isOpen()) close();
  }

  trigger.addEventListener('click', () => (isOpen() ? close() : open()), { signal });

  listbox.addEventListener('click', (event) => {
    commit(event.target.closest?.(`.${SCENE_OPTION_CLASS}`)?.dataset?.sceneId);
  }, { signal });

  trigger.addEventListener('keydown', (event) => {
    if (!isOpen()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        open();
      }
      return;
    }
    const action = handleCctvListboxKeydown(event.key, { items: optionIds(), highlightedId });
    if (!action) return;
    event.preventDefault();
    if (action.type === 'highlight') highlight(action.id);
    else if (action.type === 'commit') commit(action.id);
    else close({ returnFocus: true });
  }, { signal });

  doc.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    if (event.target?.closest?.('.scene-picker-listbox, .scene-picker-trigger')) return;
    close();
  }, { signal });

  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close({ returnFocus: true });
  }, { capture: true, signal });

  win.addEventListener('resize', () => { if (isOpen()) position(); }, { signal });

  return {
    render,
    setDisabled,
    isOpen,
    open,
    close,
    /** Removes listeners and the portaled popup. */
    destroy() {
      abort.abort();
      listbox.remove?.();
    },
  };
}
