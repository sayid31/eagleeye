/**
 * Loader hook of the user-management pages: `load()` runs whenever `key` (the serialized request) changes or
 * `reload()` is called. The previous data stays visible while a reload is in flight (the table dims instead of
 * flashing a skeleton); a failure keeps the error object for `ErrorState`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @template T
 * @param {() => Promise<T>} load
 * @param {string} key Serialized request; a new key triggers a load.
 * @returns {{data: T | null, loading: boolean, error: unknown, reload: () => void}}
 */
export function useResource(load, key) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const latest = useRef(load);
  latest.current = load;

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    latest.current()
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((error) => { if (!cancelled) setState({ data: null, loading: false, error }); });
    return () => { cancelled = true; };
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { ...state, reload };
}
