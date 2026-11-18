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
