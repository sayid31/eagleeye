/**
 * One API call at a time for a dialog: its busy flag and the Indonesian sentence of a failure (never a raw code).
 * `run` resolves to the call's result, or undefined when it failed (the sentence is then in `error`).
 */
import { useCallback, useState } from 'react';
import { errorMessage } from '@/copy/en/errors';

/**
 * @returns {{busy: boolean, error: string, failure: unknown, run: <T>(call: () => Promise<T>) => Promise<T | undefined>, clear: () => void}}
 */
export function useAsyncAction() {
  const [state, setState] = useState({ busy: false, error: '', failure: null });
  const run = useCallback(async (call) => {
    setState({ busy: true, error: '', failure: null });
    try {
      const result = await call();
      setState({ busy: false, error: '', failure: null });
      return result;
    } catch (failure) {
      setState({ busy: false, error: errorMessage(failure), failure });
      return undefined;
    }
  }, []);
  const clear = useCallback(() => setState((prev) => ({ ...prev, error: '', failure: null })), []);
  return { ...state, run, clear };
}
