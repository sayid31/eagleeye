// Moves the visual-style picker (#control-panel) from the bottom dock into the
// icon rail. DOM only, no Cesium, so it is testable with a stand-in document.
import { RAIL_STYLE_SLOT_ID } from './shellMarkup.js';

const STYLE_PICKER_TITLE = 'Gaya visual';

/**
 * Move the visual-style picker (#control-panel) from the bottom dock into the
 * rail's bottom slot, leaving only the mic in the dock. The element is moved,
 * not rebuilt, so its open/close, pin and share-link wiring keep working.
 * @returns {() => void} Puts the picker back where it was.
 */
export function mountStylePicker() {
  const picker = document.getElementById('control-panel');
  const slot = document.getElementById(RAIL_STYLE_SLOT_ID);
  if (!picker || !slot) return () => {};
  const home = picker.parentNode;
  const nextSibling = picker.nextSibling;
  const toggle = picker.querySelector('#control-panel-toggle');
  const priorTitle = toggle?.getAttribute('title');
  slot.append(picker);
  toggle?.setAttribute('title', STYLE_PICKER_TITLE);
  return () => {
    home?.insertBefore(picker, nextSibling?.parentNode === home ? nextSibling : null);
    if (priorTitle == null) toggle?.removeAttribute('title');
    else toggle?.setAttribute('title', priorTitle);
  };
}
