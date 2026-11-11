/**
 * sharedAbort.mjs — abort a coalesced upstream request once every client
 * waiting on it has gone.
 *
 * Coalesced proxies (`coalesceProxyRequest`) run one upstream call per key for
 * any number of HTTP clients. When a browser moves on (a new viewport) it
 * aborts its request, but the upstream call kept running and, for Overpass,
 * kept holding one of the IP's two query slots. Each client `join`s the key's
 * shared signal and `leave`s on disconnect; the last one out aborts it.
 *
 * @module server/sharedAbort
 */

/**
 * @returns {{join: (key: string, onAbandon?: () => void) => {signal: AbortSignal, leave: () => void, done: () => void, readonly left: boolean}, size: () => number}}
 */
export function createSharedAbortRegistry() {
  const entries = new Map();
  return {
    /**
     * Subscribe to `key`. `leave()` = this client disconnected; `done()` = it
     * got its answer. Both are idempotent and only the first call counts.
     * `onAbandon` runs when the last subscriber leaves (before the abort).
     */
    join(key, onAbandon) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { controller: new AbortController(), subscribers: 0, onAbandon: null };
        entries.set(key, entry);
      }
      // Per key, not per client: whoever leaves last must still run it.
      entry.onAbandon ??= onAbandon ?? null;
      entry.subscribers += 1;
      let state = 'joined';
      const exit = (abandon) => {
        if (state !== 'joined') return;
        state = abandon ? 'left' : 'done';
        entry.subscribers -= 1;
        if (entry.subscribers > 0 || entries.get(key) !== entry) return;
        entries.delete(key);
        if (!abandon) return;
        entry.onAbandon?.();
        entry.controller.abort(new Error('all clients disconnected before the upstream answered'));
      };
      return {
        signal: entry.controller.signal,
        leave: () => exit(true),
        done: () => exit(false),
        get left() { return state === 'left'; },
      };
    },
    size: () => entries.size,
  };
}
