/**
 * intermediateCaTrust.mjs — lets the Node dev proxy validate upstream hosts
 * that send an incomplete TLS chain (leaf only, intermediate missing).
 *
 * Browsers and curl repair such chains through the certificate's AIA
 * "CA Issuers" URL; Node's fetch does not, so the proxy answered 502
 * (UNABLE_TO_VERIFY_LEAF_SIGNATURE) for hosts that play fine in a browser.
 * The fix is to add the missing PUBLIC intermediate certificates (committed
 * under config/ca/) to Node's default trust list. Verification stays on:
 * an intermediate only vouches for certificates it issued, and it chains to
 * a root the system already trusts, so no host gains trust it would not
 * already have with a complete chain (expired/self-signed hosts still fail).
 *
 * Node-only (imported by cctvProxy.mjs), never bundled for the browser.
 */

import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';

/** Directory (relative to the repo root) holding the bundled intermediates. */
export const INTERMEDIATE_CA_DIR = path.join('config', 'ca');

const PEM_CERT_RE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

/**
 * Extract every PEM certificate block from a file's text. Private keys or any
 * other PEM type are ignored, so a stray key file can never become a trust anchor.
 * @param {string} text
 * @returns {string[]}
 */
export function extractPemCertificates(text) {
  return String(text || '').match(PEM_CERT_RE) || [];
}

/** Whitespace-free PEM body, so comparison ignores line endings / wrapping. */
const pemBody = (pem) => String(pem).replace(/-----[A-Z ]+-----|\s+/g, '');

/**
 * Read every `*.crt` / `*.pem` certificate in `dir`.
 * @param {string} dir
 * @returns {string[]} PEM certificate blocks (empty when the dir is missing).
 */
export function readIntermediateCertificates(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /\.(crt|pem)$/i.test(name))
    .sort()
    .flatMap((name) => extractPemCertificates(fs.readFileSync(path.join(dir, name), 'utf8')));
}

/**
 * Add the bundled intermediates to Node's default CA list. Idempotent.
 * @param {{dir?: string, tlsModule?: typeof tls, warn?: (...args: unknown[]) => void}} [options]
 * @returns {number} Number of certificates added (0 when none/unsupported).
 */
export function installIntermediateCaTrust({
  dir = path.resolve(process.cwd(), INTERMEDIATE_CA_DIR),
  tlsModule = tls,
  warn = console.warn,
} = {}) {
  const certs = readIntermediateCertificates(dir);
  if (certs.length === 0) return 0;
  if (typeof tlsModule.setDefaultCACertificates !== 'function') {
    warn('[CCTV] this Node version cannot extend the default CA list; hosts with an incomplete TLS chain will fail');
    return 0;
  }
  const current = tlsModule.getCACertificates('default');
  const known = new Set(current.map(pemBody));
  const missing = certs.filter((cert) => !known.has(pemBody(cert)));
  if (missing.length === 0) return 0;
  tlsModule.setDefaultCACertificates([...current, ...missing]);
  return missing.length;
}
