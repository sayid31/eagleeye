// src/admin/keys/legacyKeySetupPlugin.mjs
/**
 * POWER UP's original routes, kept until POWER UP is removed (admin stage T8):
 *
 *  - GET  /api/setup/status → key presence + source, never a value or suffix.
 *  - POST /api/setup/keys   → {ENV_VAR: value|null} into the owned store, set
 *    live, then restart the dev server so the page reloads with the key on.
 *
 * Loopback-only (`admitKeySetupRequest`): with HOST=0.0.0.0 a LAN guest must
 * neither write the host's .env nor probe which keys exist. Dev-server only —
 * prod builds and `vite preview` never register it, so the panel's status
 * fetch fails and the client removes the whole surface.
 *
 * @module admin/keys/legacyKeySetupPlugin
 */

import { admitKeySetupRequest } from '../../keySetupCore.mjs';
import { readSmallBody, respondNoStore, summarize } from './keyHttp.mjs';
import { scheduleDevServerRestart } from './providerKeyStore.mjs';

function admit(req, env) {
  return admitKeySetupRequest({
    method: req.method,
    remoteAddress: req.socket?.remoteAddress,
    hostHeader: req.headers?.host,
    protocol: req.socket?.encrypted ? 'https:' : 'http:',
    origin: req.headers?.origin,
    contentType: req.headers?.['content-type'],
    proxyHeaders: req.headers || {},
    env,
  });
}

/**
 * @param {import('connect').Server} middlewares
 * @param {{store: ReturnType<import('./providerKeyStore.mjs').createProviderKeyStore>,
 *   restart: () => void, env?: object, onEvent?: (event: object) => void}} deps
 */
export function installLegacyKeySetupRoutes(middlewares, { store, restart, env = process.env, onEvent = () => {} }) {
  middlewares.use('/api/setup/status', (req, res) => {
    if (req.method !== 'GET') return respondNoStore(res, 405, { error: 'Method not allowed' });
    const admission = admit(req, env);
    if (!admission.ok) return respondNoStore(res, admission.status, { error: admission.error });
    return respondNoStore(res, 200, store.status());
  });

  middlewares.use('/api/setup/keys', async (req, res) => {
    if (req.method !== 'POST') return respondNoStore(res, 405, { error: 'Method not allowed' });
    const admission = admit(req, env);
    if (!admission.ok) return respondNoStore(res, admission.status, { error: admission.error });
    let body;
    try {
      body = await readSmallBody(req);
    } catch {
      return respondNoStore(res, 400, { error: 'Request body could not be read' });
    }
    if (body === null) return respondNoStore(res, 413, { error: 'Request too large' });
    let parsed;
    try {
      parsed = JSON.parse(body || '{}');
    } catch {
      return respondNoStore(res, 400, { error: 'Invalid JSON' });
    }
    const result = store.applyUpdates(parsed);
    onEvent({ event: result.ok ? 'keys.changed' : 'keys.change_failed', source: 'power-up', ...summarize(result) });
    if (!result.ok) return respondNoStore(res, result.httpStatus, { error: result.error });
    respondNoStore(res, 200, { ok: true, saved: [...result.saved, ...result.removed], status: store.status(), restarting: true });
    return restart();
  });
}

/** Vite plugin wrapper (dev server only, never preview). */
export function legacyKeySetupPlugin({ store, onEvent }) {
  return {
    name: 'gev-key-setup',
    // serve AND not preview: `vite preview` resolves with command 'serve' too.
    apply: (_config, { command, isPreview }) => command === 'serve' && !isPreview,
    configureServer(server) {
      installLegacyKeySetupRoutes(server.middlewares, { store, onEvent, restart: () => scheduleDevServerRestart(server) });
    },
  };
}
