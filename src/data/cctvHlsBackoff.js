// Exponential backoff shared by the hls.js self-heal controller and the
// native-HLS watcher, so both rebuild a dead feed on the same schedule.

/**
 * Exponential backoff for the nth consecutive rebuild (1-based).
 * @param {number} attempt
 * @param {{baseMs: number, maxMs: number}} limits
 * @returns {number} Delay in milliseconds.
 */
export function nextReattachDelayMs(attempt, { baseMs, maxMs }) {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}
