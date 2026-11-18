// src/admin/config/useProviderKeys.js
/**
 * Load/save state of the provider keys: one GET of /api/admin/keys, replaced by the status a save returns. A save
 * restarts the dev server (the page reloads itself), so `restarting` stays true afterwards and the buttons stay off.
 * Connection-test results are kept per provider for this visit only (the server does not store them).
 */
import { useCallback, useState } from 'react';
import { fetchKeyStatus } from '../api/adminKeysApi.js';
import { useResource } from '../users/useResource.js';

const load = () => fetchKeyStatus();

/** @returns {{payload: object | null, loading: boolean, error: unknown, reload: () => void, restarting: boolean, tests: Record<string, {result: string, at: number}>, applySaved: (reply: {status: object}) => void, recordTest: (id: string, outcome: {result?: string}) => void}} */
export function useProviderKeys() {
  const { data, loading, error, reload } = useResource(load, 'provider-keys');
  const [saved, setSaved] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [tests, setTests] = useState({});
  const applySaved = useCallback((reply) => { setSaved(reply.status); setRestarting(true); }, []);
  const recordTest = useCallback((id, outcome) => setTests((current) => ({ ...current, [id]: { result: outcome?.result ?? 'unknown', at: Date.now() } })), []);
  return { payload: saved ?? data, loading, error, reload, restarting, tests, applySaved, recordTest };
}
