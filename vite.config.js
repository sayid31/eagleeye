/**
 * Vite configuration for EagleEye View — a cinematic geospatial app.
 *
 * Assembles the dev/preview-server proxy plugins that bypass CORS and add
 * caching/auth for upstream APIs, plus the `import.meta.env.*` defines for
 * the Cesium and Google 3D Tiles API keys the client bundle needs. Each
 * proxy is a self-contained Vite plugin factory imported from its own
 * module (see the `plugins:` array in `defineConfig()` below for the
 * exact registration order) rather than defined inline here:
 *
 *   - src/data/celestrakProxy.mjs, tomtomProxy.mjs, firmsProxy.mjs,
 *     adsbdbProxy.mjs, gbfsProxy.mjs — isolated single-upstream proxies.
 *   - src/data/openSkyProxy.mjs, adsbLolProxy.mjs, trackBackfillProxies.mjs
 *     — aircraft state vectors + track-history backfill (share one OAuth2
 *     token via openSkyProxy.mjs's exported `getOpenSkyToken()`).
 *   - src/data/aisLiveProxy.mjs — AISStream websocket-backed live vessel
 *     positions and per-MMSI recent-path buffers.
 *   - src/data/overpassCore.mjs (shared fetch/cache machinery) +
 *     src/data/overpassDiskCache.mjs (the disk layer of that cache) +
 *     src/data/overpassProxy.mjs (`/api/overpass`) +
 *     src/data/osrmRouteProxy.mjs (`/api/route`) +
 *     src/data/militaryInstallationsProxy.mjs (bounded OSM installation
 *     context, also built on overpassCore.mjs).
 *   - src/data/regionalProxyHandlers.mjs — regional briefing + weather
 *     effects (imports rate-limit/cache helpers back from this file; see
 *     that module's header for why).
 *   - src/data/cctvProxy.mjs — traffic-camera frames, media streams, and
 *     fallback SVG (catalog assembly lives in cctvSourceCatalog.mjs,
 *     live packs in cctvOpenDataSources.mjs).
 *   - src/data/radioBrowserProxy.mjs, rocketLaunchesProxy.mjs,
 *     googlePlacesContextProxy.mjs — station directory, launch metadata,
 *     keyless place context.
 *   - src/voice/openAiVoiceProxy.mjs — GPT-Live voice session, screenshot
 *     reader and HUD-summary proxies.
 *   - src/data/terrainHeightsPlugin.mjs (`/api/terrain/heights`) +
 *     terrainHeightsProxy.js (pure helpers) — Re:Earth ellipsoidal
 *     point-height lookups.
 *
 *   - src/admin/keys/ — the provider-key store behind /admin → API Keys. Its boot-time provenance snapshots stay in this file because
 *     they must be captured when THIS module first loads.
 *
 * `nominatimSearchProxy()` (forward geocode) stays defined in this file —
 * see its own JSDoc for why it wasn't moved out with the rest.
 *
 * A handful of names are re-exported below purely so
 * `src/data/regionalProxy.test.mjs` and `src/nominatimSearchProxy.test.mjs`
 * keep working without a test-file edit; see the comment above each
 * `export { ... }` for which module now owns the real implementation.
 *
 * @module vite.config
 */

import fs from 'node:fs';

import path from 'node:path';
import { loadCheckoutEnv } from './src/config/dotenvPrecedence.mjs';

import { overpassProxy } from './src/data/overpassProxy.mjs';
import { celestrakProxy } from './src/data/celestrakProxy.mjs';

import { tomtomProxy } from './src/data/tomtomProxy.mjs';

import { firmsProxy } from './src/data/firmsProxy.mjs';

import { myMapsProxy } from './src/data/myMapsProxy.mjs';

import { adsbdbProxy } from './src/data/adsbdbProxy.mjs';

import { gbfsProxy } from './src/data/gbfsProxy.mjs';

import { rocketLaunchesProxy, LL2_CACHE_TTL_MS, launchLibraryRequestHeaders } from './src/data/rocketLaunchesProxy.mjs';

import { googlePlacesContextProxy, keylessGooglePlacesResponse } from './src/data/googlePlacesContextProxy.mjs';

import { cctvProxy } from './src/data/cctvProxy.mjs';

import { osrmRouteProxy } from './src/data/osrmRouteProxy.mjs';

import { openSkyProxy, adsbLolFallbackAnchor } from './src/data/openSkyProxy.mjs';

import { adsbLolProxy } from './src/data/adsbLolProxy.mjs';

import { trackBackfillProxies } from './src/data/trackBackfillProxies.mjs';

import { aisLiveProxy, aisStreamKeyEvidence } from './src/data/aisLiveProxy.mjs';

import {
  militaryInstallationsProxy,
  validMilitaryInstallationBox,
} from './src/data/militaryInstallationsProxy.mjs';

import { fileURLToPath } from 'node:url';

import { defineConfig, loadEnv } from 'vite';

import cesium from 'vite-plugin-cesium';
import react from '@vitejs/plugin-react';
import { adminRoute, skipOnAdminPage } from './src/admin/adminRoute.mjs';

import { adminAuthPlugin } from './src/admin/auth/adminAuthPlugin.mjs';

import { radioBrowserProxy } from './src/data/radioBrowserProxy.mjs';

import {
  regionalBriefProxy,
  weatherEffectsProxy,
  requiredFiniteQueryNumber,
  validRegionalPoint,
  regionalBriefHasAnySource,
  queuedNominatimFetch,
  fetchRegionalJson,
  NOMINATIM_HEADERS,
} from './src/data/regionalProxyHandlers.mjs';

import { knownKeySetupEnvVars } from './src/keySetupCore.mjs';

import { createProviderKeyStore } from './src/admin/keys/providerKeyStore.mjs';

import { adminKeysPlugin } from './src/admin/keys/adminKeysRoutes.mjs';

import { createAdminAuditLog } from './src/admin/audit/adminAuditLog.mjs';

import { serverLogPlugin } from './src/admin/log/serverLogPlugin.mjs';

import { systemHealthPlugin } from './src/admin/health/systemHealthPlugin.mjs';

import {
  makeRateLimiter,
  nominatimSearchRateLimiter,
  enforceOptInRateLimit,
  clientKey,
  readResponseTextCapped,
  readResponseJsonCapped,
  coalesceProxyRequest,
} from './src/server/proxyInfra.mjs';
import { terrainHeightsProxy } from './src/data/terrainHeightsPlugin.mjs';

import { openAiVoiceProxy } from './src/voice/openAiVoiceProxy.mjs';


/** Resolve __dirname for ESM context. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Which launcher started this process, captured at MODULE LOAD — before the
 * config factory's loadEnv() copies dotenv files into process.env. Provider
 * Settings uses this to decide which credential store it owns, so it must
 * reflect the real launcher (scripts/pinokio-start.mjs sets it) and never a
 * value a project `.env` could inject.
 */
const LAUNCHER_AT_BOOT = process.env.GEV_LAUNCHER;

/**
 * Provider values present before Vite loads the checkout's dotenv files.
 * Memoized on globalThis: a panel save sets its values live on process.env and
 * then calls server.restart(), which re-evaluates this config IN-PROCESS.
 * Recomputing the snapshot there would classify the panel's own keys as
 * external (read-only) until the whole process is relaunched.
 */
const PROVIDER_ENV_AT_BOOT = globalThis.__GEV_PROVIDER_ENV_AT_BOOT ??= Object.freeze(Object.fromEntries(
  [...knownKeySetupEnvVars()].map((name) => [name, String(process.env[name] ?? '').trim()]),
));

/**
 * `dev-fresh.sh` resolves dotenv and Keychain values before it starts Vite, so
 * it supplies an explicit names-only provenance marker for values inherited
 * from its parent shell. Plain Vite launches use the raw boot snapshot above;
 * Pinokio deliberately treats its app-scoped ENVIRONMENT as authoritative.
 */
const DEV_FRESH_EXTERNAL_KEYS_AT_BOOT = new Set(
  String(process.env.GEV_KEY_SETUP_EXTERNAL_KEYS ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => knownKeySetupEnvVars().has(name)),
);

/** package.json version, for the browser Server Log entries. */
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version;

/** Owner audit trail, shown on /admin → Audit Log (names and codes only, never values). */
const adminAudit = createAdminAuditLog();

/**
 * The provider-key store behind /admin → API Keys
 * (src/admin/keys/providerKeyStore.mjs). It is handed the BOOT snapshots
 * above so a restart's re-evaluation cannot reclassify keys.
 */
const providerKeyStore = createProviderKeyStore({
  rootDir: __dirname,
  launcherAtBoot: LAUNCHER_AT_BOOT,
  providerEnvAtBoot: PROVIDER_ENV_AT_BOOT,
  devFreshExternalAtBoot: DEV_FRESH_EXTERNAL_KEYS_AT_BOOT,
});


// ---------------------------------------------------------------------------
// Regional cockpit briefing proxy + weather effects proxy
// ---------------------------------------------------------------------------
// Moved to src/data/regionalProxyHandlers.mjs — a mechanical relocation, not
// a redesign (see that file's header). `requiredFiniteQueryNumber` and
// `validRegionalPoint` are re-exported here because
// src/data/regionalProxy.test.mjs imports them directly from this module.
export { requiredFiniteQueryNumber, validRegionalPoint, regionalBriefHasAnySource };

// `makeRateLimiter`, `clientKey`, `readResponseJsonCapped`,
// `readResponseTextCapped`, and `coalesceProxyRequest` now live in
// src/server/proxyInfra.mjs (generic proxy infra, imported above) —
// re-exported here because src/data/regionalProxyHandlers.mjs and
// src/data/regionalProxy.test.mjs import them directly from this module.
export { makeRateLimiter, clientKey, readResponseJsonCapped, readResponseTextCapped, coalesceProxyRequest };

// `LL2_CACHE_TTL_MS` and `launchLibraryRequestHeaders` now live in
// src/data/rocketLaunchesProxy.mjs (imported above) — re-exported here
// because src/data/regionalProxy.test.mjs imports them directly from this
// module.
export { LL2_CACHE_TTL_MS, launchLibraryRequestHeaders };

// `keylessGooglePlacesResponse` now lives in
// src/data/googlePlacesContextProxy.mjs (imported above) — re-exported here
// because src/data/regionalProxy.test.mjs imports it directly from this
// module.
export { keylessGooglePlacesResponse };

// `validMilitaryInstallationBox` now lives in
// src/data/militaryInstallationsProxy.mjs (imported above) — re-exported
// here because src/data/regionalProxy.test.mjs imports it directly from
// this module.
export { validMilitaryInstallationBox };

// `adsbLolFallbackAnchor` now lives in src/data/openSkyProxy.mjs (imported
// above) — re-exported here because src/data/regionalProxy.test.mjs imports
// it directly from this module.
export { adsbLolFallbackAnchor };

/**
 * Forward-search (place name -> candidates) via Nominatim, for
 * `nominatimSearchProxy()` below. Only the top hit is used by callers
 * (src/geocodeProvider.js), matching Google Geocoding's `results[0]`-only
 * usage — so `limit=1`. Shares the same request queue/throttle as
 * `fetchRegionalPlace` (reverse geocode, src/data/regionalProxyHandlers.mjs)
 * via the imported `queuedNominatimFetch`/`fetchRegionalJson`/
 * `NOMINATIM_HEADERS` — this stayed in vite.config.js (out of scope for that
 * move) but must not spin up a second, independent Nominatim throttle.
 */
function fetchNominatimSearch(query, viewbox) {
  return queuedNominatimFetch(async () => {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '1',
    });
    if (viewbox) params.set('viewbox', viewbox);
    return fetchRegionalJson(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: NOMINATIM_HEADERS,
    });
  });
}

/**
 * Vite plugin: forward-geocode via Nominatim (search box, voice fly-to, voice
 * Radio — see src/geocodeProvider.js). Server-side because Nominatim's usage
 * policy requires a custom User-Agent, which browser `fetch` cannot set.
 */
export function nominatimSearchProxy() {
  function install(middlewares) {
    middlewares.use('/api/nominatim/search', async (req, res) => {
      if (req.method !== 'GET') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }
      if (!enforceOptInRateLimit(nominatimSearchRateLimiter(), req, res)) return;

      const url = new URL(req.url || '', 'http://localhost');
      const query = String(url.searchParams.get('q') || '').trim();
      if (!query) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'A non-empty q is required' }));
        return;
      }
      const viewbox = url.searchParams.get('viewbox') || null;

      try {
        const results = await fetchNominatimSearch(query, viewbox);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(Array.isArray(results) ? results : []));
      } catch {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Nominatim search is temporarily unavailable' }));
      }
    });
  }

  return {
    name: 'nominatim-search-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}

/**
 * Main Vite configuration factory.
 *
 * Loads .env files via Vite's loadEnv, registers Cesium + local proxy
 * plugins, configures the dev server host/port, and exposes selected
 * API keys to the client as import.meta.env defines.
 */
export default defineConfig(({ mode }) => {
  // Load only this checkout's dotenv files. A real shell/Keychain value still
  // wins, an EMPTY one counts as absence (loadEnv itself defers to empties, so
  // they must be pruned before it reads), and no sibling workspace is
  // consulted implicitly — see src/config/dotenvPrecedence.mjs.
  loadCheckoutEnv({ target: process.env, loadEnv, mode, dir: __dirname });
  const env = { ...process.env };
  const localAllowedHosts = ['localhost', '127.0.0.1', '.local'];
  return {
    plugins: [
      skipOnAdminPage(cesium()),
      // React is for the /admin dashboard only; the map app stays plain JS.
      react({ include: /src\/admin\/.*\.jsx$/ }),
      adminRoute(),
      // First of the server plugins: its failure watch must see every /api response.
      serverLogPlugin({ audit: adminAudit, aisFeedEvidence: aisStreamKeyEvidence }),
      adminAuthPlugin({ audit: adminAudit }),
      openSkyProxy(),
      celestrakProxy(),
      tomtomProxy(),
      firmsProxy(),
      myMapsProxy(),
      rocketLaunchesProxy(),
      terrainHeightsProxy(),
      adsbdbProxy(),
      overpassProxy(),
      osrmRouteProxy(),
      militaryInstallationsProxy(),
      regionalBriefProxy(),
      weatherEffectsProxy(),
      cctvProxy(),
      radioBrowserProxy(),
      gbfsProxy(),
      adsbLolProxy(),
      aisLiveProxy(),
      trackBackfillProxies(),
      openAiVoiceProxy({ audit: adminAudit }),
      googlePlacesContextProxy(),
      nominatimSearchProxy(),
      // Provider keys are managed only from /admin → API Keys (dev server only).
      adminKeysPlugin({ store: providerKeyStore, audit: adminAudit, aisFeedEvidence: aisStreamKeyEvidence }),
      systemHealthPlugin({ keyStore: providerKeyStore, audit: adminAudit, aisFeedEvidence: aisStreamKeyEvidence, appVersion: APP_VERSION }),
    ],
    server: {
      host: env.HOST || 'localhost',
      port: parseInt(env.PORT, 10) || 4173,
      // When binding to all interfaces, allow any host; otherwise restrict to local names
      allowedHosts: (env.HOST === '0.0.0.0' || env.HOST === '::')
        ? true
        : localAllowedHosts,
      fs: {
        // Pinokio keeps optional credentials in this ignored local file.
        deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/ENVIRONMENT'],
      },
      // Framing protection belongs on the APP DOCUMENT, not on API responses:
      // a browser evaluates frame-ancestors against the framed page's own
      // navigation response. Without this, a hostile page could frame
      // `/?setup=1`, align a lure over Provider Settings, and have the framed
      // app issue a perfectly same-origin credential write that passes every
      // Host/Origin check. These headers apply to everything this dev server
      // serves, which is what makes that attack impossible rather than unlikely.
      headers: {
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "frame-ancestors 'none'",
      },
    },
    // Expose selected API keys to the browser via import.meta.env.*
    define: {
      'import.meta.env.GOOGLE_MAPS_API_KEY': JSON.stringify(env.GOOGLE_MAPS_API_KEY),
      'import.meta.env.CESIUM_ION_TOKEN': JSON.stringify(env.CESIUM_ION_TOKEN),
      // App version stamped on browser Server Log entries (to reproduce a bug).
      'import.meta.env.GEV_APP_VERSION': JSON.stringify(APP_VERSION),
    },
    build: {
      // The Cesium engine bundle is inherently large; raise the warning ceiling
      // so the build log isn't dominated by an expected chunk-size notice.
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin.html'),
        },
      },
    },
  };
});
