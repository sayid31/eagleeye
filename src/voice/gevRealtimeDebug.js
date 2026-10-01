// Helper functions moved out of gevRealtime.js.
import { DEBUG_LOG_URL } from './gevRealtimeConstants.js';

export function createDebugSessionId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `gev-${Date.now().toString(36)}-${randomPart}`;
}

export function postDebugLog(record) {
  try {
    const body = JSON.stringify(record);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(DEBUG_LOG_URL, blob)) return;
    }
    fetch(DEBUG_LOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: body.length < 60000,
    }).catch(() => {});
  } catch {
    // Debug logging must never affect voice control.
  }
}

export function sanitizeDebugValue(value, depth = 0) {
  if (depth > 10) return '[MaxDepth]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return sanitizeDebugString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeDebugValue(item, depth + 1));
  if (typeof value !== 'object') return String(value);

  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSecretLikeKey(key)) {
      output[key] = '[Redacted]';
      continue;
    }
    output[key] = sanitizeDebugValue(item, depth + 1);
  }
  return output;
}

function sanitizeDebugString(value) {
  if (value.startsWith('data:image/')) {
    return `[Redacted image data URL, ${value.length} chars]`;
  }
  const redacted = value
    .replace(/sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g, '[Redacted OpenAI API key]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [Redacted]')
    .replace(/"client_secret"\s*:\s*"[^"]+"/gi, '"client_secret":"[Redacted]"')
    .replace(/"value"\s*:\s*"ek_[^"]+"/gi, '"value":"[Redacted ephemeral key]"');
  const maxLength = 50000;
  return redacted.length > maxLength
    ? `${redacted.slice(0, maxLength)}...[Truncated ${redacted.length - maxLength} chars]`
    : redacted;
}

function isSecretLikeKey(key) {
  return /(?:api[_-]?key|authorization|bearer|client[_-]?secret|token|secret|password)/i.test(key);
}
