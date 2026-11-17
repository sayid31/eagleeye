// src/auth/apiRouteRegistry.mjs
/**
 * `registerApiRoute(server, prefix, gate, handler)` — the only way a plugin
 * mounts an `/api/*` route. It records the route's gate for the login guard
 * (`authPlugin.mjs`, registered first, reads it per request) and then mounts
 * the handler with Connect's `use`. A missing or unknown gate throws while the
 * server boots, so an unclassified paid route can never ship silently.
 *
 * The record is kept per Connect app (dev and preview servers are separate).
 * A request to an `/api/*` path that no registered route serves is answered
 * 404 by the guard.
 *
 * @module auth/apiRouteRegistry
 */

import { assertRouteGate } from './apiGates.mjs';

const registries = new WeakMap();

/** @param {any} target A Vite dev/preview server, or its Connect `middlewares`. */
const appOf = (target) => target?.middlewares ?? target;

/**
 * Routes registered on a server so far, in registration order.
 * @param {any} target Vite server or Connect app.
 * @returns {{prefix: string, gate: string}[]} Live array (the guard reads it per request).
 */
export function registeredApiRoutes(target) {
  const app = appOf(target);
  // A real Connect app is a function with methods; test fakes are plain objects.
  if (!app || (typeof app !== 'object' && typeof app !== 'function')) throw new Error('registeredApiRoutes: no Connect app given');
  if (!registries.has(app)) registries.set(app, []);
  return registries.get(app);
}

/**
 * Mount an `/api/*` handler with its gate.
 * @param {any} target Vite dev/preview server, or its Connect `middlewares`.
 * @param {string} prefix e.g. `/api/opensky`.
 * @param {'layers' | 'ai' | 'premium' | 'open' | 'admin' | 'super'} gate
 * @param {(req: any, res: any, next: Function) => unknown} handler
 */
export function registerApiRoute(target, prefix, gate, handler) {
  assertRouteGate(prefix, gate);
  if (typeof handler !== 'function') throw new Error(`registerApiRoute: route ${prefix} has no handler`);
  const app = appOf(target);
  if (typeof app?.use !== 'function') throw new Error(`registerApiRoute: route ${prefix} has no Connect app to mount on`);
  const routes = registeredApiRoutes(app);
  const clash = routes.find((route) => route.prefix.toLowerCase() === prefix.toLowerCase() && route.gate !== gate);
  if (clash) throw new Error(`registerApiRoute: ${prefix} registered twice with different gates (${clash.gate}, ${gate})`);
  if (!routes.some((route) => route.prefix === prefix)) routes.push({ prefix, gate });
  app.use(prefix, handler);
}
