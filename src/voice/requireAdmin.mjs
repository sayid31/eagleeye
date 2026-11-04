// src/voice/requireAdmin.mjs
/**
 * The ONE access guard for owner-only settings routes.
 *
 * Today it delegates to the localhost gate that already protects POWER UP
 * (`admitKeySetupRequest`). Routes and UI call only `requireAdmin(req)`, so a
 * deployed build can swap this body for a real admin-login check without
 * touching any route or panel code. See docs/DECISIONS.md, "Voice settings:
 * deploy plan".
 *
 * @module voice/requireAdmin
 */

import { admitKeySetupRequest } from '../keySetupCore.mjs';

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {{env?: object}} [options]
 * @returns {{ok: true} | {ok: false, status: number, error: string}}
 */
export function requireAdmin(req, { env = process.env } = {}) {
  // admitKeySetupRequest enforces the exact-Origin and JSON content-type checks
  // only for POST. Any other state-changing method (PUT/PATCH/DELETE) must get
  // the same CSRF protection, so present it to the gate as a POST.
  const readOnly = req.method === 'GET' || req.method === 'HEAD';
  return admitKeySetupRequest({
    method: readOnly ? req.method : 'POST',
    remoteAddress: req.socket?.remoteAddress,
    hostHeader: req.headers?.host,
    protocol: req.socket?.encrypted ? 'https:' : 'http:',
    origin: req.headers?.origin,
    contentType: req.headers?.['content-type'],
    proxyHeaders: req.headers || {},
    env,
  });
}
