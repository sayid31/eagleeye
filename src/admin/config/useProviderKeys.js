// src/admin/config/useProviderKeys.js
/**
 * Load/save state of the provider keys: one GET of /api/admin/keys, replaced by the status a save returns. A save
 * restarts the dev server (the page reloads itself), so `restarting` stays true afterwards and the buttons stay off.
 * Connection-test results are kept per provider for this visit only (the server does not store them); a test started
 * from a table row (`runTest`) and one from the key sheet (`recordTest`) land in the same map.
 */
import { useCallback, useState } from 'react';
import { fetchKeyStatus, testKey } from '../api/adminKeysApi.js';
import { useResource } from '../users/useResource.js';
import { failureMessage } from './failureMessage.js';

const load = () => fetchKeyStatus();

/** @returns {{payload: object | null, loading: boolean, error: unknown, reload: () => void, restarting: boolean, tests: Record<string, {result: string, at: number, message?: string}>, testing: Record<string, boolean>, applySaved: (reply: {status: object}) => void, recordTest: (id: string, outcome: {result?: string, message?: string}) => void, runTest: (id: string) => Promise<void>}} */
export function useProviderKeys() {
  const { data, loading, error, reload } = useResource(load, 'provider-keys');
  const [saved, setSaved] = useState(null);
  const [restarting, setRestarting] = useState(false);
  const [tests, setTests] = useState({});
  const [testing, setTesting] = useState({});
  const applySaved = useCallback((reply) => { setSaved(reply.status); setRestarting(true); }, []);
  const recordTest = useCallback((id, outcome) => setTests((current) => ({
    ...current,
    [id]: { result: outcome?.result ?? 'unknown', at: Date.now(), ...(outcome?.message ? { message: outcome.message } : {}) },
  })), []);
  const runTest = useCallback(async (id) => {
    setTesting((current) => ({ ...current, [id]: true }));
    try {
      recordTest(id, await testKey(id));
    } catch (failure) {
      recordTest(id, { result: 'error', message: failureMessage(failure) });
    } finally {
      setTesting((current) => ({ ...current, [id]: false }));
    }
  }, [recordTest]);
  return { payload: saved ?? data, loading, error, reload, restarting, tests, testing, applySaved, recordTest, runTest };
}
