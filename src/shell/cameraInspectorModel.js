// Pure view-model for the camera search: matching and ranking over the public
// CCTV state. Nothing here touches the DOM or Cesium, so it runs under node:test.
/** Status-dot tone for a camera's health status. */
export function statusTone(sourceStatus) {
  if (sourceStatus === 'ok') return 'ok';
  if (sourceStatus === 'offline' || sourceStatus === 'error') return 'off';
  if (sourceStatus === 'unknown' || !sourceStatus) return 'idle';
  return 'warn';
}

// Rendering cap only (keeps the DOM light for a province-wide query); the true
// match count is always returned so the UI can say how many were not shown.
export const SEARCH_LIMIT = 200;

/**
 * Cameras matching a free-text query on name, city, id or operator. Names that
 * start with the query rank first, then the rest in catalog order.
 * @param {string} query
 * @param {object[]} cameras
 * @param {number} [limit]
 * @returns {{items: {id: string, name: string, city: string, tone: string}[], total: number}}
 *   `items` is capped at `limit`; `total` is every match.
 */
export function searchCameras(query, cameras, limit = SEARCH_LIMIT) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return { items: [], total: 0 };
  const hits = [];
  for (const cam of cameras || []) {
    const name = String(cam.name || cam.id || '').toLowerCase();
    const haystack = [name, cam.city, cam.id, cam.provider]
      .map((part) => String(part || '').toLowerCase());
    if (!haystack.some((part) => part.includes(needle))) continue;
    hits.push({ rank: name.startsWith(needle) ? 0 : 1, cam });
  }
  // Array.prototype.sort is stable, so equal ranks keep catalog order.
  hits.sort((a, b) => a.rank - b.rank);
  const items = hits.slice(0, limit).map(({ cam }) => ({
    id: cam.id, name: cam.name || cam.id, city: cam.city || '', tone: statusTone(cam.sourceStatus),
  }));
  return { items, total: hits.length };
}
