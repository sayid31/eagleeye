// src/admin/dev/lib/useAutoRefresh.js
/**
 * Call `callback` every `intervalMs` while `enabled`, but only while the tab is visible; coming back to a visible tab
 * refreshes at once. A hidden tab never polls (it would burn requests nobody sees).
 */
import { useEffect, useRef } from 'react';

/**
 * @param {string} visibilityState `document.visibilityState`.
 * @returns {boolean} Whether a refresh should run now.
 */
export const shouldPoll = (visibilityState) => visibilityState === 'visible';

/**
 * @param {() => void} callback Latest closure is always used (no need to memoize).
 * @param {{enabled: boolean, intervalMs: number}} options
 */
export function useAutoRefresh(callback, { enabled, intervalMs }) {
  const latest = useRef(callback);
  useEffect(() => { latest.current = callback; });
  useEffect(() => {
    if (!enabled) return undefined;
    const tick = () => { if (shouldPoll(document.visibilityState)) latest.current(); };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [enabled, intervalMs]);
}
