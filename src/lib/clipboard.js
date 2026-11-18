// src/lib/clipboard.js
/**
 * Copy text to the clipboard. Uses the async Clipboard API; on plain-http LAN deployments (not a secure context) it
 * falls back to a hidden textarea + `execCommand('copy')`, the only way left there. Never logs the text (it may be a
 * temporary password).
 *
 * @module lib/clipboard
 */

/**
 * @param {string} text
 * @param {{navigator?: any, document?: any}} [env] Injected for tests.
 * @returns {Promise<boolean>} Whether the text reached the clipboard.
 */
export async function copyToClipboard(text, env = {}) {
  const nav = env.navigator ?? (typeof navigator === 'undefined' ? null : navigator);
  const doc = env.document ?? (typeof document === 'undefined' ? null : document);
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused or not focused: try the textarea fallback below.
    }
  }
  if (!doc?.body || typeof doc.execCommand !== 'function') return false;
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  doc.body.appendChild(area);
  try {
    area.select();
    return Boolean(doc.execCommand('copy'));
  } finally {
    doc.body.removeChild(area);
  }
}
