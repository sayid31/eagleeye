// src/data/aisValueParsing.mjs
/**
 * Pure value and env parsing for the AISStream live proxy (aisLiveProxy.mjs):
 * env overrides for the subscription, and normalisation of the loosely typed
 * fields in AISStream messages. No module state, no network.
 *
 * @module data/aisValueParsing
 */

/** JSON env var, or `fallback` when unset or invalid (one console warning). */
export function parseJsonEnv(key, fallback) {
  const value = process.env[key];
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    console.warn(`[AISStream] Invalid ${key}; using default.`);
    return fallback;
  }
}

/** JSON array or comma-separated env var, or `fallback` when unset. */
export function parseCsvOrJsonEnv(key, fallback) {
  const value = process.env[key];
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
}

/** Integer clamped to [min, max], or `fallback` when not a number. */
export function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

/** Trimmed string; '' for null/undefined. */
export function stringValue(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

/** Finite number, or null for empty/null/non-numeric input. */
export function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Heading in 0..360 degrees, else null (AIS uses 511 for "not available"). */
export function normalizedHeading(value) {
  const heading = numberValue(value);
  return heading !== null && heading >= 0 && heading <= 360 ? heading : null;
}

/** AISStream "… +0000 UTC" time → ISO string; now when missing or unparseable. */
export function normalizeAisTimestamp(value) {
  const text = stringValue(value);
  if (!text) return new Date().toISOString();
  const normalized = text.replace(' +0000 UTC', 'Z').replace(' UTC', 'Z');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
