/**
 * Filter state shared by Login Log and Audit: time range, one page-specific select (result / action), the account
 * (kept in the URL as `?userId=` so the Pengguna row menu can link to it), page size and offset. Every filter change
 * returns to the first page.
 */
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ALL } from './usersView.js';

const DEFAULT_LIMIT = 20;
const USER_PARAMS = ['userId', 'targetId'];

/** @returns {{range: string, extra: string, userId: string, limit: number, offset: number, setRange: Function, setExtra: Function, setUser: Function, setLimit: Function, setOffset: Function, reset: () => void}} */
export function useActivityFilter() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState({ range: ALL, extra: ALL, limit: DEFAULT_LIMIT, offset: 0 });
  // `targetId` is what old audit bookmarks carried.
  const userId = USER_PARAMS.map((name) => params.get(name)).find(Boolean) ?? '';

  const patch = useCallback((change) => setState((prev) => ({ ...prev, offset: 0, ...change })), []);
  const setUser = useCallback((id) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      USER_PARAMS.forEach((name) => next.delete(name));
      if (id) next.set('userId', id);
      return next;
    }, { replace: true });
    setState((prev) => ({ ...prev, offset: 0 }));
  }, [setParams]);
  const reset = useCallback(() => {
    setUser('');
    setState((prev) => ({ range: ALL, extra: ALL, limit: prev.limit, offset: 0 }));
  }, [setUser]);

  return {
    ...state,
    userId,
    setUser,
    reset,
    setRange: (range) => patch({ range }),
    setExtra: (extra) => patch({ extra }),
    setLimit: (limit) => patch({ limit }),
    setOffset: (offset) => setState((prev) => ({ ...prev, offset })),
  };
}
