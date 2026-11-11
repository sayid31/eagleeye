/**
 * overpassSlots.mjs — process-wide cap on concurrent upstream Overpass queries.
 *
 * overpass-api.de grants each client IP a fixed number of query slots
 * (`GET /api/status` → "Rate limit: 2"); a query sent while they are all busy
 * is refused with HTTP 429 in under a second. Mapped installations and road
 * queries each run ~20–40 s, so a few camera moves used to put a third query
 * on the wire and turn a healthy upstream into an instant "unavailable".
 * Every Overpass caller goes through `fetchOverpassPayload`, which takes a
 * slot from this gate first; extra queries wait instead of being refused.
 *
 * @module data/overpassSlots
 */

/** Overpass's per-IP slot count as reported by /api/status (2026-11-11). */
export const OVERPASS_DEFAULT_SLOTS = 2;
const MAX_SLOTS = 8;

/**
 * Slot count from `GEV_OVERPASS_UPSTREAM_SLOTS` (1–8), else the default.
 * @param {Record<string, string|undefined>} [env]
 * @returns {number}
 */
export function overpassSlotLimit(env = process.env) {
  const value = Number(env.GEV_OVERPASS_UPSTREAM_SLOTS);
  return Number.isInteger(value) && value >= 1 ? Math.min(value, MAX_SLOTS) : OVERPASS_DEFAULT_SLOTS;
}

function abortReason(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : Object.assign(new Error('Overpass slot wait aborted'), { name: 'AbortError' });
}

/**
 * A FIFO counting semaphore whose waits are bounded and abortable.
 * @param {number} limit Concurrent holders allowed.
 * @param {{setTimer?: Function, clearTimer?: Function}} [timers]
 */
export function createSlotGate(limit, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let active = 0;
  const waiters = [];

  function makeRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiters.shift();
      if (next) {
        next.cleanup();
        next.resolve(makeRelease());
      } else {
        active -= 1;
      }
    };
  }

  /**
   * Wait for a slot. Resolves to a release function (idempotent). Rejects with
   * `code: 'SLOT_WAIT_TIMEOUT'` after `timeoutMs`, or with the signal's reason
   * when aborted — either way the waiter leaves the queue.
   * @param {{timeoutMs?: number, signal?: AbortSignal}} [options]
   * @returns {Promise<() => void>}
   */
  function acquire({ timeoutMs = Infinity, signal } = {}) {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (active < limit) {
      active += 1;
      return Promise.resolve(makeRelease());
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, cleanup: () => {} };
      const leave = (error) => {
        const index = waiters.indexOf(waiter);
        if (index === -1) return;
        waiters.splice(index, 1);
        waiter.cleanup();
        reject(error);
      };
      const onAbort = () => leave(abortReason(signal));
      const timer = Number.isFinite(timeoutMs)
        ? setTimer(() => leave(Object.assign(
          new Error(`no Overpass slot free within ${Math.round(timeoutMs / 1000)} s (${limit} in use)`),
          { code: 'SLOT_WAIT_TIMEOUT' },
        )), Math.max(0, timeoutMs))
        : null;
      signal?.addEventListener('abort', onAbort, { once: true });
      waiter.cleanup = () => {
        if (timer !== null) clearTimer(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      waiters.push(waiter);
    });
  }

  return {
    acquire,
    stats: () => ({ limit, active, waiting: waiters.length }),
  };
}

/** The gate every Overpass query in this process shares (survives a Vite in-process restart). */
export function getOverpassSlotGate() {
  globalThis.__GEV_OVERPASS_SLOTS__ ??= createSlotGate(overpassSlotLimit());
  return globalThis.__GEV_OVERPASS_SLOTS__;
}
