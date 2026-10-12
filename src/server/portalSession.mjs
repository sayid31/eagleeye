/**
 * portalSession.mjs — cookie session for CCTV hosts that only serve streams to
 * clients that first visited the city portal (e.g. cctv.malangkota.go.id:
 * every stream is 403 without the portal's cookie + a Referer).
 *
 * A source opts in with a `portalSession: {bootstrapUrl, referer}` object in
 * its catalog entry. The proxy visits `bootstrapUrl` (following same-origin
 * redirects by hand so no Set-Cookie is lost), keeps the cookies in memory and
 * replays them with the Referer on stream requests. No credential is used:
 * the cookie is whatever an anonymous browser visit receives. The cookie is
 * bound by the host to the User-Agent that fetched it, so the bootstrap and
 * the stream requests must use the same one.
 *
 * Node-only (imported by cctvProxy.mjs), never bundled for the browser.
 */

/** Cookie lifetime assumed when the host sends no usable Max-Age. */
const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;
/** Refresh well before the shortest observed cookie Max-Age (1 h). */
const MAX_SESSION_TTL_MS = 30 * 60 * 1000;
/** Minimum gap between forced refreshes for one origin (stops 403 loops). */
const MIN_FORCED_REFRESH_MS = 30 * 1000;
const MAX_BOOTSTRAP_REDIRECTS = 5;
const BOOTSTRAP_TIMEOUT_MS = 15 * 1000;

/**
 * Validate a catalog `portalSession` against the source URL. Both URLs must be
 * https/http on the same origin as the stream, so a catalog entry can never
 * make the proxy send cookies to, or fetch from, a different host.
 * @param {unknown} raw
 * @param {string} sourceUrl
 * @returns {{bootstrapUrl: string, referer: string}|undefined}
 */
export function normalizePortalSession(raw, sourceUrl) {
  if (!raw || typeof raw !== 'object') return undefined;
  try {
    const origin = new URL(sourceUrl).origin;
    const bootstrapUrl = new URL(String(raw.bootstrapUrl || '')).href;
    const referer = new URL(String(raw.referer || raw.bootstrapUrl || '')).href;
    if (!/^https?:$/.test(new URL(bootstrapUrl).protocol)) return undefined;
    if (new URL(bootstrapUrl).origin !== origin || new URL(referer).origin !== origin) return undefined;
    return { bootstrapUrl, referer };
  } catch {
    return undefined;
  }
}

/**
 * Parse one Set-Cookie header into a name/value pair plus its Max-Age.
 * @param {string} header
 * @returns {{name: string, value: string, maxAgeSec: number|null}|null}
 */
export function parseSetCookie(header) {
  const [pair, ...attrs] = String(header || '').split(';');
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  if (!name) return null;
  let maxAgeSec = null;
  for (const attr of attrs) {
    const m = /^\s*max-age\s*=\s*(-?\d+)\s*$/i.exec(attr);
    if (m) maxAgeSec = Number(m[1]);
  }
  return { name, value: pair.slice(eq + 1).trim(), maxAgeSec };
}

/**
 * In-memory per-origin session store with coalesced bootstraps.
 * @param {{fetchFn?: typeof fetch, now?: () => number, userAgent: string}} options
 */
export function createPortalSessionStore({ fetchFn = fetch, now = Date.now, userAgent }) {
  /** @type {Map<string, {cookies: Map<string,string>, expiresAt: number, lastBootstrapAt: number}>} */
  const sessions = new Map();
  /** @type {Map<string, Promise<object>>} */
  const inFlight = new Map();

  const keyOf = (session) => new URL(session.bootstrapUrl).origin;

  async function bootstrap(session) {
    const origin = keyOf(session);
    const cookies = new Map();
    let ttlMs = DEFAULT_SESSION_TTL_MS;
    let target = session.bootstrapUrl;
    for (let hop = 0; hop <= MAX_BOOTSTRAP_REDIRECTS; hop += 1) {
      const headers = { 'User-Agent': userAgent };
      if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetchFn(target, {
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(BOOTSTRAP_TIMEOUT_MS),
      });
      for (const raw of res.headers.getSetCookie?.() || []) {
        const parsed = parseSetCookie(raw);
        if (!parsed) continue;
        if (parsed.maxAgeSec !== null && parsed.maxAgeSec <= 0) {
          cookies.delete(parsed.name);
          continue;
        }
        cookies.set(parsed.name, parsed.value);
        if (parsed.maxAgeSec) ttlMs = Math.min(ttlMs, parsed.maxAgeSec * 1000);
      }
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, target);
        if (next.origin !== origin) {
          throw new Error(`portal session bootstrap redirected off-origin (${next.origin})`);
        }
        target = next.href;
        continue;
      }
      if (!res.ok) throw new Error(`portal session bootstrap returned HTTP ${res.status}`);
      break;
    }
    if (cookies.size === 0) throw new Error('portal session bootstrap returned no cookies');
    const entry = {
      cookies,
      expiresAt: now() + Math.min(ttlMs, MAX_SESSION_TTL_MS),
      lastBootstrapAt: now(),
    };
    sessions.set(origin, entry);
    return entry;
  }

  /**
   * Request headers (Cookie + Referer) for a session-gated source.
   * @param {{bootstrapUrl: string, referer: string}} session
   * @param {{forceRefresh?: boolean}} [options]
   * @returns {Promise<{Cookie: string, Referer: string}>}
   */
  async function headersFor(session, { forceRefresh = false } = {}) {
    const key = keyOf(session);
    let entry = sessions.get(key);
    const stale = !entry || entry.expiresAt <= now();
    const refreshAllowed = !entry || now() - entry.lastBootstrapAt >= MIN_FORCED_REFRESH_MS;
    if (stale || (forceRefresh && refreshAllowed)) {
      if (!inFlight.has(key)) {
        inFlight.set(key, bootstrap(session).finally(() => inFlight.delete(key)));
      }
      entry = await inFlight.get(key);
    }
    return {
      Cookie: [...entry.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      Referer: session.referer,
    };
  }

  /**
   * fetch() that attaches the session and retries once with a fresh session on 403.
   * @param {{bootstrapUrl: string, referer: string}|undefined} session
   * @param {string} url
   * @param {{headers?: object}} [init]
   * @returns {Promise<Response>}
   */
  async function fetchWithSession(session, url, init = {}) {
    if (!session) return fetchFn(url, init);
    const attempt = async (forceRefresh) => fetchFn(url, {
      ...init,
      headers: { ...init.headers, ...(await headersFor(session, { forceRefresh })) },
    });
    const first = await attempt(false);
    if (first.status !== 403) return first;
    await first.body?.cancel?.();
    return attempt(true);
  }

  return { headersFor, fetchWithSession };
}
