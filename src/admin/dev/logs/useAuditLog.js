// src/admin/dev/logs/useAuditLog.js
/**
 * State of the audit tab. The audit API has no total, only `nextOffset`, so pages accumulate ("Muat lebih banyak")
 * instead of paginating; changing the type starts over. A stale reply (older request) is dropped.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_TYPES, auditTypeParam } from './auditView.js';
import { fetchAudit } from './logsApi.js';

const EMPTY = Object.freeze({ entries: [], nextOffset: null, error: null, loading: true, loadingMore: false });

/** @returns {{type: string, setType: (type: string) => void, entries: object[], nextOffset: number | null, error: unknown,
 *   loading: boolean, loadingMore: boolean, loadMore: () => Promise<void>, reload: () => Promise<void>}} */
export function useAuditLog() {
  const [type, setType] = useState(ALL_TYPES);
  const [state, setState] = useState(EMPTY);
  const latest = useRef(0);

  const load = useCallback(async (offset) => {
    latest.current += 1;
    const ticket = latest.current;
    setState((current) => (offset ? { ...current, loadingMore: true } : { ...current, loading: true, error: null }));
    try {
      const page = await fetchAudit({ type: auditTypeParam(type), offset });
      if (ticket !== latest.current) return;
      setState((current) => ({
        entries: offset ? [...current.entries, ...page.entries] : page.entries,
        nextOffset: page.nextOffset, error: null, loading: false, loadingMore: false,
      }));
    } catch (failure) {
      if (ticket === latest.current) setState((current) => ({ ...current, error: failure, loading: false, loadingMore: false }));
    }
  }, [type]);

  useEffect(() => { void load(0); }, [load]);
  useEffect(() => () => { latest.current = Number.MAX_SAFE_INTEGER; }, []);

  return {
    type, setType, ...state,
    reload: () => load(0),
    loadMore: () => (state.nextOffset ? load(state.nextOffset) : Promise.resolve()),
  };
}
