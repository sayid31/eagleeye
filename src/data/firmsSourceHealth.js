/**
 * @module data/firmsSourceHealth
 * @description Health of one FIRMS refresh, judged from its per-source list
 * (`{source, count, ok, error?}`). Shared by the proxy (whether a refresh is
 * worth caching) and the layer (whether the chip may read healthy).
 *
 * A source can answer 200 with zero rows: VIIRS_SNPP_NRT did all of
 * 2026-11-11. Counting that as success let a refresh whose real sources both
 * failed be cached as a fresh, empty world — "Live" with no fires (staging).
 */

/** Short operator label: `VIIRS_NOAA20_NRT` → `NOAA-20`. */
function sourceLabel(source) {
  const match = String(source || '').match(/VIIRS_(NOAA)(\d+)_|VIIRS_(SNPP)_/);
  if (!match) return String(source || 'sumber');
  return match[1] ? `NOAA-${match[2]}` : 'SNPP';
}

/**
 * Whether a refresh produced data worth caching: at least one source answered
 * AND returned detections. Worldwide, a day with zero VIIRS detections does
 * not happen; zero means the feed is broken, not that the planet stopped burning.
 * @param {Array<{ok: boolean, count: number}>|null|undefined} sources
 * @returns {boolean}
 */
export function firmsRefreshUsable(sources) {
  return Array.isArray(sources) && sources.some((s) => s?.ok && Number(s.count) > 0);
}

/**
 * One log line naming each source's outcome: `NOAA-20: timeout 60 s; NOAA-21: HTTP 429; SNPP: 0 rows`.
 * @param {Array<{source: string, ok: boolean, count: number, error?: string}>} sources
 * @returns {string}
 */
export function firmsSourceSummary(sources) {
  return (sources || []).map((s) => {
    const label = sourceLabel(s.source);
    if (!s.ok) return `${label}: ${s.error || 'failed'}`;
    return `${label}: ${Number(s.count) > 0 ? `${s.count} rows` : '0 rows'}`;
  }).join('; ');
}

/**
 * Chip reason when some sources failed but the payload still carries data, or null.
 * @param {Array<{source: string, ok: boolean, count: number}>|null|undefined} sources
 * @returns {string|null}
 */
export function firmsPartialFailureReason(sources) {
  const failed = (sources || []).filter((s) => !s?.ok).map((s) => sourceLabel(s.source));
  return failed.length ? `sumber FIRMS gagal: ${failed.join(', ')}` : null;
}
