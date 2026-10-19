// Moved out of aisLiveVessels.js (aisLiveVesselsSession).

import { geoidHeight } from './geoid.js';
import { AIS_HEALTHY_STATUSES, classifyAisFeedSnapshot, deriveAisFeedError } from './aisFeedClassify.js';
import { AIS_FIRST_CONNECT_GRACE_MS, AIS_FIRST_CONNECT_LABEL, DEFAULT_API_URL, state } from './aisLiveVesselsConstants.js';
import { reconcileVessels, renderRowLimit } from './aisLiveVesselsRecords.js';
import { S } from './aisLiveVesselsState.js';

/**
 * Seconds until the server's next reconnect attempt, or 0 when none is
 * scheduled. Mirrors the flights layer's `retryInSec` chip affordance.
 * @returns {number}
 */
export function aisRetryInSec() {
  // A rejected key is terminal until someone changes it; an hour-long
  // countdown would imply waiting is the fix.
  if (state.transportStatus === 'auth-failed') return 0;
  const at = Number(state.nextAttemptAt);
  if (!Number.isFinite(at) || at <= 0) return 0;
  return Math.max(0, Math.ceil((at - S._aisRuntime.now()) / 1000));
}

/**
 * Geoid undulation N at (lat, lon), or null until the grid has loaded.
 * @param {number} lat
 * @param {number} lon
 * @returns {number|null}
 */
export function currentGeoidN(lat, lon) {
  return S._geoidReady ? geoidHeight(lat, lon) : null;
}

export function clearFirstConnectTimer() {
  if (state.firstConnectTimer === null) return;
  S._aisRuntime.clearTimeout(state.firstConnectTimer);
  state.firstConnectTimer = null;
}

export function invalidateAisSession() {
  clearFirstConnectTimer();
  state.sessionId = ++S._aisSessionSequence;
  state.firstConnectPhase = 'idle';
  state.firstConnectStartedAt = null;
  state.firstConnectDeadline = null;
}

export function beginAisSession() {
  clearFirstConnectTimer();
  const sessionId = ++S._aisSessionSequence;
  const startedAt = S._aisRuntime.now();
  state.sessionId = sessionId;
  state.firstConnectPhase = 'loading';
  state.firstConnectStartedAt = startedAt;
  state.firstConnectDeadline = startedAt + AIS_FIRST_CONNECT_GRACE_MS;
  state.error = null;
  state.loadingLabel = AIS_FIRST_CONNECT_LABEL;
  scheduleFirstConnectExpiry(sessionId, AIS_FIRST_CONNECT_GRACE_MS);
}

function scheduleFirstConnectExpiry(sessionId, delayMs) {
  state.firstConnectTimer = S._aisRuntime.setTimeout(() => {
    if (
      !state.enabled
      || state.sessionId !== sessionId
      || state.firstConnectPhase !== 'loading'
    ) return;
    const remainingMs = state.firstConnectDeadline - S._aisRuntime.now();
    if (remainingMs > 0) {
      scheduleFirstConnectExpiry(sessionId, remainingMs);
      return;
    }
    state.firstConnectTimer = null;
    state.firstConnectPhase = 'unavailable';
    state.loadingLabel = '';
    state.error = state.lastMessageAt
      ? 'menunggu posisi AIS yang dapat dipakai…'
      : 'menunggu pesan AIS pertama…';
    state.stale = state.count > 0;
  }, delayMs);
}

function settleFirstConnectPhase(phase) {
  clearFirstConnectTimer();
  state.firstConnectPhase = phase;
  state.loadingLabel = '';
}

function isGraceEligibleTransport(status) {
  return AIS_HEALTHY_STATUSES.has(status) || status === 'connecting';
}

function isDefinitiveTransportFailure(status) {
  return Boolean(status) && !isGraceEligibleTransport(status);
}

function markAisUnavailable(reason) {
  settleFirstConnectPhase('unavailable');
  state.error = reason || 'Pemuatan AIS live gagal';
  state.stale = state.count > 0;
}

export async function loadLivePositions(viewer) {
  if (!viewer || state.loading) return;
  state.loading = true;
  state.loadingLabel = state.loaded ? 'memperbarui...' : 'memuat...';
  const requestController = new AbortController();
  const requestSessionId = state.sessionId;
  state.abort = requestController;

  try {
    const url = liveApiUrl();
    // Combine the layer's teardown-abort with a hard timeout so a hung upstream
    // can't wedge the poll indefinitely (parity with the track fetch + flights).
    const signal = typeof AbortSignal.any === 'function'
      ? AbortSignal.any([requestController.signal, AbortSignal.timeout(10000)])
      : requestController.signal;
    const response = await fetch(url, {
      signal,
      cache: 'no-store',
    });
    if (!ownsAisRequest(requestController, requestSessionId)) return;
    if (!response.ok) {
      // The 503 key-absent / 502 stream-error bodies still carry {status,error}.
      // Prefer a clean surfaced reason over a cryptic "AIS live HTTP 503".
      let reason = `AIS live HTTP ${response.status}`;
      try {
        const errPayload = await response.json();
        if (!ownsAisRequest(requestController, requestSessionId)) return;
        reason = deriveAisFeedError(errPayload, 0)
          || (typeof errPayload?.error === 'string' && errPayload.error.trim()) || reason;
      } catch { /* non-JSON body — keep the HTTP status reason */ }
      throw new Error(reason);
    }

    const payload = await response.json();
    if (!ownsAisRequest(requestController, requestSessionId)) return;
    applyAisFeedSnapshot(viewer, payload);
  } catch (error) {
    if (ownsAisRequest(requestController, requestSessionId) && error?.name !== 'AbortError') {
      markAisUnavailable(error?.message || 'Pemuatan AIS live gagal');
      console.warn('[Data:ais-live-vessels]', state.error, error);
    }
  } finally {
    if (state.abort === requestController && state.sessionId === requestSessionId) {
      state.loading = false;
      state.loadingLabel = state.firstConnectPhase === 'loading'
        ? AIS_FIRST_CONNECT_LABEL
        : '';
      state.abort = null;
    }
  }
}

/** True while a request still owns this enabled layer lifecycle. */
function ownsAisRequest(controller, sessionId) {
  return state.enabled
    && state.sessionId === sessionId
    && state.abort === controller
    && !controller.signal.aborted;
}

/** Apply a classified snapshot while preserving warm state on zero accepted rows. */
export function applyAisFeedSnapshot(viewer, payload) {
  const snapshot = classifyAisFeedSnapshot(payload);
  state.loaded = true;
  state.loadingLabel = '';
  state.transportStatus = snapshot.transportStatus;
  state.nextAttemptAt = Number(payload?.nextAttemptAt) || null;
  state.lastMessageAt = snapshot.lastMessageAt;
  state.rawRowCount = snapshot.rawRowCount;
  state.acceptedRowCount = snapshot.acceptedRowCount;

  if (snapshot.acceptedRowCount === 0) {
    state.count = state.vesselRecords.length;
    state.stale = state.count > 0 || Boolean(payload?.refreshing);
    if (isDefinitiveTransportFailure(snapshot.transportStatus)) {
      markAisUnavailable(snapshot.error);
      return { reconciled: false, ...snapshot };
    }
    if (
      state.firstConnectPhase === 'loading'
      && isGraceEligibleTransport(snapshot.transportStatus)
    ) {
      state.error = null;
      state.loadingLabel = AIS_FIRST_CONNECT_LABEL;
      return { reconciled: false, ...snapshot };
    }
    if (state.firstConnectPhase === 'loading') {
      markAisUnavailable(snapshot.error);
      return { reconciled: false, ...snapshot };
    }
    state.error = snapshot.error;
    return { reconciled: false, ...snapshot };
  }

  settleFirstConnectPhase('ready');
  reconcileVessels(viewer, snapshot.acceptedRows);
  state.count = state.vesselRecords.length;
  state.stale = Boolean(payload?.refreshing);
  state.newestPositionAt = payload?.newestPositionAt || null;
  // Not unconditionally null: a degraded feed keeps its reason even though the
  // cached vessels are still drawable, so the chip cannot go quiet on an
  // outage the user is still looking at.
  state.error = snapshot.error;
  state.lastUpdate = S._aisRuntime.now();
  return { reconciled: true, ...snapshot };
}

function liveApiUrl() {
  const base = import.meta.env?.VITE_AIS_LIVE_API_URL || DEFAULT_API_URL;
  const url = new URL(base, window.location.origin);
  url.searchParams.set('maxRows', String(renderRowLimit()));
  return url.toString();
}
