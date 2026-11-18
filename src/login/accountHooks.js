/**
 * React helper of the account pages: load `/api/me` (leaving for the login
 * page when the session is gone), with a retry for the error state.
 *
 * @module login/accountHooks
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchMe } from '../auth/authClientApi.js';
import { loginUrlFor } from '../auth/nextPath.mjs';

/**
 * `/api/me` for a page that needs a session. No session → the login page.
 * @param {{extra?: () => Promise<unknown>}} [options] A second load run in parallel (its result is
 *   `extra`); pass a stable (module-level) function, it is an effect dependency.
 * @returns {{status: 'loading' | 'ready' | 'error', data: import('../auth/authClientApi.js').MePayload | null,
 *   extra: unknown, reload: () => void}} `reload` runs the load again (the error state's "Coba lagi").
 */
export function useMe({ extra } = {}) {
  const [state, setState] = useState({ status: 'loading', data: null, extra: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMe(), extra ? extra() : null])
      .then(([me, more]) => {
        if (cancelled) return;
        if (!me.signedIn) { window.location.replace(loginUrlFor(window.location.pathname, '', 'session')); return; }
        setState({ status: 'ready', data: me, extra: more });
      })
      .catch((failure) => {
        console.warn(`[account] could not load the account: ${failure.message}`);
        if (!cancelled) setState({ status: 'error', data: null, extra: null });
      });
    return () => { cancelled = true; };
  }, [extra, attempt]);
  const reload = useCallback(() => {
    setState({ status: 'loading', data: null, extra: null });
    setAttempt((count) => count + 1);
  }, []);
  return { ...state, reload };
}
