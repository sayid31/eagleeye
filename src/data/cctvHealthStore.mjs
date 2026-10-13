/**
 * cctvHealthStore.mjs — bounded per-camera health registry for the CCTV proxy.
 * Node-only.
 */

/**
 * Create a health store that evicts the oldest camera once `maxEntries` is reached,
 * so observability can't grow without bound. Size it to the full served catalog so
 * live cameras aren't silently evicted.
 *
 * @param {number} maxEntries
 * @returns {{ set: (cameraId: string, patch: object) => void, list: () => object[] }}
 */
export function createCctvHealthStore(maxEntries) {
  /** @type {Map<string,{id:string,status:string,sourceKind:string,label:string,message:string,updatedAt:number}>} */
  const health = new Map();

  return {
    /** Merge `patch` into the camera's entry (unset fields keep their previous value). */
    set(cameraId, patch) {
      if (!health.has(cameraId) && health.size >= maxEntries) {
        health.delete(health.keys().next().value);
      }
      const prev = health.get(cameraId) || {};
      health.set(cameraId, {
        id: cameraId,
        status: patch.status || prev.status || 'unknown',
        sourceKind: patch.sourceKind || prev.sourceKind || 'unknown',
        label: patch.label || prev.label || '',
        message: patch.message || prev.message || '',
        updatedAt: Date.now(),
      });
    },
    /** Snapshot every entry as an array. */
    list() {
      return Array.from(health.values());
    },
  };
}
