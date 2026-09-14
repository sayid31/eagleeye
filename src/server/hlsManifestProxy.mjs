/**
 * hlsManifestProxy.mjs — pure helpers for proxying multi-level relative-path
 * HLS (.m3u8) manifests through our own origin.
 *
 * Node-only (imported by vite.config.js), never bundled for the browser —
 * lives under src/server/, not src/data/, to keep that boundary explicit.
 *
 * Why this exists: a plain byte-for-byte proxy of an .m3u8 response breaks
 * playback whenever the manifest references a sub-playlist or segment by a
 * RELATIVE path (the overwhelmingly common case) — the browser resolves that
 * relative URI against the page/response URL it fetched the manifest from
 * (our own /api/cctv/media/:id), not the real upstream, and 404s. This module
 * rewrites every relative URI in a manifest to route back through our own
 * proxy (`/api/cctv/media/:id/rel?p=<absolute upstream URL>`), so nested
 * playlists and segments resolve correctly no matter how many levels deep
 * the source nests them — while keeping the raw upstream host out of the
 * client's hands (only ever forwarded server-side, and only after an
 * origin-allowlist check against the camera's own registered source URL).
 *
 * All exports here are pure (no fetch/fs) so they're directly unit-testable;
 * see hlsManifestProxy.test.mjs.
 */

/** Matches a `URI="..."` attribute inside an #EXT-X-MAP or #EXT-X-KEY tag. */
const QUOTED_URI_RE = /URI="([^"]*)"/;

/**
 * True if a response should be treated as an HLS manifest body (and thus
 * parsed/rewritten) rather than piped through as opaque binary media.
 *
 * @param {string} contentType - Upstream Content-Type header value.
 * @param {string} urlPath - The request URL's pathname (or full URL).
 * @returns {boolean}
 */
export function isManifestContentType(contentType, urlPath) {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('mpegurl')) return true;
  return /\.m3u8(\?|#|$)/i.test(String(urlPath || ''));
}

/**
 * Resolve a (possibly relative) URI against the manifest's own upstream URL.
 * Never throws — returns null if either input is not a resolvable URL.
 *
 * @param {string} relativePath
 * @param {string} upstreamBaseUrl - Absolute URL the manifest was fetched from.
 * @returns {string|null} Absolute upstream URL, or null on failure.
 */
export function resolveRelUrl(relativePath, upstreamBaseUrl) {
  try {
    return new URL(String(relativePath || ''), String(upstreamBaseUrl || '')).href;
  } catch {
    return null;
  }
}

/**
 * Build the proxied URL a client should use in place of an absolute upstream
 * URI — every nested manifest/segment request routes back through our own
 * origin instead of exposing the upstream host to the browser.
 *
 * @param {string} cameraId
 * @param {string} absoluteUpstreamUrl
 * @returns {string}
 */
export function buildProxyRelUrl(cameraId, absoluteUpstreamUrl) {
  return `/api/cctv/media/${encodeURIComponent(cameraId)}/rel?p=${encodeURIComponent(absoluteUpstreamUrl)}`;
}

/**
 * SSRF guard for the /rel sub-resource route: only ever proxy a URL whose
 * origin matches the camera's own registered upstream source URL. Rejects
 * anything else (a differing host/port/scheme), including malformed input.
 *
 * @param {string} absoluteUpstreamUrl - The `p` query param to validate.
 * @param {string} registeredSourceUrl - The camera's configured source.url.
 * @returns {boolean}
 */
export function isAllowedRelOrigin(absoluteUpstreamUrl, registeredSourceUrl) {
  try {
    const candidate = new URL(String(absoluteUpstreamUrl || ''));
    const registered = new URL(String(registeredSourceUrl || ''));
    if (candidate.protocol !== 'http:' && candidate.protocol !== 'https:') return false;
    return candidate.origin === registered.origin;
  } catch {
    return false;
  }
}

/**
 * Rewrite every relative (or absolute) URI reference in an HLS manifest to a
 * proxied `/api/cctv/media/:id/rel?p=...` URL, so nested sub-playlists and
 * segments resolve back through our own proxy rather than 404ing against our
 * origin or (for CORS-restricted upstreams) getting blocked by the browser.
 *
 * Handles:
 *  - `#EXT-X-STREAM-INF:` (master playlist variant) — the following non-#
 *    line is its URI, rewritten.
 *  - `#EXT-X-MAP:URI="..."` / `#EXT-X-KEY:URI="..."` — quoted URI attribute
 *    rewritten in place, rest of the tag preserved verbatim.
 *  - Any other non-`#`, non-blank line — a sub-playlist or segment
 *    reference, rewritten.
 *  - All other `#EXT-*` tag lines and blank lines — passed through
 *    unchanged.
 *
 * Never throws: a line whose URI fails to resolve (malformed input) is left
 * unchanged rather than dropped, so a single bad line degrades gracefully
 * instead of corrupting the whole manifest.
 *
 * @param {string} manifestText - Raw manifest body as fetched from upstream.
 * @param {string} upstreamManifestUrl - Absolute URL the manifest itself was fetched from (resolution base).
 * @param {string} cameraId - Camera id, embedded in the rewritten proxy URLs.
 * @returns {string} Rewritten manifest text.
 */
export function rewriteHlsManifest(manifestText, upstreamManifestUrl, cameraId) {
  const text = String(manifestText || '');
  if (!text) return text;

  const hasTrailingNewline = /\r?\n$/.test(text);
  const lines = text.split(/\r?\n/);
  // split() on a trailing newline yields a final empty string element; strip
  // it here and re-append the newline at the end so line-by-line rewriting
  // doesn't have to special-case it.
  if (hasTrailingNewline && lines.length && lines[lines.length - 1] === '') lines.pop();

  const rewriteUri = (uri) => {
    const resolved = resolveRelUrl(uri, upstreamManifestUrl);
    if (!resolved) return uri;
    return buildProxyRelUrl(cameraId, resolved);
  };

  let expectUriNextLine = false;
  const out = lines.map((line) => {
    if (expectUriNextLine) {
      expectUriNextLine = false;
      const trimmed = line.trim();
      // A blank or comment line where a URI was expected: leave untouched
      // rather than guess — malformed manifests should degrade gracefully.
      if (!trimmed || trimmed.startsWith('#')) return line;
      return rewriteUri(trimmed);
    }

    if (line.startsWith('#EXT-X-STREAM-INF:') || line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')) {
      // #EXT-X-I-FRAME-STREAM-INF carries its URI inline via a URI= attribute
      // instead of on the following line — handle both shapes.
      if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF:') && QUOTED_URI_RE.test(line)) {
        return line.replace(QUOTED_URI_RE, (_match, uri) => `URI="${rewriteUri(uri)}"`);
      }
      expectUriNextLine = true;
      return line;
    }

    if (line.startsWith('#EXT-X-MAP:') || line.startsWith('#EXT-X-KEY:')) {
      if (!QUOTED_URI_RE.test(line)) return line;
      return line.replace(QUOTED_URI_RE, (_match, uri) => `URI="${rewriteUri(uri)}"`);
    }

    if (line.startsWith('#') || line.trim() === '') return line;

    // Plain, non-# line: a sub-playlist or segment URI.
    return rewriteUri(line.trim());
  });

  return out.join('\n') + (hasTrailingNewline ? '\n' : '');
}
