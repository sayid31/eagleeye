// src/data/aisFeedClassify.js
// Pure AIS feed-status classification helpers extracted from aisLiveVessels.js
// (Wave 2 split #20) — zero Cesium/module-state coupling, safe to unit test
// in isolation.

/**
 * Human-readable reasons for a non-'open' AISStream feed status, keyed to the
 * server's `_aisStreamStatus` values (see vite.config.js). Surfaced verbatim in
 * the layer chip so a dead feed reads "feed down" instead of a healthy-looking
 * "just now · 0 vessels".
 */
const AIS_STATUS_REASON = {
  'missing-key': 'AISSTREAM_API_KEY belum diatur',
  unsupported: 'feed live tidak didukung',
  connecting: 'menghubungkan ke feed…',
  closed: 'feed terputus',
  error: 'feed mati',
  idle: 'feed diam',
};

/**
 * Statuses in which fresh data is flowing. 'open' is the pre-watchdog spelling
 * and is still accepted so a cached bundle and a restarted server never
 * disagree about health.
 */
export const AIS_HEALTHY_STATUSES = new Set(['live', 'open']);

/**
 * Server statuses meaning "the feed is not delivering right now". These are
 * surfaced even while cached vessels are still drawn: rows retained from
 * before the outage must never make a dead feed read as a healthy one.
 */
const AIS_DEGRADED_STATUSES = new Set(['stale', 'reconnecting', 'down', 'auth-failed']);

/**
 * Chip text for a feed the server has reported as not delivering.
 * @param {string} status - 'stale' | 'reconnecting' | 'down'
 * @param {Object} payload - Parsed /api/ais-live JSON.
 * @returns {string}
 */
function describeDegradedAisFeed(status, payload) {
  if (status === 'auth-failed') {
    // Actionable, not a countdown: retrying cannot fix a rejected credential,
    // so the chip asks the operator to do the one thing that can.
    return 'Kunci API ditolak — periksa AISSTREAM_API_KEY';
  }
  if (status === 'stale') {
    const silentSec = Math.round(Number(payload?.silentForMs) / 1000);
    return Number.isFinite(silentSec) && silentSec > 0
      ? `feed senyap ${silentSec}d — tidak ada data AIS`
      : 'feed senyap — tidak ada data AIS';
  }
  const attempt = Number(payload?.reconnectAttempt);
  const suffix = Number.isFinite(attempt) && attempt >= 1 ? ` (percobaan ${attempt})` : '';
  return status === 'down'
    ? `feed mati — mencoba lagi perlahan${suffix}`
    : `menyambung ulang ke feed…${suffix}`;
}

/**
 * Derive a surfaced error string from an /api/ais-live payload, or null when the
 * feed has accepted product data. Socket transport, message receipt, and usable
 * vessel positions are separate health stages: an open socket with no message
 * or no accepted positions must not read as a fresh successful update.
 *
 * @param {Object|null|undefined} payload - Parsed /api/ais-live JSON.
 * @param {number} acceptedRowCount - Number of rows accepted by vessel normalization.
 * @returns {string|null} A short reason for the chip, or null if healthy.
 */
export function deriveAisFeedError(payload, acceptedRowCount) {
  const status = payload && typeof payload.status === 'string' ? payload.status : null;
  // A feed the server reports as not delivering outranks the row count: the
  // cached vessels on screen are exactly what makes an outage invisible.
  if (status && AIS_DEGRADED_STATUSES.has(status)) {
    return describeDegradedAisFeed(status, payload);
  }
  if (acceptedRowCount > 0) return null; // accepted rows may be stale while reconnecting, but remain usable
  if (AIS_HEALTHY_STATUSES.has(status)) {
    return payload?.lastMessageAt
      ? 'menunggu posisi AIS yang dapat dipakai…'
      : 'menunggu pesan AIS pertama…';
  }
  if (!status) return null;
  const detail = typeof payload.error === 'string' && payload.error.trim() ? payload.error.trim() : '';
  const reason = AIS_STATUS_REASON[status] || 'feed tidak tersedia';
  return detail && !AIS_STATUS_REASON[status] ? `${reason} (${detail})` : reason;
}

/** True when a raw AIS row can enter the production vessel normalizer. */
function hasUsableVesselCoordinates(row) {
  return Number.isFinite(Number(row?.lat)) && Number.isFinite(Number(row?.lon));
}

/**
 * Classify one server snapshot before any destructive reconciliation.
 * @param {Object|null|undefined} payload - Parsed /api/ais-live payload.
 * @returns {{transportStatus: string|null, lastMessageAt: number|string|null,
 *   rawRows: Array<Object>, acceptedRows: Array<Object>, rawRowCount: number,
 *   acceptedRowCount: number, error: string|null}}
 */
export function classifyAisFeedSnapshot(payload) {
  const rawRows = Array.isArray(payload?.rows) ? payload.rows : [];
  const acceptedRows = rawRows.filter(hasUsableVesselCoordinates);
  const transportStatus = typeof payload?.status === 'string' ? payload.status : null;
  const lastMessageAt = payload?.lastMessageAt ?? null;
  const acceptedRowCount = acceptedRows.length;
  return {
    transportStatus,
    lastMessageAt,
    rawRows,
    acceptedRows,
    rawRowCount: rawRows.length,
    acceptedRowCount,
    error: deriveAisFeedError(payload, acceptedRowCount)
      || (acceptedRowCount === 0 ? 'menunggu posisi AIS yang dapat dipakai…' : null),
  };
}
