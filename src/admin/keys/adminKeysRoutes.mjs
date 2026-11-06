// src/admin/keys/adminKeysRoutes.mjs
/**
 * /admin → API Keys routes, all behind `requireAdminSession`:
 *
 *  - GET  /api/admin/keys       → registry + presence + source ('file' editable,
 *    'external' read-only) + which store this launch writes + test notes.
 *  - PUT  /api/admin/keys       → {ENV_VAR: value|null} (null = remove), same
 *    validation and external-key protection as POWER UP; then the dev server
 *    restarts so browser-exposed keys re-inject (the page reloads itself).
 *  - POST /api/admin/keys/test  → {id} → connection test with the key the
 *    server holds (`keyConnectionTests.mjs`).
 *
 * No response ever carries a key value. Every change and test is written to
 * the audit trail by NAME only.
 *
 * @module admin/keys/adminKeysRoutes
 */

import { KEY_SETUP_KEYS } from '../../keySetupCore.mjs';
import { requireAdminSession } from '../auth/requireAdminSession.mjs';
import { readSmallBody, respondNoStore, summarize } from './keyHttp.mjs';
import { KEY_TEST_NOTES, testProviderKey } from './keyConnectionTests.mjs';
import { scheduleDevServerRestart } from './providerKeyStore.mjs';
import { logServerEvent } from '../log/serverLogStore.mjs';

/** A failed connection test → Server Log entry (checklist 1E); ok/untestable log nothing. */
export function keyTestLogEvent(entry, outcome) {
  if (outcome.result !== 'rejected' && outcome.result !== 'unreachable') return null;
  return {
    level: outcome.result === 'rejected' ? 'error' : 'warn',
    source: 'keys',
    code: outcome.result === 'rejected' ? 'keys.rejected' : 'keys.unreachable',
    message: `${entry.title}: ${outcome.message}`,
    detail: { provider: entry.id, ...(outcome.httpStatus ? { httpStatus: outcome.httpStatus } : {}) },
  };
}

async function readJsonBody(req) {
  let body;
  try {
    body = await readSmallBody(req);
  } catch {
    return { error: [400, 'Request body could not be read'] };
  }
  if (body === null) return { error: [413, 'Request too large'] };
  try {
    return { value: JSON.parse(body || '{}') };
  } catch {
    return { error: [400, 'Invalid JSON'] };
  }
}

const statusPayload = (store) => ({ ...store.status(), testNotes: KEY_TEST_NOTES });

/**
 * @param {import('connect').Server} middlewares
 * @param {object} deps
 * @param {ReturnType<import('./providerKeyStore.mjs').createProviderKeyStore>} deps.store
 * @param {() => void} deps.restart
 * @param {{record: (entry: object) => boolean}} deps.audit
 * @param {(req: any) => {ok: boolean, status?: number, error?: string}} [deps.guard]
 * @param {(entry: object) => Promise<object>} [deps.testKey]
 * @param {(event: object) => void} [deps.log] Server Log producer.
 */
export function installAdminKeysRoutes(middlewares, {
  store, restart, audit, guard = (req) => requireAdminSession(req), testKey = (entry) => testProviderKey(entry), log = logServerEvent,
}) {
  middlewares.use('/api/admin/keys', async (req, res) => {
    const admitted = guard(req);
    if (!admitted.ok) return respondNoStore(res, admitted.status, { error: admitted.error });
    const route = (req.url || '/').split('?')[0];

    if (route === '/test') {
      if (req.method !== 'POST') return respondNoStore(res, 405, { error: 'Method not allowed' });
      const body = await readJsonBody(req);
      if (body.error) return respondNoStore(res, body.error[0], { error: body.error[1] });
      const entry = KEY_SETUP_KEYS.find((key) => key.id === body.value?.id);
      if (!entry) return respondNoStore(res, 400, { error: 'Unknown provider' });
      const outcome = await testKey(entry);
      audit.record({ event: 'keys.tested', provider: entry.id, result: outcome.result, httpStatus: outcome.httpStatus });
      const logEvent = keyTestLogEvent(entry, outcome);
      if (logEvent) log(logEvent);
      return respondNoStore(res, 200, { id: entry.id, ...outcome });
    }
    if (route !== '/') return respondNoStore(res, 404, { error: 'Not found' });

    if (req.method === 'GET') return respondNoStore(res, 200, statusPayload(store));
    if (req.method !== 'PUT') return respondNoStore(res, 405, { error: 'Method not allowed' });

    const body = await readJsonBody(req);
    if (body.error) return respondNoStore(res, body.error[0], { error: body.error[1] });
    const result = store.applyUpdates(body.value);
    audit.record({ event: result.ok ? 'keys.changed' : 'keys.change_failed', source: 'admin', ...summarize(result) });
    if (!result.ok) return respondNoStore(res, result.httpStatus, { error: result.error });
    respondNoStore(res, 200, { ok: true, saved: result.saved, removed: result.removed, status: statusPayload(store), restarting: true });
    return restart();
  });
}

/**
 * Vite plugin wrapper. Dev server only: the store and restart exist only under `vite dev`.
 * `aisFeedEvidence` lets the AISStream test read the running vessel feed
 * instead of opening a second connection on the same key.
 */
export function adminKeysPlugin({ store, audit, aisFeedEvidence }) {
  return {
    name: 'gev-admin-keys',
    apply: (_config, { command, isPreview }) => command === 'serve' && !isPreview,
    configureServer(server) {
      installAdminKeysRoutes(server.middlewares, {
        store,
        audit,
        restart: () => scheduleDevServerRestart(server),
        testKey: (entry) => testProviderKey(entry, { aisFeedEvidence }),
      });
    },
  };
}
