// Reload the active CCTV HLS feed when the tab comes back after being hidden.
//
// hls.js has no visibility handling, and a hidden tab throttles the timers that
// drive its playlist reloads and fragment loads. After a long hide the player
// still holds a playlist (and a playhead) from before, so it asks the upstream
// for segments that were deleted while the tab was away: a 404 that hls.js does
// not retry, costing a recovery cycle and a freeze. `loadSource()` on the
// attached instance is a clean restart (fresh playlist, playhead back at the
// live edge), unlike `startLoad(-1)`, which resumes from the stale last
// currentTime.

import { HLS_RELOAD_AFTER_HIDDEN_MS } from './cctvConstants.js';

/**
 * Listen for the tab becoming visible again and restart the active feed's
 * hls.js instance when the tab was hidden for at least `minHiddenMs`.
 *
 * @param {Object} options
 * @param {{ visibilityState: string, addEventListener: Function, removeEventListener: Function }} options.doc
 * @param {() => ({ url: string|null, loadSource: (url: string) => void }|null)} options.getHls
 *   Returns the hls.js instance that should be live right now, or null.
 * @param {() => number} [options.now]
 * @param {number} [options.minHiddenMs]
 * @returns {() => void} Uninstall function.
 */
export function installHlsTabReturnReload({
  doc,
  getHls,
  now = Date.now,
  minHiddenMs = HLS_RELOAD_AFTER_HIDDEN_MS,
}) {
  let hiddenAt = null;
  const onVisibilityChange = () => {
    if (doc.visibilityState === 'hidden') {
      hiddenAt = now();
      return;
    }
    if (hiddenAt === null) return;
    const hiddenForMs = now() - hiddenAt;
    hiddenAt = null;
    if (hiddenForMs < minHiddenMs) return;
    const hls = getHls();
    if (!hls?.url) return;
    try {
      hls.loadSource(hls.url);
    } catch (error) {
      console.warn(`[CCTV] HLS reload after ${Math.round(hiddenForMs / 1000)}s hidden failed:`, error);
    }
  };
  doc.addEventListener('visibilitychange', onVisibilityChange);
  return () => doc.removeEventListener('visibilitychange', onVisibilityChange);
}
