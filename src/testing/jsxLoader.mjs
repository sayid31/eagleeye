// src/testing/jsxLoader.mjs
/**
 * Test-only: loads `.jsx` modules (and the `@/` alias) inside node:test through Vite's SSR transform, so components can
 * be rendered with react-dom/server without a browser. One loader per test file; call `close()` in an `after` hook.
 * Uses only Vite's public API; no plugins from vite.config.js (no proxies, no Cesium) are started.
 *
 * @module testing/jsxLoader
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * @returns {Promise<{load: (file: string) => Promise<Record<string, any>>, close: () => Promise<void>}>}
 *   `load` takes a repo-relative path such as `src/components/app/StatusBadge.jsx`.
 */
export async function createJsxLoader() {
  const server = await createServer({
    root: repoRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': path.join(repoRoot, 'src') } },
    esbuild: { jsx: 'automatic' },
    ssr: { noExternal: [] },
  });
  return {
    load: (file) => server.ssrLoadModule(`/${file.replace(/^\/+/, '')}`),
    close: () => server.close(),
  };
}
