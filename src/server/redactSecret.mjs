/**
 * redactSecret.mjs — scrub a credential value out of text before it is logged
 * or returned to a client.
 *
 * Node-only (used by the server-side proxy plugins). The proxies never build a
 * log line from the upstream URL, but an upstream/network error message is
 * third-party text, so it is passed through this before it reaches a log.
 *
 * @module server/redactSecret
 */

/**
 * Replace every occurrence of `secret` (raw and URL-encoded) in `text` with
 * `[redacted]`. A blank secret leaves the text unchanged.
 *
 * @param {unknown} text - Message to scrub (coerced to string).
 * @param {string|undefined|null} secret - Credential value to remove.
 * @returns {string} The scrubbed text.
 */
export function redactSecret(text, secret) {
  const message = String(text ?? '');
  const value = String(secret ?? '').trim();
  if (!value) return message;
  const variants = new Set([value, encodeURIComponent(value)]);
  let scrubbed = message;
  for (const variant of variants) scrubbed = scrubbed.split(variant).join('[redacted]');
  return scrubbed;
}
