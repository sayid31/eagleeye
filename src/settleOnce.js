/**
 * One-shot deferred: a promise plus a `settle` that resolves it at most once.
 * Later `settle` calls are ignored, so every terminal path (success, failure,
 * dispose) can call it unconditionally without racing the first caller.
 * @template T
 * @returns {{promise: Promise<T>, settle: (value: T) => boolean, isSettled: () => boolean}}
 */
export function createSettleOnce() {
  let resolvePromise;
  let settled = false;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });
  return {
    promise,
    settle(value) {
      if (settled) return false;
      settled = true;
      resolvePromise(value);
      return true;
    },
    isSettled: () => settled,
  };
}
