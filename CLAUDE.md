# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EagleEye View (product name "God's Eye View" in commit history/docs) — a
browser-based, real-time geospatial intelligence console. Vanilla JS +
CesiumJS + Vite, no framework. Photorealistic 3D globe with live aircraft,
ships, satellites, earthquakes, traffic, CCTV, and a voice agent (OpenAI
Realtime API over WebRTC) that can drive the whole console hands-free.

`docs/CURRENT-STATE.md` is the **authoritative runtime reference** — read it
before making non-trivial changes; it documents current behavior, not
history. When conflicting, doc precedence is: `docs/CURRENT-STATE.md` →
`docs/opensky-auth.md` → `CHANGELOG.md`. Historical planning docs may not
match runtime behavior.

## Commands

```bash
npm run doctor         # checks Node/npm + which provider keys are configured (no key values printed)
npm run dev            # start Vite dev server (http://localhost:4173)
./scripts/dev-fresh.sh # macOS: clears Vite cache, pulls keys from Keychain, starts keyless-capable
npm run build          # production build — must stay green before any PR
npm test               # full unit suite (see below)
npm run test:track     # headless real-app tracking-invariant regression harness (needs dev server running)
```

Before sending a PR, `npm run build`, `npm test`, and `npm run test:track`
must all be green, with no new console errors.

### Running a single test

Tests are `node:test` files colocated with their source as `*.test.mjs`
(e.g. `src/data/traffic.js` → `src/data/traffic.test.mjs`). Run one directly:

```bash
node --test src/data/traffic.test.mjs
```

`npm test` (`scripts/run-unit-tests.mjs`) auto-discovers every `src/**/*.test.mjs`,
runs them in parallel, then runs two allocation microbenchmarks
(`src/data/focusAllocations.test.mjs`, `src/overlays/worldOverlayAllocation.test.mjs`)
serialized with `--expose-gc` — these are calibrated for Node 24 specifically
and are skipped (with a warning) on other Node majors unless
`GEV_REQUIRE_ALLOCATION_GATE=1` is set.

`npm run test:track` drives the actual running app in headless Chromium via a
`fetch` shim that injects synthetic aircraft/vessel data in real upstream
payload shapes, then asserts tracking-camera invariants (no jitter between
3D model position and detection/HUD position, no pull-out on target switch,
no cross-layer tracked-entity orphaning, clean init across all layers). It
requires the dev server already running at the target URL.

The `scripts/qa-*.mjs` fleet are additional headless/browser QA harnesses
(traffic, CCTV, cockpit, focus/horizon evidence, map-source tray, etc.).
`scripts/qa-l9-matrix.mjs` orchestrates the full fleet plus `track-regression`
as one release-candidate gate; checks a target build can't support are
SKIPPED with an OWNER-RUN tag rather than failed.

Engine requirement: Node `>=24.14.0 <25 || >=26 <27` (enforced in
`package.json`; the allocation-test calibration above is a stronger version
pin than this range implies).

## Architecture

### The layer contract (the core extension point)

Every live data source is one self-contained module in `src/data/<layer>.js`
implementing a common interface: `init/enable/disable/update/destroy`, plus
optional `getStats()` and `getDetectableObjects()`. `src/data/manager.js`
(`DataLayerManager`) owns registration, enable/disable lifecycle, and update
polling loops for all of them. Toggling is race-guarded: rapid
enable→disable→enable does not arm duplicate poll intervals (a documented
past bug class — see `docs/CURRENT-STATE.md` and `known-issues`), and
cross-layer tracked-entity handoff (e.g. switching a tracked target from a
military to a commercial aircraft layer) must clear the origin layer's
`getTrackedInfo()`.

Adding a layer = add `src/data/<layer>.js` following an existing layer as a
template, register it, and if it needs a private key or upstream fetch, add a
proxy route in `vite.config.js` (see below) — never fetch third-party APIs
with secrets directly from the browser.

### UI vs. layer logic — kept strictly separate

- **`src/ui.js`** — the runtime UI: panels, HUD wiring, style switching, the
  control facade. This file is large (10k+ lines); when editing, search for
  the specific control/panel by name rather than reading it top to bottom.
- **`src/hud.js`** — intelligence HUD + AI scene-summary text.
- **`src/data/<layer>.js`** — one file per data layer (see contract above).
  Layer logic never reaches into `ui.js` internals directly; it exposes
  `getStats()`/state that the UI reads.
- **`src/mapStackController.js`** — basemap switching (Google Photorealistic
  3D / Esri / OSM / Cesium ion-hosted stacks), including automatic OSM
  fallback if Esri is unreachable.
- **`src/voice/`** — OpenAI Realtime session (`gevRealtime.js`) + the tool
  execution layer (`gevActions.js`, 28 tools). Tools are *declared*
  server-side (`GEV_REALTIME_TOOLS` in `vite.config.js`) and *executed*
  client-side in `gevActions.js` — a new voice capability touches both. Voice
  responses only ever confirm actions that actually succeeded.
- **`src/annotations/`** — the voice-driven map whiteboard (persistent
  polygons/marks/routes drawn onto the 3D world by voice command).
- **`src/scenes/`** — `director.js` (cinematic camera scene playback) +
  `recipes.js` (staged "one-click mission" layer/camera presets).
- **`src/styles/`** — GLSL post-process visual styles (CRT, NVG, FLIR/thermal,
  Noir, Snow, anime/retro). One file per style.
- **`src/data/local_data/`** — bundled static datasets (dams, datacenters,
  submarine cables, SF neighborhoods, Natural Earth regions), each with its
  own provenance tracked in `DATA_SOURCES.md`.

### `vite.config.js` — the proxy/secrets boundary

This file (large; it's effectively the backend) registers dev-server proxy
middleware for every upstream API that needs CORS bypass, an API key, or
response shaping/caching: OpenSky, CelesTrak, Overpass (OSM), GBFS, CCTV
frame/media fetches, adsb.lol, AISStream (websocket-backed), Re:Earth terrain
heights, TomTom traffic tiles, NASA FIRMS, military-installation context,
regional briefing (place/weather/news), Open-Meteo weather, Launch Library 2,
and Radio Browser. It also defines which env vars get exposed to the client
bundle via `import.meta.env.*` — only `GOOGLE_MAPS_API_KEY` and
`CESIUM_ION_TOKEN` are ever browser-exposed by design; every other key
(`OPENAI_API_KEY`, `AISSTREAM_API_KEY`, `TOMTOM_API_KEY`, `FIRMS_MAP_KEY`,
OpenSky credentials) is server-side only, and the browser receives only
ephemeral tokens (e.g. `/api/realtime/token` for OpenAI Realtime) or
same-origin cached responses.

When adding any new external data source: add the proxy route here, add the
source allowlist server-side (never trust a client-supplied upstream URL —
see the CCTV/Overpass proxies for the pattern), and cache/rate-limit it the
way the existing proxies do — this app is designed to survive an afternoon of
exploration without torching a free-tier API budget (OpenSky credit
governor, TomTom daily tile budget, disk-cached TLEs, etc.).

### Keys and local dev config

No key is required to start — the app boots on keyless Esri World Imagery +
keyless terrain, with automatic OSM fallback. Keys are runtime upgrades, set
via the in-app **POWER UP** panel (writes to `.env`, or `pinokio/ENVIRONMENT`
under the Pinokio launcher — both made owner-only before a secret is
written), or via `.env` / shell env / macOS Keychain for headless/scripted
setups. `npm run doctor` reports what's configured and where, without ever
printing credential values. Full key map and proxy-route ownership: `README.md`
§API Keys, `docs/CURRENT-STATE.md` §Auth + Launch.

### Testing conventions

- `node:test` + `node:assert/strict`, one `*.test.mjs` per source file,
  colocated (not in a separate `__tests__` tree).
- Prefer testing pure helper functions extracted from a layer/UI module over
  testing the stateful module directly (see `src/data/traffic.js` +
  `trafficFeedPresentation`/`deriveTrafficFlowError` for the pattern: the
  layer's `getStats()` is a thin caller over an independently tested pure
  function).
- `TESTING.md` documents a separate manual field-test script for voice/
  tracking scenarios (not part of the automated gates) — useful context if
  touching voice annotation or live-tracking-camera behavior, but not
  something to run for ordinary changes.

## Conventions

- ES modules, 2-space indent, single quotes, semicolons.
- JSDoc on exported/public functions.
- Conventional-commit-style prefixes (`feat:`, `fix:`, `perf:`, `docs:`) are
  appreciated, not required by tooling.
- If a change alters runtime behavior, update `docs/CURRENT-STATE.md` and
  `CHANGELOG.md` in the same change set. If it adds/changes a data source,
  update `DATA_SOURCES.md` with license/attribution — don't bundle
  redistribution-restricted data; fetch it at runtime instead.
- Product boundary (enforced in review, not code): this project models
  events/assets/infrastructure/systems (aircraft, vessels, satellites, fires,
  cameras, cities) — not named-person search, face recognition, or
  individual tracking. PRs crossing that line aren't merged.
