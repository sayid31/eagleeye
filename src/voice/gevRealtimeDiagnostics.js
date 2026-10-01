// GevRealtimeController event send, error reporting and diagnostics.
import { CALL_DEDUPE_MS, DEBUG_LOG_URL, ERROR_LOG_LIMIT } from './gevRealtimeConstants.js';
import { createErrorRecord, formatErrorForDisplay, storeErrors } from './gevRealtimeErrors.js';
import { postDebugLog, sanitizeDebugValue } from './gevRealtimeDebug.js';

export const diagnosticsMixin = {
sendRealtimeEvent(message, logEventName = 'client.event') {
    if (!this.dc || this.dc.readyState !== 'open') return false;
    this.debugLog(logEventName, {
      type: message?.type || null,
      message,
    });
    // A dc.send() that exceeds the SCTP send-buffer / max message size throws.
    // If that throw escaped it would abort handleRealtimeEvent BEFORE
    // queueResponseCreate + setStatus('listening'), stranding the turn at
    // EXECUTING. Swallow it and signal failure so callers can fall through
    // without the offending payload (M13).
    try {
      this.dc.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.debugLog('client.send.failed', {
        logEventName,
        type: message?.type || null,
        error: error?.message || String(error),
      });
      return false;
    }
  },

reportError(source, error = null, extra = {}) {
    const record = createErrorRecord(source, error, extra);
    this.errors.unshift(record);
    this.errors.length = Math.min(this.errors.length, ERROR_LOG_LIMIT);
    storeErrors(this.errors);
    console.error('[GEV Realtime]', record);
    this.debugLog('error', record);
    this.setStatus('error', formatErrorForDisplay(record));
    return record;
  },

connectionDiagnostics(dataChannel = this.dc) {
    return {
      dataChannelState: dataChannel?.readyState || null,
      connectionState: this.pc?.connectionState || null,
      iceConnectionState: this.pc?.iceConnectionState || null,
      iceGatheringState: this.pc?.iceGatheringState || null,
      signalingState: this.pc?.signalingState || null,
      sctpState: this.pc?.sctp?.transport?.state || null,
    };
  },

getDiagnostics() {
    return {
      status: this.status,
      connection: this.connectionDiagnostics(),
      recentErrors: this.errors.slice(),
      debugLog: {
        endpoint: DEBUG_LOG_URL,
        file: '.gev-logs/realtime-conversations.jsonl',
        sessionId: this.sessionId,
      },
      cost: this.costTracker.state(),
    };
  },

pruneProcessedCalls() {
    const cutoff = performance.now() - CALL_DEDUPE_MS;
    for (const [key, timestamp] of this.processedCalls) {
      if (timestamp < cutoff) this.processedCalls.delete(key);
    }
  },

debugLog(event, payload = {}) {
    postDebugLog({
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      event,
      status: this.status,
      payload: sanitizeDebugValue(payload),
    });
  },
};

