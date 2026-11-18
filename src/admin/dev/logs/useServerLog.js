// src/admin/dev/logs/useServerLog.js
/**
 * State of the Log server tab: filter, server page (limit/offset), the current reply and a silent refresh used by the
 * auto-refresh. A reply that arrives after a newer request was sent is dropped. Changing a filter returns to page 1.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '@/components/app/dataTableView.js';
import { useDebouncedValue } from '../lib/useDebouncedValue.js';
import { fetchLog } from './logsApi.js';
import { EMPTY_FILTER, filterQuery } from './serverLogView.js';

/** Pause after the last keystroke before the search text is sent to the server. */
export const SEARCH_DEBOUNCE_MS = 300;

/** @returns {{filter: object, page: {limit: number, offset: number}, data: object | null, error: unknown, loading: boolean,
 *   updateFilter: (patch: object) => void, setOffset: (offset: number) => void, setLimit: (limit: number) => void,
 *   reload: (options?: {silent?: boolean}) => Promise<void>}} */
export function useServerLog() {
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [page, setPage] = useState({ limit: DEFAULT_PAGE_SIZE, offset: 0 });
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const sentQuery = useDebouncedValue(filter.q, SEARCH_DEBOUNCE_MS);
  const query = useMemo(() => filterQuery({ ...filter, q: sentQuery }, page), [filter, sentQuery, page]);
  const latest = useRef(0);

  const reload = useCallback(async ({ silent = false } = {}) => {
    latest.current += 1;
    const ticket = latest.current;
    if (!silent) setState((current) => ({ ...current, loading: true }));
    try {
      const data = await fetchLog(query);
      if (ticket === latest.current) setState({ data, error: null, loading: false });
    } catch (failure) {
      if (ticket === latest.current) setState((current) => ({ ...current, error: failure, loading: false }));
    }
  }, [query]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => () => { latest.current = Number.MAX_SAFE_INTEGER; }, []);

  return {
    filter, page, ...state, reload,
    updateFilter: (patch) => { setFilter((current) => ({ ...current, ...patch })); setPage((current) => ({ ...current, offset: 0 })); },
    setOffset: (offset) => setPage((current) => ({ ...current, offset })),
    setLimit: (limit) => setPage({ limit, offset: 0 }),
  };
}
