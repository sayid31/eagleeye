/**
 * pageToken.mjs — short-lived stream tokens that a camera host prints into its
 * own public page (Jombang: every card's `data-url` is
 * `…/nph-zms?monitor=N&token=<JWT, 2 h>`; the stream answers 403 without it).
 *
 * A source opts in with `pageToken: {pageUrl}` (same origin as its `url`) and
 * keeps the token-free stream URL in the catalog. The proxy reads the page the
 * way a browser visitor would, picks the token printed next to that exact
 * stream URL, caches it in memory well inside its lifetime, and never writes
 * it to disk, a log line, or any browser response.
 *
 * Node-only (imported by cctvProxy.mjs), never bundled for the browser.
 */

/** Tokens live 2 h on the host; refresh well before that. */
export const PAGE_TOKEN_TTL_MS = 45 * 60 * 1000;
/** Minimum gap between forced page re-reads (stops 403 loops). */
export const PAGE_TOKEN_MIN_FORCED_REFRESH_MS = 30 * 1000;
const PAGE_TIMEOUT_MS = 15 * 1000;
const PAGE_MAX_CHARS = 2 * 1024 * 1024;
const TOKEN_CHARS = '[A-Za-z0-9_\\-.]{20,}';

/**
 * Validate a catalog `pageToken` against the stream URL (same origin, http(s)).
 * @param {unknown} raw
 * @param {string} sourceUrl
 * @returns {{pageUrl: string}|undefined}
 */
export function normalizePageToken(raw, sourceUrl) {
  if (!raw || typeof raw !== 'object') return undefined;
  try {
    const page = new URL(String(raw.pageUrl || ''));
    if (!/^https?:$/.test(page.protocol)) return undefined;
    if (page.origin !== new URL(sourceUrl).origin) return undefined;
    return { pageUrl: page.href };
  } catch {
    return undefined;
  }
}

/**
 * Token the page prints right after `streamUrl` (as `&token=` / `&amp;token=`).
 * @param {string} html
 * @param {string} streamUrl - Token-free stream URL from the catalog.
 * @returns {string} The token, or '' when the page does not carry one for this stream.
 */
export function extractPageToken(html, streamUrl) {
  const text = String(html || '').replace(/&amp;/g, '&');
  const escaped = String(streamUrl).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}&token=(${TOKEN_CHARS})`).exec(text);
  return match ? match[1] : '';
}

/**
 * Stream URL with the current token attached, from an in-memory page cache.
 * @param {object} options
 * @param {string} options.userAgent
 * @param {typeof fetch} [options.fetchFn]
 * @param {() => number} [options.now]
 */
export function createPageTokenStore({ userAgent, fetchFn = fetch, now = Date.now } = {}) {
  /** @type {Map<string, {html: string, fetchedAt: number}>} */
  const pages = new Map();
  /** @type {Map<string, Promise<{html: string, fetchedAt: number}>>} */
  const inFlight = new Map();

  async function load(pageUrl) {
    const res = await fetchFn(pageUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`token page returned HTTP ${res.status}`);
    const entry = { html: (await res.text()).slice(0, PAGE_MAX_CHARS), fetchedAt: now() };
    pages.set(pageUrl, entry);
    return entry;
  }

  /**
   * @param {{url: string, pageToken: {pageUrl: string}}} source
   * @param {{forceRefresh?: boolean}} [options]
   * @returns {Promise<string>} Full stream URL including the token.
   * @throws {Error} When the page is unreachable or prints no token for this stream.
   */
  async function resolveUrl(source, { forceRefresh = false } = {}) {
    const { pageUrl } = source.pageToken;
    let entry = pages.get(pageUrl);
    const stale = !entry || now() - entry.fetchedAt >= PAGE_TOKEN_TTL_MS;
    const refreshAllowed = !entry || now() - entry.fetchedAt >= PAGE_TOKEN_MIN_FORCED_REFRESH_MS;
    if (stale || (forceRefresh && refreshAllowed)) {
      if (!inFlight.has(pageUrl)) {
        inFlight.set(pageUrl, load(pageUrl).finally(() => inFlight.delete(pageUrl)));
      }
      entry = await inFlight.get(pageUrl);
    }
    const token = extractPageToken(entry.html, source.url);
    if (!token) throw new Error('token page prints no token for this stream');
    return `${source.url}&token=${token}`;
  }

  return { resolveUrl };
}
