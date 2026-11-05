// src/admin/adminRoute.mjs
/**
 * Serves the admin SPA shell for browser navigations under `/admin`.
 *
 * The map app is a single-page app whose dev/preview fallback is index.html,
 * so `/admin/server-log` would open the map. This plugin rewrites only page
 * navigations (no file extension, not an `/api/*` call) to `/admin.html`.
 *
 * @module admin/adminRoute
 */

const ADMIN_PAGE = '/admin.html';

/**
 * @param {string | undefined} url Raw request URL (path + optional query).
 * @returns {string | null} Rewritten URL, or null when the request is not an admin page.
 */
export function adminPageRewrite(url) {
  if (typeof url !== 'string') return null;
  const [pathname, query] = url.split('?', 2);
  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return null;
  if (/\.[A-Za-z0-9]+$/.test(pathname)) return null;
  return query === undefined ? ADMIN_PAGE : `${ADMIN_PAGE}?${query}`;
}

function rewriteMiddleware(req, _res, next) {
  const rewritten = (req.method === 'GET' || req.method === 'HEAD') ? adminPageRewrite(req.url) : null;
  if (rewritten) req.url = rewritten;
  next();
}

/** Vite plugin: route `/admin/*` to the admin entry in dev and preview. */
export function adminRoute() {
  return {
    name: 'gev-admin-route',
    configureServer(server) { server.middlewares.use(rewriteMiddleware); },
    configurePreviewServer(server) { server.middlewares.use(rewriteMiddleware); },
  };
}

/**
 * Wrap a plugin so its `transformIndexHtml` skips admin.html.
 *
 * vite-plugin-cesium injects Cesium.js + widgets.css into EVERY html entry;
 * the admin dashboard has no globe, so loading the engine there only wastes
 * bandwidth. Remove this wrapper if the admin page ever needs Cesium.
 *
 * @param {import('vite').Plugin} plugin
 * @returns {import('vite').Plugin}
 */
export function skipOnAdminPage(plugin) {
  const original = plugin.transformIndexHtml;
  if (typeof original !== 'function') return plugin;
  return {
    ...plugin,
    transformIndexHtml(html, ctx) {
      if (/(^|[\\/])admin\.html$/.test(ctx?.filename ?? ctx?.path ?? '')) return undefined;
      return original.call(this, html, ctx);
    },
  };
}
