// The top-bar search box. It owns no navigation: Enter hands the query to the
// existing location search so its flight/hand-off rules (navigation
// generations, deferred restore) stay in one place.

/** Fired on `window` when a location-search flight lands on the searched place. */
export const LOCATION_SEARCH_ARRIVED_EVENT = 'gev:location-search-arrived';

/**
 * Wire the shell search input to the legacy location search. The query stays
 * visible while the camera travels and is cleared on arrival, unless the user
 * has typed something else in the meantime.
 * @param {{input: HTMLInputElement, legacy: HTMLInputElement|null, eventTarget?: EventTarget}} deps
 * @returns {() => void} disposer
 */
export function mountShellSearch({ input, legacy, eventTarget = window }) {
  let submitted = null;
  const onKey = (event) => {
    const query = input.value.trim();
    if (event.key !== 'Enter' || !legacy || !query) return;
    submitted = query;
    legacy.value = query;
    legacy.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.blur();
  };
  const onArrived = () => {
    if (submitted !== null && input.value.trim() === submitted) input.value = '';
    submitted = null;
  };
  input.addEventListener('keydown', onKey);
  eventTarget.addEventListener(LOCATION_SEARCH_ARRIVED_EVENT, onArrived);
  return () => {
    input.removeEventListener('keydown', onKey);
    eventTarget.removeEventListener(LOCATION_SEARCH_ARRIVED_EVENT, onArrived);
  };
}
