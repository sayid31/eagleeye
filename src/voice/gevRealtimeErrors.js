// Helper functions moved out of gevRealtime.js.
import { ERROR_LOG_LIMIT, ERROR_STORAGE_KEY } from './gevRealtimeConstants.js';

export function createErrorRecord(source, error, extra = {}) {
  const rtcError = error?.error || error;
  return {
    timestamp: new Date().toISOString(),
    source,
    name: rtcError?.name || null,
    message: rtcError?.message || extra.errorText || String(error?.message || '').trim() || 'No browser error message supplied',
    errorDetail: rtcError?.errorDetail || null,
    sctpCauseCode: rtcError?.sctpCauseCode ?? null,
    receivedAlert: rtcError?.receivedAlert ?? null,
    sentAlert: rtcError?.sentAlert ?? null,
    ...removeEmptyValues(extra),
  };
}

export function formatErrorForDisplay(record) {
  const primary = [record.source, record.message].filter(Boolean).join(': ');
  const state = [
    record.errorDetail && `detail=${record.errorDetail}`,
    record.code && `code=${record.code}`,
    record.sctpCauseCode != null && `sctp=${record.sctpCauseCode}`,
    record.connectionState && `pc=${record.connectionState}`,
    record.iceConnectionState && `ice=${record.iceConnectionState}`,
    record.dataChannelState && `dc=${record.dataChannelState}`,
  ].filter(Boolean).join(' | ');
  return state ? `${primary}\n${state}` : primary;
}

function removeEmptyValues(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => (
    item !== null && item !== undefined && item !== ''
  )));
}

export function compactText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

export function loadStoredErrors() {
  try {
    const value = JSON.parse(localStorage.getItem(ERROR_STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.slice(0, ERROR_LOG_LIMIT) : [];
  } catch {
    return [];
  }
}

export function storeErrors(errors) {
  try {
    localStorage.setItem(ERROR_STORAGE_KEY, JSON.stringify(errors.slice(0, ERROR_LOG_LIMIT)));
  } catch {
    // Diagnostics still remain available in memory and the console.
  }
}
