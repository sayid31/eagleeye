// scripts/qa-ui/mocks.mjs
/**
 * Page set-ups that answer a few same-origin JSON endpoints with fixed payloads, so the gate can reach states the
 * throwaway server cannot produce (Google configured, login switched off, a forced password change, a Google-only
 * account). Everything else goes to the real server untouched.
 */

/** @param {import('puppeteer').Page} page @param {Record<string, unknown>} responses Path (no query) → JSON body. */
export async function answerJson(page, responses) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.isInterceptResolutionHandled()) return;
    const body = responses[new URL(request.url()).pathname];
    if (body === undefined) { void request.continue(); return; }
    void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

const QA_USER = { id: 'qa-user', name: 'Budi Pengguna', email: 'user@example.test', role: 'user', capabilities: { layers: true, ai: true, premium: false } };

/** `/api/me` of a signed-in user whose password an admin has just set. */
export const FORCED_CHANGE_ME = { configured: true, signedIn: true, home: '/app', googleSignIn: false, user: { ...QA_USER, mustChangePassword: true } };

export const SETUPS = Object.freeze({
  googleConfigured: (page) => answerJson(page, { '/api/me': { configured: true, signedIn: false, home: '/login', googleSignIn: true } }),
  notConfigured: (page) => answerJson(page, { '/api/me': { configured: false, signedIn: false, home: '/login', googleSignIn: false } }),
  forcedChange: (page) => answerJson(page, { '/api/me': FORCED_CHANGE_ME }),
  // A Google-created account has no password row (`passwordSetBy` empty), so /account shows the Google note.
  googleOnlyAccount: (page) => answerJson(page, { '/api/auth/get-session': { user: { id: 'qa-google', passwordSetBy: null } } }),
});

/**
 * Like `answerJson`, but a handler sees the request (method, body) and may answer any method; returning undefined lets
 * the request through to the real server. Used for flows that must NEVER reach the real stores (key writes, settings saves).
 * @param {import('puppeteer').Page} page
 * @param {Record<string, (request: {method: string, body: any}) => unknown>} routes Path (no query) → handler.
 * @returns {Array<{path: string, method: string, body: any}>} Every intercepted call, in order (for assertions).
 */
export async function answerApi(page, routes) {
  const calls = [];
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.isInterceptResolutionHandled()) return;
    const pathname = new URL(request.url()).pathname;
    const handler = routes[pathname];
    const raw = request.postData();
    const body = raw ? JSON.parse(raw) : null;
    const answer = handler?.({ method: request.method(), body });
    if (answer === undefined) { void request.continue(); return; }
    calls.push({ path: pathname, method: request.method(), body });
    void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(answer) });
  });
  return calls;
}

/** GET /api/admin/keys with every state of the table: set in the app, set outside it, empty, two-field. No key values. */
export const MIXED_KEYS = Object.freeze({
  store: 'env-file',
  testNotes: {},
  keys: [
    { id: 'google-maps', title: 'GOOGLE MAPS', unlocks: 'x', getUrl: 'https://developers.google.com/maps', envVars: ['GOOGLE_MAPS_API_KEY'], tier: 'metered', clientExposed: false, set: true, managed: 'file' },
    { id: 'openai', title: 'OPENAI', unlocks: 'x', getUrl: 'https://platform.openai.com/api-keys', envVars: ['OPENAI_API_KEY'], tier: 'metered', clientExposed: false, set: true, managed: 'file' },
    { id: 'aisstream', title: 'AISSTREAM', unlocks: 'x', getUrl: 'https://aisstream.io', envVars: ['AISSTREAM_API_KEY'], tier: 'free', clientExposed: false, set: true, managed: 'external' },
    { id: 'firms', title: 'NASA FIRMS', unlocks: 'x', getUrl: 'https://firms.modaps.eosdis.nasa.gov', envVars: ['FIRMS_MAP_KEY'], tier: 'free', clientExposed: false, set: false, managed: null },
    { id: 'tomtom', title: 'TOMTOM', unlocks: 'x', getUrl: 'https://developer.tomtom.com', envVars: ['TOMTOM_API_KEY'], tier: 'free', clientExposed: false, set: false, managed: null },
    { id: 'cesium-ion', title: 'CESIUM ION', unlocks: 'x', getUrl: 'https://ion.cesium.com/tokens', envVars: ['CESIUM_ION_TOKEN'], tier: 'free', clientExposed: true, set: true, managed: 'file' },
    { id: 'opensky', title: 'OPENSKY', unlocks: 'x', getUrl: 'https://opensky-network.org', envVars: ['OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET'], tier: 'free', clientExposed: false, set: false, managed: null },
    { id: 'launch-library', title: 'LAUNCH LIBRARY', unlocks: 'x', getUrl: 'https://thespacedevs.com', envVars: ['LL2_API_TOKEN'], tier: 'free', clientExposed: false, set: false, managed: null },
  ],
});

/** GET /api/admin/voice/usage with a week of sessions and a daily cap that is nearly used up. */
export const POPULATED_USAGE = Object.freeze({
  dayOptions: [7, 30, 90], dailyMinutes: 60, remainingSeconds: 540,
  summary: {
    today: { seconds: 3060, estimatedUsd: 1.46 },
    rows: [
      { day: '2026-11-18', sessions: 3, seconds: 3060, extrasUsd: 0.04, judgeCalls: 9, estimatedUsd: 1.46 },
      { day: '2026-11-17', sessions: 2, seconds: 1500, extrasUsd: 0.01, judgeCalls: 4, estimatedUsd: 0.72 },
      { day: '2026-11-16', sessions: 0, seconds: 0, extrasUsd: 0, judgeCalls: 0, estimatedUsd: 0 },
      { day: '2026-11-15', sessions: 1, seconds: 420, extrasUsd: 0, judgeCalls: 1, estimatedUsd: 0.2 },
    ],
    total: { sessions: 6, seconds: 4980, judgeCalls: 14, estimatedUsd: 2.38 },
  },
  rates: { verifiedOn: '2026-11-06', liveModel: 'gpt-live-1', livePerMin: 0.4, readerModel: 'gpt-5.6-luna', readerInPerMTok: 1, readerOutPerMTok: 4, judgeModel: 'gpt-5.6-luna', judgeInPerMTok: 0.2, judgeOutPerMTok: 0.8, judgeEnabled: true },
  costLimits: { defaults: { warnUsd: 1, capUsd: 3 }, effective: { warnUsd: 1, capUsd: 3 } },
});

export const SETUPS_CONFIG = Object.freeze({
  keysMixed: (page) => answerApi(page, { '/api/admin/keys': ({ method }) => (method === 'GET' ? MIXED_KEYS : undefined) }),
  usagePopulated: (page) => answerApi(page, { '/api/admin/voice/usage': ({ method }) => (method === 'GET' ? POPULATED_USAGE : undefined) }),
});
