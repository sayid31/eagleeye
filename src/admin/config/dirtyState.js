// src/admin/config/dirtyState.js
/**
 * Dirty-state of a settings form: a deep, key-order-independent comparison of the editable form against the last saved
 * snapshot. Pure — no DOM.
 *
 * @module admin/config/dirtyState
 */

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

/** True when the two form states differ in any value. */
export const isDirty = (current, saved) => JSON.stringify(canonical(current)) !== JSON.stringify(canonical(saved));

/** True for a plain, same-origin click on a link that would leave the page (new tab, modifier keys and downloads excluded). */
export function isLeavingClick(event, anchor, origin) {
  if (!anchor || event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return false;
  const url = new URL(href, origin);
  return url.origin === origin;
}
