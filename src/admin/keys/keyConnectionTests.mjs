// src/admin/keys/keyConnectionTests.mjs
/**
 * "Test connection" for each provider key in the registry, using the key the
 * SERVER currently holds (process.env). Each check is the cheapest call that
 * tells a valid key from a rejected one; every endpoint below was probed live
 * on 2026-11-06 with a real key (2xx / first message) and a bogus one (401/403
 * / closed socket):
 *
 *   openai          GET  api.openai.com/v1/models                       free
 *   firms           GET  firms…/mapserver/mapkey_status                 free (no transaction)
 *   cesium-ion      GET  api.cesium.com/v1/assets/1/endpoint            free (metadata only)
 *   tomtom          GET  one zoom-0 traffic-flow tile                   1 tile of the daily quota
 *   opensky         POST OAuth client_credentials token endpoint        free
 *   launch-library  GET  ll.thespacedevs.com/2.3.0/api-throttle/        free
 *   aisstream       the live vessel feed's own status when it is connected (no
 *                   second socket); otherwise WSS subscribe, valid key gets a
 *                   first message. AISStream refuses concurrent connections per
 *                   key (HTTP 429 at the handshake), so a socket that never opens
 *                   is "unreachable", never "rejected".
 *   google-maps     —    not testable from the server (browser key, usually referrer-restricted)
 *
 * Results never contain the key, a response body or an upstream error text —
 * only a code, the HTTP status and a fixed sentence.
 *
 * @module admin/keys/keyConnectionTests
 */

const TIMEOUT_MS = 10_000;
const AIS_WAIT_MS = 10_000;
const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
// The smallest possible subscription: one tiny box, position reports only.
const AIS_PROBE_BOX = [[[0, 0], [0.01, 0.01]]];

/** @typedef {{result: 'ok'|'rejected'|'unreachable'|'untestable'|'not_set', httpStatus?: number, message: string}} KeyTestResult */

const MESSAGES = Object.freeze({
  ok: 'The provider accepted the key.',
  aisLive: 'The live vessel feed on this server is receiving data with this key.',
  aisAuthFailed: 'AISStream refused this key on the live vessel feed.',
  aisBusy: 'AISStream refused a new connection: it limits connections per key, and the live vessel feed or another running copy of this app already holds one. The key was not checked; turn on the Ships layer to check it through the live feed.',
  rejected: 'The provider rejected the key.',
  unreachable: 'The provider could not be reached; the key was not checked.',
  not_set: 'No key is configured for this provider.',
});

const fromStatus = (status) => {
  if (status >= 200 && status < 300) return { result: 'ok', httpStatus: status, message: MESSAGES.ok };
  if (status === 401 || status === 403) return { result: 'rejected', httpStatus: status, message: MESSAGES.rejected };
  return { result: 'unreachable', httpStatus: status, message: `The provider answered HTTP ${status}; the key could not be confirmed.` };
};

async function httpCheck(fetchFn, url, init = {}, accept = (r) => r.ok) {
  try {
    const response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return fromStatus(response.status);
    // A 2xx whose body does not look like a key-accepted answer is a rejection.
    const accepted = await accept(response);
    return accepted ? fromStatus(response.status) : { result: 'rejected', httpStatus: response.status, message: MESSAGES.rejected };
  } catch {
    return { result: 'unreachable', message: MESSAGES.unreachable };
  }
}

/**
 * Prefer the running feed's evidence; otherwise probe. In the probe a valid
 * key gets a first frame and a bad key is closed AFTER the socket opened; a
 * socket refused at the handshake (429, connection limit) proves nothing.
 */
function aisCheck(key, WebSocketImpl, feedEvidence) {
  const feed = safeEvidence(feedEvidence);
  if (feed?.status === 'live') return Promise.resolve({ result: 'ok', message: MESSAGES.aisLive });
  if (feed?.status === 'auth-failed') return Promise.resolve({ result: 'rejected', message: MESSAGES.aisAuthFailed });
  if (typeof WebSocketImpl !== 'function') return Promise.resolve({ result: 'untestable', message: 'WebSocket is not available on this server.' });
  return new Promise((resolve) => {
    let settled = false;
    let opened = false;
    let socket;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket?.close(); } catch { /* already closed */ }
      resolve(value);
    };
    const timer = setTimeout(() => finish({ result: 'unreachable', message: MESSAGES.unreachable }), AIS_WAIT_MS);
    try {
      socket = new WebSocketImpl(AISSTREAM_URL);
    } catch {
      finish({ result: 'unreachable', message: MESSAGES.unreachable });
      return;
    }
    socket.onopen = () => {
      opened = true;
      socket.send(JSON.stringify({ APIKey: key, BoundingBoxes: AIS_PROBE_BOX, FilterMessageTypes: ['PositionReport'] }));
    };
    socket.onmessage = () => finish({ result: 'ok', message: MESSAGES.ok });
    socket.onclose = () => finish(opened
      ? { result: 'rejected', message: MESSAGES.rejected }
      : { result: 'unreachable', message: MESSAGES.aisBusy });
    socket.onerror = () => {};
  });
}

function safeEvidence(read) {
  if (typeof read !== 'function') return null;
  try {
    return read();
  } catch (error) {
    console.warn(`[admin-keys] live AIS feed status unavailable: ${error?.message || error}`);
    return null;
  }
}

const CHECKS = {
  openai: ({ OPENAI_API_KEY: key }, f) => httpCheck(f, 'https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } }),
  firms: ({ FIRMS_MAP_KEY: key }, f) => httpCheck(
    f, `https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${encodeURIComponent(key)}`, {},
    async (r) => Number.isFinite(Number((await r.json().catch(() => null))?.transaction_limit)),
  ),
  'cesium-ion': ({ CESIUM_ION_TOKEN: key }, f) => httpCheck(f, `https://api.cesium.com/v1/assets/1/endpoint?access_token=${encodeURIComponent(key)}`),
  tomtom: ({ TOMTOM_API_KEY: key }, f) => httpCheck(f, `https://api.tomtom.com/traffic/map/4/tile/flow/relative/0/0/0.png?key=${encodeURIComponent(key)}`),
  opensky: ({ OPENSKY_CLIENT_ID: id, OPENSKY_CLIENT_SECRET: secret }, f) => httpCheck(
    f, 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
    },
  ),
  'launch-library': ({ LL2_API_TOKEN: key }, f) => httpCheck(f, 'https://ll.thespacedevs.com/2.3.0/api-throttle/', { headers: { Authorization: `Token ${key}` } }),
  aisstream: ({ AISSTREAM_API_KEY: key }, _f, ws, aisFeedEvidence) => aisCheck(key, ws, aisFeedEvidence),
};

/** Ids that have a server-side check, plus the one-line cost note shown beside the button. */
export const KEY_TEST_NOTES = Object.freeze({
  openai: 'Lists models; no usage is billed.',
  firms: 'Reads the key status; uses no transaction.',
  'cesium-ion': 'Reads terrain metadata only.',
  tomtom: 'Fetches one traffic tile from the daily quota.',
  opensky: 'Requests one OAuth token.',
  'launch-library': 'Reads the request allowance.',
  aisstream: 'Uses the live vessel feed when it is running; otherwise opens a short stream connection.',
  'google-maps': 'Not testable from the server: this key is used by the browser. Check that the 3D globe loads.',
});

/**
 * @param {{id: string, envVars: string[]}} entry Registry entry (`KEY_SETUP_KEYS`).
 * @param {{env?: object, fetchFn?: typeof fetch, WebSocketImpl?: typeof WebSocket,
 *   aisFeedEvidence?: () => {status: string}}} [deps] `aisFeedEvidence` = the running
 *   vessel feed's status (`aisStreamKeyEvidence` in aisLiveProxy.mjs).
 * @returns {Promise<KeyTestResult>}
 */
export async function testProviderKey(entry, {
  env = process.env, fetchFn = fetch, WebSocketImpl = globalThis.WebSocket, aisFeedEvidence,
} = {}) {
  const check = CHECKS[entry.id];
  if (!check) return { result: 'untestable', message: KEY_TEST_NOTES[entry.id] ?? 'This key has no connection test.' };
  const values = Object.fromEntries(entry.envVars.map((name) => [name, String(env[name] ?? '').trim()]));
  if (Object.values(values).some((value) => !value)) return { result: 'not_set', message: MESSAGES.not_set };
  return check(values, fetchFn, WebSocketImpl, aisFeedEvidence);
}
