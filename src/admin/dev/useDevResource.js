// src/admin/dev/useDevResource.js
/** React hook: load one `/dev` resource with loading / error / reload state. */
import { useCallback, useEffect, useState } from 'react';

/**
 * @template T
 * @param {() => Promise<T>} fetcher Stable function (module-level API call).
 * @returns {{data: T | null, error: string, loading: boolean, reload: () => Promise<void>}}
 */
export function useDevResource(fetcher) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetcher());
      setError('');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [fetcher]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload };
}
