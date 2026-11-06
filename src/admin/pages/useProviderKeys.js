// src/admin/pages/useProviderKeys.js
/**
 * Shared load/save state for pages that show provider-key cards (API Keys,
 * AI Provider): one GET of /api/admin/keys, one PUT per save. A successful
 * save restarts the dev server and the page reloads itself, so the save
 * buttons stay disabled after success.
 */
import { useEffect, useState } from 'react';
import { fetchKeyStatus, saveKeys } from '../api/adminKeysApi.js';

export const RESTART_MESSAGE = 'Saved. The server is restarting so every feature picks up the change; this page reloads by itself.';

/** @returns {{data: object|null, loadError: string, status: object|null, busy: boolean, submit: (updates: object) => Promise<void>}} */
export function useProviderKeys() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchKeyStatus()
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, []);

  const submit = async (updates) => {
    setBusy(true);
    setStatus(null);
    try {
      const saved = await saveKeys(updates);
      setData(saved.status);
      setStatus({ message: RESTART_MESSAGE });
    } catch (error) {
      setStatus({ errors: [error.message] });
      setBusy(false);
    }
  };

  return { data, loadError, status, busy, submit };
}
