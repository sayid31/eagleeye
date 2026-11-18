// src/admin/dev/lib/useDevResource.js
/** React hook: load one `/dev` resource with loading / error / reload state, keeping the last data while reloading. */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @template T
 * @param {() => Promise<T>} fetcher Stable function (module-level API call).
 * @returns {{data: T | null, error: unknown, loading: boolean, reload: () => Promise<void>}}
 *   `error` is the thrown value (pass it to ErrorState, which words it); it clears on the next success.
 */
export function useDevResource(fetcher) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const data = await fetcher();
      if (alive.current) setState({ data, error: null, loading: false });
    } catch (failure) {
      if (alive.current) setState((current) => ({ ...current, error: failure, loading: false }));
    }
  }, [fetcher]);
  useEffect(() => { void reload(); }, [reload]);
  return { ...state, reload };
}
