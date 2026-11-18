/**
 * Toolbar state of the Pengguna page: the search box is debounced into the applied filter, and any change of a filter
 * or of the page size sends the list back to the first page.
 */
import { useCallback, useEffect, useState } from 'react';
import { ALL, USERS_PAGE_SIZE } from './usersView.js';

/** Pause after the last keystroke before the list is queried. */
export const SEARCH_DEBOUNCE_MS = 300;

const INITIAL = Object.freeze({ search: '', status: ALL, role: ALL, limit: USERS_PAGE_SIZE, offset: 0 });

/** @returns {{input: string, setInput: (value: string) => void, filter: typeof INITIAL, setStatus: Function, setRole: Function, setLimit: Function, setOffset: Function, reset: () => void}} */
export function useUsersFilter() {
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState(INITIAL);

  useEffect(() => {
    const timer = setTimeout(() => setFilter((prev) => (prev.search === input.trim() ? prev : { ...prev, search: input.trim(), offset: 0 })), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const patch = useCallback((change) => setFilter((prev) => ({ ...prev, ...change })), []);
  const setStatus = useCallback((status) => patch({ status, offset: 0 }), [patch]);
  const setRole = useCallback((role) => patch({ role, offset: 0 }), [patch]);
  const setLimit = useCallback((limit) => patch({ limit, offset: 0 }), [patch]);
  const setOffset = useCallback((offset) => patch({ offset }), [patch]);
  const reset = useCallback(() => { setInput(''); setFilter((prev) => ({ ...INITIAL, limit: prev.limit })); }, []);
  return { input, setInput, filter, setStatus, setRole, setLimit, setOffset, reset };
}
