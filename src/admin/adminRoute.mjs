// src/admin/adminRoute.mjs
/**
 * Build helpers for the React pages (admin.html, login.html). Page routing
 * itself (`/admin/*`, `/dev/*` → admin.html, …) is the login guard's route
 * table (src/auth/pageRoutes.mjs).
 *
 * @module admin/adminRoute
 */

/**
 * Wrap a plugin so its `transformIndexHtml` skips the React pages
 * (admin.html and login.html).
 *
 * vite-plugin-cesium injects Cesium.js + widgets.css into EVERY html entry;
 * the admin dashboard and the login page have no globe, so loading the engine
 * there only wastes bandwidth. Remove this wrapper if they ever need Cesium.
 *
 * @param {import('vite').Plugin} plugin
 * @returns {import('vite').Plugin}
 */
export function skipOnReactPages(plugin) {
  const original = plugin.transformIndexHtml;
  if (typeof original !== 'function') return plugin;
  return {
    ...plugin,
    transformIndexHtml(html, ctx) {
      if (/(^|[\\/])(admin|login|landing)\.html$/.test(ctx?.filename ?? ctx?.path ?? '')) return undefined;
      return original.call(this, html, ctx);
    },
  };
}
