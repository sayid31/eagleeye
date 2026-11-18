// src/admin/config/failureMessage.js
/**
 * The sentence for a failed settings/keys call. The config routes answer validation failures (400/409/422) with an
 * English sentence of their own ("Pengaturan tidak valid: …"), which says more than any generic text, so it is shown
 * as is; every other failure goes through errorMessage() (never a raw code or HTTP status).
 *
 * @module admin/config/failureMessage
 */
import { errorMessage } from '../../copy/en/errors.js';

const WORDED_STATUSES = new Set([400, 409, 422]);

/**
 * @param {unknown} failure Error thrown by adminKeysApi / adminVoiceApi.
 * @returns {string}
 */
export function failureMessage(failure) {
  const detail = failure?.detail;
  if (WORDED_STATUSES.has(failure?.status) && typeof detail === 'string' && detail.trim() && !/^[A-Z0-9_]+$/.test(detail.trim())) {
    return detail.trim();
  }
  return errorMessage(failure);
}
