# EagleEye View Current State

Updated: October 1, 2026

## Canonical Docs Order

Use docs in this order when details conflict:

1. `docs/CURRENT-STATE.md` (this file)
2. `docs/DECISIONS.md` — design rationale / decision history; read this when
   you need to know WHY a value or behavior is what it is, not WHAT it is
3. `docs/opensky-auth.md` (OpenSky authentication)
4. `CHANGELOG.md` (release history)

Historical planning documents may not match runtime behavior.

## Current Baseline

- Repository metadata and public URLs use the `bilawalsidhu/gods-eye-view`
  project identity. Runtime behavior is defined by this document and the current
  source tree rather than historical branch notes.

## Runtime Stack

- Vite + CesiumJS app with Google Photorealistic 3D Tiles
- Scene/HUD/style systems in `src/ui.js` and `src/hud.js`. `ui.js`'s single
  `StyleManager` class has its Adaptive Panel Layout, CCTV panel, Radio
  panel, Global Context mode (Contacts / Space Missions), and Navigation
  Authority + Location Bar method groups composed in via prototype mixins —
  `src/panelAdaptiveLayoutMixin.js`, `src/cctvPanelMixin.js`,
  `src/radioPanelMixin.js`, `src/contextModeMixin.js`,
  `src/navigationLocationMixin.js` (each
  `Object.assign(StyleManager.prototype, ...)` right after the class body) —
  rather than defined inline, to keep the file within a reviewable size.
  Field declarations/initialization stay in the `StyleManager` constructor
  in `ui.js`; only method bodies moved, so `this.methodName()` call sites
  elsewhere in `ui.js` are unchanged. Shared panel-position constants live
  in `src/panelPositionConstants.js`. The `setContextMode()` public facade
  and `_handleContextLayerChange()`'s sole caller, `attachDataManager()`,
  stay in `ui.js` — see `src/contextModeMixin.js`'s header for the
  extraction boundary rationale. Orbit mode (`_initOrbit`/`_toggleOrbit`/
  `_stopOrbit`) and the `setOrbit()` public facade likewise stay in `ui.js`
  — same rationale: orbiting a POI only reads the navigation/location
  fields the mixin owns, it isn't part of navigation/location selection
  itself — see `src/navigationLocationMixin.js`'s header.
- Layer management in `src/data/manager.js`
- Map stack switching in `src/mapStackController.js`
- Voice control in `src/voice/` (OpenAI Realtime over WebRTC)
- Voice map whiteboard annotations in `src/annotations/`
- 3D aircraft/model tracking surfaces in `src/data/flights.js` and `src/data/militaryFlights.js`
- Detection overlay and tracked-target readout in `src/data/detection.js`, `src/data/detectionDraw.js`, and `src/data/trackedReadout.js`
- Proxy middleware and API wiring in `vite.config.js`

### Data layer registration: lazy-loading + the manager facade (September 2026)

- All 13 non-bundled data layers register via
  `DataLayerManager.registerLazy({ id, name, icon, source,
  showInTogglePanel, hasRowControls, loader })` in `src/main.js`, not a
  static `import` + `register()` pair. `loader` is a
  `() => import('./data/<layer>.js').then((m) => m.default)` thunk; nothing
  is downloaded or parsed until the layer is actually enabled (UI toggle,
  voice command, or a restored enabled-layer state resolves it). The
  manager resolves a lazy entry's module exactly once (memoized on
  `entry.resolvePromise`), validates the resolved module's `id` matches the
  registration, and automatically calls the module's own
  `attachDataManager()` the moment it first resolves — a layer file never
  needs an explicit post-registration `attachDataManager()` call in
  `main.js`. This is the standard pattern new layers should follow;
  `src/data/layerMetadata.js` is the single source of truth for each
  layer's toggle-panel metadata (`name`/`icon`/`source`/`showInTogglePanel`/
  `hasRowControls`), spread into `main.js`'s `registerLazy()` call so it
  isn't duplicated inline.
- `src/data/localLayers.js`'s bundled static datasets (dams, datacenters,
  submarine cables, FIRMS heatmap context) stay eagerly `register()`-ed —
  already lightweight, intentionally out of scope for lazy-loading.
- **`ui.js` and `voice/gevActions.js` never reach into a layer module's
  internals directly** (`dataManager.layers.get(id).module.someMethod()`)
  — a lazy module may still be unresolved at the moment of the call, and a
  direct read would either throw on `null` or (worse) silently force-load a
  layer the user never enabled. Both files instead call through
  `DataLayerManager`'s facade: `callLayerMethod(layerId, methodName,
  ...args)` (generic escape hatch; looks up the entry fresh, no-ops with a
  documented fallback if the module/method is missing, catches and warns on
  a synchronously-thrown error, never throws) plus purpose-named wrappers
  for the layer methods `ui.js` calls most (`getTrackedInfo`,
  `stopTracking`, `refocusTrackedById`, `clearSelection`,
  `releaseCameraOwnership`, `subscribeLayer`, `getLayerUIState`,
  `getDetectableObjects`, `getLayerDisplayName`, and, scoped specifically to
  the Contacts coordinator, `getContextSnapshot`/`navigateNext`/
  `focusTarget`). `subscribeLayer` on a still-unresolved lazy layer queues
  the callback and replays it once the module resolves, rather than
  silently dropping it — this is what lets the always-visible CCTV sync
  chip and cockpit radio mini-player keep working even though CCTV/Radio
  themselves no longer eagerly subscribe at boot.
- **Not every layer achieves a separate build chunk.** `earthquakes`,
  `bikeshare`, `traffic`, `radio`, `rocket-launches`, and `cctv` code-split
  cleanly. `flights.js`, `militaryFlights.js`, `satellites.js`,
  `aisLiveVessels.js`, `militaryInstallations.js`, and `militaryAwareness.js`
  do not — Rollup only moves a module into its own chunk when *every*
  import path to it is dynamic, and `militaryAwareness.js` (the Contacts
  coordinator) statically imports `flights.js`/`militaryFlights.js`/
  `aisLiveVessels.js`/`militaryInstallations.js` internally for its own
  cross-layer proximity math, while `voice/gevActions.js` keeps a direct
  import of `satellites.js`'s `getNextIssPass` and two `militaryAwareness.js`
  helpers. This is an accepted, explicit tradeoff, not an oversight: the
  specific functions involved read live, non-pure module state internally
  (e.g. the live TLE catalog, or `flightsLayer.getNearby`/
  `militaryFlightsLayer.getNearby` results), and extracting them into
  standalone pure files was judged riskier than the bundle-size win was
  worth. A user who opens Contacts/Global Context almost certainly wants
  flights/military/vessel data anyway, so the larger chunk lands on exactly
  the users who need it. Do not "fix" this by force-converting these
  imports to dynamic without re-deriving the same purity analysis first.

### Source layout: layers and large classes are split into small modules

- Every large layer and class is a thin parent file plus sibling modules in
  the same directory, so a change is read and made in one 100–700 line file
  instead of a 2,000–5,000 line one. The public contract does not change: the
  parent keeps the layer interface (`init/enable/disable/update/destroy/
  getStats/getDetectableObjects`), every export, and every `*ForTest` hook,
  and importers keep importing the parent.
- **Layers with module-level state** (`cctv`, `flights`, `militaryFlights`,
  `rocketLaunches`, `traffic`, `satellites`, `radio`, `aisLiveVessels`,
  `militaryAwareness`, and `overlays/worldOverlay`) keep that state in one
  exported object `S` in `<layer>State.js` (`worldOverlayCoreState.js` for the
  overlay). Sibling modules `import { S }` and read/write `S._x`; no sibling
  redeclares state. New layers follow the same shape rather than growing a
  single file.
- **Classes** (`StyleManager` in `ui.js`, `DataLayerManager`,
  `gevRealtime`, `cockpitViewController`) are split into mixin modules
  (`uiStyleStages.js`, `managerUpdate.js`, …) applied with
  `Object.assign(Class.prototype, …)` in the parent; a method name defined in
  two mixins is won by the later assignment, so a name is defined once. The
  `StyleManager` constructor stays whole in `ui.js`.
- `gevActions.js` and `annotations/annotationResolver.js` are plain
  function-cluster extractions with no shared state.
- CCTV follows the same rule beyond the layer itself: the dev-server proxy
  `cctvProxy.mjs` keeps request handling and delegates to
  `cctvSourceCatalog.mjs` (source loading), `cctvSourceNormalize.mjs`
  (record normalization), `cctvSyntheticFrame.mjs` (placeholder frames),
  `cctvHealthStore.mjs` (bounded per-camera health), `cctvProxyPayloads.mjs`
  (`/sources` and `/stream` JSON shapes) and `cctvStreetView.mjs` (Street View
  fallback frame), and the projection runtime and HLS self-heal split into
  `cctvProjectionPlane/Frames/Video.js` and `cctvHlsBackoff/Config/Stall/
  SelfHeal/Visibility.js`. A new module in these families is added beside
  its siblings instead of growing the parent.
- **Source-text tests** do not read the parent directly: they call
  `readLayerSourceText(file)` from `src/data/layerSourceText.testutil.mjs`,
  which concatenates the parent and its sibling modules (mixins first, in
  the order the parent assigns them; `S._x` normalized back to `_x`) so an
  assertion about a method body holds wherever the method lives. A newly
  split file is registered there.
- Parent files stay small: most layer parents are 100–500 lines, and the two
  largest, `manager.js` and `ui.js`, are about 1,100 and 800 lines. Exact
  sizes drift with every feature, so `envman health` is the source of truth
  rather than this file. See `docs/DECISIONS.md` for why state
  moved into `S`, why the manager state machine and the `StyleManager`
  constructor stay whole, and why the old one-shot codemods are archived in
  `archive/split-codemods-2026/`.

### Render Governor and Scope Mask

- The app idles via an explicit render governor (`src/renderGovernor.js`):
  every per-frame animator holds/releases against it, and discrete mutators
  call `governorRequestRender`. Any new per-frame visual animation must
  register a hold; any new discrete scene mutation must request a frame —
  `scripts/qa-perf.mjs` is the gate. Hidden tabs stop the render loop.
- The circular scope is an explicit canvas (`src/scopeMask.js`, DISPLAY-rail
  SCOPE toggle + FEATHER slider, hash keys `sc`/`scf`), not a style-stage
  effect. The scope's OUTSIDE terminus is altitude-adaptive: 0.94 at/above
  10 Mm so faint stars survive in the corners of a true full-globe view,
  fading quickly (smoothstep) to fully opaque by 7 Mm — every working
  altitude below that is solid black, because the same 6% bleed reads as
  smeared geometry there. Hash key `sce` pins the terminus and is clamped to
  94..100 on both parse and write (out-of-range clamps into the band; absent
  or non-numeric uses the adaptive default), so a shared link can neither
  freeze the ramp by accident nor carry an unsupported sub-94 terminus.
  Repaints are gated on a quantized 0.005 alpha step, so a full 20 Mm→ground
  descent costs 12 canvas repaints and a parked camera costs zero. SCOPE OFF
  costs less still: no height sampling and no canvas work after the single
  clear on the disable transition. The hard-crop (FEATHER 0) path honors the
  same terminus. See `docs/DECISIONS.md` for why these specific altitude/
  clamp values were chosen.
- Four layers take conditional (not unconditional) continuous-render holds,
  following the `militaryAwareness.js` shape (a pure predicate evaluated on
  an existing cadence, feeding a `sync<Layer>RenderHold()` that acquires/
  releases the hold; `enable()`/`init()` call it once immediately;
  `disable()`/`destroy()` keep an unconditional release as a hard backstop):
  - `aisLiveVessels.js` — holds only while a focus/de-emphasis transition is
    in flight (`syncAisRenderHold()`, reusing `focusPassIsNeeded()`); a poll
    landing while idle explicitly requests one frame
    (`governorRequestRender('ais-vessels-poll')`).
  - `traffic.js` — holds based on `trafficNeedsContinuousRender({ dotCount
    })`; dots only exist for the loaded/bounds-clamped viewport, so existence
    is a reasonable on-screen proxy.
  - `satellites.js` — holds based on `satellitesNeedContinuousRender({
    showPoints, anyPointOnScreen })`, piggybacking on the existing
    `_propagateAll()` cadence rather than adding a second one.
  - `rocketLaunches.js` — mission replay is a discrete, explicit opt-in mode
    with its own hold, `'rocket-replay'`, acquired in `startMissionReplay()`
    and released in `stopMissionReplay()`; the layer-wide `'rocket-launches'`
    hold in `enable()`/`disable()`/`destroy()` is separate and unaffected.
  - `flights.js` / `militaryFlights.js` still hold unconditionally on
    purpose: detection paints its HUD AIR brackets from live aircraft
    positions every frame and takes no part in detection's own
    change-notification system, so the only reason a bracket doesn't go
    stale on a parked scene is that the aircraft layers force continuous
    repaint. Giving detection its own per-object delta signal is separate,
    undone design work — see `docs/DECISIONS.md`.
- Detection (`src/data/detectionRenderDemand.js`) takes no continuous-render
  hold at all: it repaints on change and requests exactly one more frame
  while work spanning frames is still outstanding. Measured on a parked
  scene with zero layers: 0 renders per 5 s with detection ON, identical to
  OFF. See `docs/DECISIONS.md` for the invariants this depends on.

### First-Run Launcher

- After startup settles, a fresh session gets one card
  (`src/firstRunExperience.js`, `#first-run-launcher`) offering **Live
  Contacts · Space Missions · Environmental · Explore manually**. No layer
  and no optional API call happens until a tile is clicked. The right-hand
  DISPLAY rail (`pp-toggles`) starts collapsed on a first run rather than
  expanded — a stored collapse state still wins.
- The ENVIRONMENTAL tile is quakes AND fires — live USGS earthquakes plus
  NASA FIRMS active fires (`layerIds: ['earthquakes', 'local-firms']`). The
  launcher optimizes for the fully configured experience and does not trim
  what it offers down to the lowest-configured install; the mission does not
  branch on whether a key is present. Keyless, the honest surface is the
  layer row, which reads `UNAVAILABLE · NASA FIRMS · LIVE · KEY REQUIRED`,
  and the earthquakes half still delivers in full. The shared loading
  reducer treats an explicitly declared missing optional key as a
  configured terminal state rather than a failed multi-layer mission, so
  the global chip completes without showing `LOAD FAILED`; a genuine
  lifecycle or fetch failure still retains failure priority.
- An INFRASTRUCTURE tile is deliberately absent: one click enabling
  `local-datacenters` + `local-dams` + `telegeography-submarine-cables` puts
  ~5,700 entities on a full-earth view and the frame rate goes with them.
  The layers are unchanged and still reachable by hand and by voice
  ("infrastructure mode" is still mapped). See `docs/DECISIONS.md`.
- Show policy is NOT one-shot. Precedence, highest first: a share link never
  sees it → `?welcome=0` suppresses → `?welcome=1` replays (past both
  suppressions, for demos/support) → the durable
  `localStorage['gev:first-run-mission:v1'] === 'suppressed'`, written only
  by the "Don't show this again" checkbox → the per-session
  `sessionStorage['gev:first-run-mission-session:v1'] === 'dismissed'`,
  written by every close path (mission, Explore, ESC). It returns each
  fresh browser session until the visitor ticks the box; clearing storage
  un-ticks it. Both stores fail open — an unreadable store still shows the
  launcher rather than silently swallowing first launch.
- What a mission may persist: layer enablement is durable in this app
  (`gev:layer-state:v2`, written by `LayerStateCoordinator._commitExplicit`
  only for origin `user`/`voice`/`tool`). A mission enables its own layers
  at `origin: 'user'` — durable, exactly as clicking those rows is. The two
  Context missions also expand the Context panel; the globe missions open no
  panel. Everything else is off limits: detection mode/density,
  `gev:detection-allocation:v1`, 3D models, feather, and
  `_detectionUserOverridden` above all — setting that flag means "the
  operator hand-edited detection" and would silently disable the
  CRT/NVG/FLIR auto-preset contract for the session. The full table is a
  comment block in the module and is pinned by
  `src/firstRunExperience.test.mjs`.
- Voice is instruction-only for the launcher's missions: both globe missions
  are expressible with shipped tools (`set_layer_visibility`'s enum already
  carries `local-datacenters`, `local-dams`,
  `telegeography-submarine-cables`, `local-firms`, `earthquakes`;
  `zoom_to_globe` supplies the camera), so `GEV_REALTIME_TOOLS` stays
  byte-identical to `main` and is pinned by sha256 in the unit suite.
- **ESC arbitration — three rules, kept separate on purpose.** (1) The
  launcher yields: a MutationObserver watches `body` for the surfaces that
  take the screen (`cockpit-mode`, `scene-playback-mode`, `recording-mode`,
  `ui-clean-view` — `EXCLUSIVE_SURFACE_CLASSES`, kept in step with the CSS
  hide rule by a unit pin), and session-dismisses rather than contesting the
  key; if one is already up at init it waits instead of appearing over it.
  (2) A surface can take the screen with no class to watch (e.g. the Cesium
  attribution lightbox at `z-index: 200` against the card's `175`), so
  `isTopmost()` also hit-tests the card's own centre with
  `elementFromPoint`; any overlay, classed or not, disarms the handler.
  Every inconclusive answer counts as uncovered. (3) A small control that
  claims only the key (a disclosure, a popover) is not something to yield
  to: whoever handles ESC first calls `preventDefault()` and
  `stopImmediatePropagation()`, and the launcher skips `defaultPrevented`
  events — `stopPropagation()` alone does not stop later listeners on the
  same `document`.
- **Accepted:** a surface class that never clears means no launcher for that page
  load, with no timeout. None of the four classes is restored at
  startup, so an already-blocked init is an error path, while a long
  recording or clean-view session is ordinary — a "reveal anyway" timer
  would trade a benign no-show for the card punching through a recording in
  progress. The no-show is benign: the handler is inert, no session flag is
  written, the observer still reveals the card if the class clears, and it
  returns next session either way.
- Blocked storage un-ticks the box: "Don't show this again" is a claim about
  the future, so a refused `setItem` reverts the checkbox and says so in the
  status line instead of showing a saved preference that was never saved.
- Gates: `node scripts/qa-firstrun.mjs --url <app>` (in-app checks across
  eight independent sections) plus its `--teeth` negative control, which
  removes the launcher and requires every launcher-dependent section to go
  red — it always exits non-zero, `1` meaning the control is healthy and `2`
  meaning it is not. Plus the unit pins referenced above.

### Active Data Layers in Runtime

Qualified Radio playback requests—category, station, country, coordinates, or
nearby place—always use station selection. Unqualified “turn on/start the radio”
requests use Play; a qualified Play-shaped tool call is normalized to Select so
its criteria cannot be silently ignored.

| Layer | Source | File | Proxy | Update Interval |
|-------|--------|------|-------|-----------------|
| Live Flights ✈️ | OpenSky Network; bounded adsb.lol regional fallback | `src/data/flights.js` | `/api/opensky` (OAuth + fallback) | 30s |
| Military Flights 🎖️ | adsb.lol /v2/mil | `src/data/militaryFlights.js` | `/api/adsblol/mil` | 15s |
| Live AIS Vessels 🚢 | AISStream websocket | `src/data/aisLiveVessels.js` | `/api/ais-live` | 60s (+800ms visibility pass) |
| Mapped Installations ⌖ | OpenStreetMap mapped context; on-demand Google Maps Places supplement | `src/data/militaryInstallations.js` | `/api/military-installations`, `/api/google/text-search` | viewport-driven + user search; while unavailable, auto-retry 30 s → 240 s backoff |
| Earthquakes | USGS | `src/data/earthquakes.js` | — | 60s |
| Satellites | CelesTrak | `src/data/satellites.js` | `/api/celestrak` | 120s |
| Space Missions (30d) | Launch Library 2 + CelesTrak | `src/data/rocketLaunches.js` | `/api/launches` + `/api/celestrak/active` | 5 min |
| Traffic | OSM Overpass (+ optional TomTom live flow) | `src/data/traffic.js` | `/api/overpass` + `/api/tomtom` | viewport-driven |
| CCTV | Austin + Caltrans (CA) + TfL London Open Data + Street View fallback + 5-camera **unofficial** Indonesia HLS pack (see below) | `src/data/cctv.js` | `/api/cctv` | 10s (active) |
| Radio | Radio Browser (public-domain station directory) | `src/data/radio.js` | `/api/radio/stations`, `/api/radio/click/:uuid` | 45 min directory refresh |
| Bikeshare 🚲 | GBFS (Lyft + BCycle) | `src/data/bikeshare.js` | `/api/gbfs` | 60s |
| Datacenters ▣ | OSM extract (bundled) | `src/data/localLayers.js` | — | static |
| Dams ▰ | OpenInfraMap/OSM extract (bundled) | `src/data/localLayers.js` | — | static |
| Submarine Cables ◠ | TeleGeography public map (bundled) | `src/data/telegeographySubmarineCables.js` | — | static |
| FIRMS Active Fires ▲ | NASA FIRMS live (VIIRS ×3 NRT, trailing 24h) | `src/data/firmsHeatmap.js` | `/api/firms` (`FIRMS_MAP_KEY`) | 10 min (proxy TTL 30 min) |
| Tsunami Shelters & Sirens (Sumbar) ◭ | Two shared Google My Maps documents (58 shelter buildings, 86 sirens), unofficial | `src/data/localLayers.js` (`local-sumbar-tsunami`), parser `src/data/myMapsKml.mjs` | `/api/mymaps/sumbar-tsunami` (allowlisted map ids, 6 h cache, stale-on-failure) | loaded on enable |

`src/data/militaryAwareness.js` remains registered internally as the Contacts
coordinator, but it is not a user-visible Data Layers entry. Its visible entry
point is the right-side `CONTEXT` chooser's `CONTACTS` mode.

At global scale, ambient Radio cluster badges are hard-opacity shared-host
entries: count/category updates and identity replacement do not run keyhole or
enter/exit ramps. Shared collision, viewport rejection, allocation, and horizon
culling can still remove an invalid placement, and Cesium still owns the cluster
point geometry and picks. Their 50,000 km line-of-sight range covers the
supported full-globe camera above 24,000 km, including farther horizon clusters.
Unclustered visible stations publish nearest-first ambient labels through that
same host, capped at 16 labels globally, 32 at intermediate zoom, and 48 nearby;
cluster and singleton candidates still share the Radio source's 64-entry ambient
cohort. Cesium continues to own each 13 px station point, horizon visibility,
and direct/nearby picking. Native points and shared-host text use one 50,000 km
interaction limit, so a painted singleton or cluster label always retains a
pickable point at its anchor throughout the supported high-global view. No
Radio entity uses native Cesium label text.

Delivery constraint: PR #10 is stack-only and unsafe standalone. PR #11 owns
the required Radio lifecycle/authority repair, so PR #10 must not merge or ship
unless PR #11 is included in the delivered stack.
Selected and singleton globe labels use the same compact 30-character
presentation: a credible explicit or leading-decimal frequency is rendered
first (`93.9 FM — Station`), otherwise the station name is ellipsized. Full
upstream names remain unchanged in the directory, player, and search state.
Fresh Radio sessions open on All stations while enable and restoration remain
silent. Directory refreshes retain cluster overlay identity for unchanged
represented membership and discard only identities containing removed stations.
When the user explicitly clicks Enable inside the expanded Radio section, the
Context panel performs one internal post-render scroll to reveal the station
filter and primary transport together without moving keyboard focus, the page,
or the globe. Compact controls, voice/tools, restoration, Data Layers, and
programmatic activation do not trigger this reveal.

Radio directory admission is atomic on both sides of the proxy boundary. A
refresh is healthy only when it reaches the minimum accepted-query and station
coverage; schema-valid responses with zero normalized stations count as failed
queries rather than inflating refresh health. Each specialist query also needs
an accepted station whose normalized tags match that requested category; rows
tagged only for another category remain usable catalog data but do not earn
specialist health credit. A partial cold result remains
usable but is explicitly `DEGRADED` and has no accepted catalog generation, while a
partial or malformed refresh cannot replace a warm catalog. The client likewise
rejects stale/future freshness metadata, incomplete rows, and empty catalogs as
a whole, preserving its last usable stations with `STALE`/`DEGRADED` state.
Every healthy admission publishes a monotonically increasing generation scoped
to a restart-stable `catalogInstance` token (a new server process starts a
fresh sequence — never read as a repeat or a regression) with a deeply
immutable station snapshot; stale/degraded warm responses retain the same
generation so tuner and cluster consumers can preserve exact station identity.
Generation semantics assume the app's actual single-process dev-server
deployment; concurrent replicas behind one origin are out of scope.
The client snapshot contains only the normalized station-field allowlist,
preserves object identity for an idempotent repeat of the same generation, and
degrades without replacement if a fresh response presents an older generation.
Snapshot records mark community metadata as untrusted, and Radio tool results
omit station names so directory text never becomes model instruction context.
One bounded country parser maps recognized ISO codes and English/common names
through proxy metadata and final station selection, while malformed, non-ISO,
control-containing, and oversized inputs fail closed. Literal or resolved
non-global IPv4/IPv6 targets are refused. Destroy fully releases the Radio audio
session, voice ducking/restoration, request state, filter, selection, volume,
accepted snapshot, and feed telemetry before re-initialization; monotonic
ownership tokens plus the session boundary keep late callbacks from a retired
session inert.
A tuner drag resolves previews against the single accepted snapshot captured at
pointer-down, even while a newer catalog is admitted. Release starts playback
only when the current same-ID record still exactly matches the frozen
presentation and stream metadata; removal or replacement reports the channel as
unavailable and never silently retargets the drag. A cold degraded fallback may
still populate the directory and globe, but its null accepted generation cannot
populate or begin the tuner.

Context entry and exit consider both rejected lifecycle promises and resolved
`false` manager results to be transaction failures. Entry awaits isolation and
restores the exact prior layer snapshot when isolation or activation fails;
when a direct Context shell fails after lifecycle work starts, reconciliation
waits outside the manager notification until that shell's queue settles, then
restores the complete snapshot rather than treating the in-flight layer as an
exclusion. An uncertain shell is retried and incomplete cleanup retains the
snapshot for a later restore. Direct-shell isolation and its compensating
rollback share one operation-scoped notification token, so an inner lifecycle
failure cannot announce separately from the outer blocked action. Context exit
waits for every sibling transition, retains the exact pending snapshot
after failed compensation, and can retry it later instead of silently reporting
a partial restore. User-facing Context chooser, direct Data Layer shell,
mapped-installation Search, rollback/exit, and Radio chip routes settle those
failures through the existing toast surface, release busy controls, and avoid
unhandled promises. A wrapped operation owns exactly one failure or blocked
notification; its synchronous manager event is suppressed only for that
operation, while unwrapped lifecycle failures retain the manager-level fallback.
The toast is a polite atomic status announcement.
When no tracked entity owns the follow camera, Radio Previous/Next and tuner
previews rotate to the requested broadcaster without changing zoom. A local
view whose optical center remains safely over the Earth, or a full globe already
contained in the viewport keyhole, uses one direct station flight and preserves
its initiating view angle. If a fit-capable Earth disc is clipped/off-center, or
a closer oblique view leaves the viewport center outside the Earth disc, Radio
first animates a centered north-up nadir composition, then focuses the latest
station from that canonical frame. Closer views keep their initiating altitude;
an extreme zoom-out is capped at 13,000 km so recovery returns to a useful
whole-globe scale instead of preserving an empty-space view. The two-stage navigation has one generation:
a playback fallback retargets it to the broadcaster that will play, while a newer
Radio action—including direct globe or non-moving voice selection—supersedes
older callbacks, and layer disable/destroy invalidates
the pending stages. While Flights, Military Flights, or any other
`viewer.trackedEntity` is active, Previous/Next and tuner previews continue to
change station and playback without cancelling or flying the camera. Tracking
acquired between the recenter and focus stages suppresses the later stage, and
a delayed fallback rechecks the same live ownership. Voice Radio navigation
remains non-moving; explicit station focus remains a separate user-requested
route and also yields to a live tracked entity.
The Radio tuner exposes the complete current filtered directory, up to 750
stations, in stable catalog and filter order. Needle progress is absolute across
that directory: the left, center, and right of the control resolve to the first,
middle, and last available station. Every position snaps to a real station, so
there are no selectable static gaps. During a drag, the bounded virtual tape
moves left as the needle moves right and travels faster than the needle without
creating DOM nodes for the complete directory. Camera movement never re-ranks or
rebuilds this order. Tuner-owned preview flights remain monotonic on the captured
strip, and release commits the frozen station before selection and playback
settle. That exact release clears older fallback ownership, so a broadcaster
failure cannot silently play a station left over from an earlier non-playing
cycle; the failed target retains its static/error handoff until Stop or another
explicit choice. Pointer cancellation instead cancels the active preview flight and
restores the exact pre-drag station ordering, absolute position, and frozen
presentation-only marker without starting a replacement camera flight,
committing, or autoplaying. That marker is restored even when an
accepted concurrent catalog removes the station or replaces its metadata, but
it never becomes current playback authority. The next accepted healthy catalog
refresh clears that presentation-only marker, including when the accepted
generation repeats and the immutable directory snapshot is intentionally kept
by identity. Every accepted filter action also clears and rebuilds the marker,
including a request for the already-active filter; a lifecycle-rejected filter
event leaves the restored marker and tuner band untouched. An accepted filter
action synchronously rebuilds the complete navigation pool after the layer state
notification, so Previous/Next and the tuner cannot observe an empty interim
directory. This restoration
also holds at either directory endpoint. Previous/Next traverses the same stable
pool and updates the absolute tuner position.
Cluster refresh identity follows the prior cluster contributing the greatest
absolute number of stations to the new cluster. This preserves majority identity
during merges instead of allowing a fully retained minority to win; deterministic
similarity and stable-ID tie breakers cover equal contributors and splits.
Every positive overlap participates in greatest-contributor discovery, so ratio
thresholds cannot discard a diffuse or one-station maximum. Inheritance is
bilateral mutual-best: a current cluster accepts only a greatest contributor and
a prior identity transfers only to a strongest split child. If that identity is
already claimed by an equal or stronger child, the later cluster receives fresh
identity instead of falling through to a historical minority. Disjoint clusters
also receive fresh identity; sequential fresh IDs are allocated in canonical
membership/station order so input permutations do not rename them.

Voice interprets “turn on/start the radio” as Radio Play, including when it is
combined with a camera action. Explicit “show/enable the Radio layer/markers”
remains a silent layer-only action and does not close the voice session.

Successful explicit user playback from Play/Resume, Previous/Next, the tuner,
or a globe station closes an active voice session only after Radio reaches
`playing`; a failed stream leaves voice active.
An interrupted or superseded voice turn aborts pending Radio location resolution
before it can enable the layer or select a station. Radio enable and disable are
abort-aware manager transactions: cancellation restores the authoritative
pre-transaction state only when the compensating lifecycle call succeeds and
emits no settled explicit-intent event for Context persistence. Failed
activation and teardown expose explicit `enabling` and `disabling` lifecycle
states while the manager retains the last authoritative visibility. The public
lifecycle vocabulary is `enabling`, `enabled`, `disabling`, and `disabled`, plus
a separate uncertainty bit. Radio controls present that phase and remain
non-interactive until the lifecycle is certain `enabled`; only a successful
transaction publishes the new `enabled` or `disabled` settlement. Radio's data
layer state, player message, compact status, launch controls, and generic Data
Layers row explicitly show `UNCERTAIN` when cleanup cannot establish authority;
their accessible labels name the uncertainty while Enable/Disable remains
available to reconcile it.
The Radio source, shared overlays, selected marker, and pick handler use the same
manager-owned presentation gate:
they remain hidden and inert throughout enabling, disabling, cancellation,
failure, and uncertain reconciliation, and activate only for certain `enabled`.
The same gate rejects direct station selection, Previous/Next cycling and its
camera/fallback preparation, tuner-static and category-filter mutation, volume
mutation, and every non-Pause playback toggle before fallback, selection, or
audio state changes. Voice volume and station-starting actions require a fresh
manager lifecycle read.
Every returned `control_radio` result, including status, failure,
cancellation, and a missing Radio module, exposes that same authoritative
`lifecycleState` plus `lifecycleUncertain`; the manager lifecycle record takes
precedence over the stable enabled fallback. Status only reads this state and
does not enqueue lifecycle or player work.
Generic `set_layer_visibility` results expose the same atomic `enabled`,
`lifecycleState`, and `lifecycleUncertain` summary for Radio on success,
fulfilled-false failure, rejection, cancellation, reversal, and missing-module
outcomes. Realtime suppression and settlement refresh all three fields together,
so dedicated and generic Radio routes cannot publish mixed lifecycle snapshots.
`disabled` is inert, while a transitional or uncertain shell is reconciled
through the manager and may proceed only after a fresh read confirms certain
`enabled`; false, rejection, or cancellation preserves the prior player state.
The existing immediate Stop/Pause authority is unchanged.
Cancelled-disable compensation reports failure and records whether lifecycle
state remains uncertain. Any same-target request made while state is uncertain
performs the real lifecycle work instead of taking the stable-state no-op, then
clears that reconciliation debt only after a confirmed enable or disable. A module-local
`AbortError` is a cancellation even while the caller signal remains live, while
that settled transaction releases its abort listener so the old caller cannot
disable a later successful retry. A resolved `false` from init, enable, first
update, or disable is a lifecycle
failure. Unrelated sibling tools remain independent, while each Radio control
captures the current playback-handoff epoch. A later Radio
Pause or Stop provisionally freezes prepared or already-started playback
handoff work without aborting active Select/Play auto-enable or an independent
explicit dedicated or generic Radio visibility ON. After semantic success it
cancels the active Select/Play lane and clears the frozen handoff. Semantic
failure leaves active work live and releases and resumes the frozen handoff.
Disable and generic OFF own visibility as well as playback and may cancel both.
These controls commit their authority only after semantic success, so a failed
stronger control cannot suppress a valid completed sibling. Pause uses the
production player's synchronous boolean contract; Stop and Disable additionally
handle their awaited failure paths. The control's function output is sent before a failed reservation releases,
so resumed playback cannot close the voice channel before the failure is
reported. Resumed handoffs own their attempt-scoped cleanup, so a stale predecessor
cannot clear the successor's in-flight result or block a later failed
reservation from resuming it again.
Generic `set_layer_visibility` Radio disable participates in the same ownership
domain as dedicated Radio controls, so an older Select cannot reverse it. Direct OFF
from either Radio control or the Data Layers row publishes intent before joining
the lifecycle queue and aborts in-flight voice work before an intermediate ON
event can settle. Every absolute manager visibility request also advances a
per-layer intent epoch and aborts the older absolute lifecycle transaction,
including a same-target request whose newer origin must own persistence. An
obsolete queued request never starts; obsolete in-flight cleanup keeps
presentation transitional and hidden, and only the latest request may adopt or
reconcile that state and publish settled visibility. The epoch is rechecked
after synchronous lifecycle-presentation callbacks, so a re-entrant newer
request prevents the older transaction from arming a timer or publishing a
settled visibility event. Superseding an uncertain same-target retry also keeps
the last authoritative enabled boolean until cleanup confirms the real module
state. Direct OFF also freezes
prepared or already-started playback handoff
until the manager queue settles; confirmed OFF discards that handoff, while a
failed OFF releases the reservation and resumes the valid prepared result. A
successful Stop cancels stale Radio work across older response ids as well as
its own response. If a Radio action has already completed its station mutation
before the later control succeeds, only its playback handoff is suppressed; its
result reads enabled state from the manager and audio state from the Radio
module. Voice Pause is a playback-only no-op while the layer is disabled; it
never enables Radio and reports a fulfilled-false pause as failure. A
newer-response or user-origin Stop still cancels stale handoff work.
Only a newer user turn or session teardown aborts the complete active-tool set.
A cancelled turn cannot publish a late Radio playback request. Dedicated Radio
controls and generic layer-visibility commands both forward cancellation.
Each explicit Radio play attempt owns one active audio element; replacement
retires the prior element, making its queued callbacks inert. Pause retires the
current stream and fallback attempt, so delayed callbacks from a replaced or
paused stream cannot change current state or start another station.
Pause and Stop settle attempt ownership and authoritative audio state before
synchronous playback-control observers run, so reentrant voice cleanup cannot
overwrite a released stream with a stale paused state. Layer
destruction likewise retains an enabled manager entry when module disable or
destroy fails semantically, preventing an active orphan and allowing retry.
When Context is collapsed, explicitly activating its Radio header icon reveals
the compact transport; hover and focus alone do not open it. When Context is
expanded, the icon instead expands and scrolls to the embedded Radio section.
Its accessible label, controlled region, and expanded state keep describing the
current route throughout enabling, enabled, disabling, and uncertain lifecycle
renders. Both routes preserve Radio power, playback, station, filter, and volume
state.

Bundled datasets live in `src/data/local_data/` with per-folder provenance READMEs; they are lazily loaded via `src/data/localGeojson.js` (Vite `?url` assets) when toggled on.

A bundled dataset that fails to load is a broken install, not a blip, so it is
never swallowed: `localGeojson.js` guards `response.ok`, reports `error` +
`lastUpdate` through `getStats()` (UNAVAILABLE chip, not a green ON over an
empty globe), and commits its Cesium data source only after setup completes so
a partial failure retries on the next enable. The two non-layer packs
(`naturalEarthRegions.js`, `neighborhoodPolygons.js`) have no stats contract to
report into, so they instead refuse to memoize a failure —
`src/data/retryableLoad.js` caches success permanently and retries a failed
load after a doubling cooldown (5 s → 5 min), which keeps one bad load from
silently demoting every later lookup for the session.

### Context / Contacts coordinator

- The internal Context coordinator is available in every visual style. Its dedicated right-side `CONTEXT` chooser exposes the neutral shell; the coordinator is not duplicated in Data Layers and does not enable a live-data dependency until a mode is selected.
- The expanded `CONTEXT` view offers mutually exclusive `CONTACTS` and `SPACE MISSIONS` modes. Selecting `CONTACTS` enables the context-owned Flights, Military Flights, AIS Vessels, and Mapped Installations dependencies only when they are not already user-enabled; selecting `SPACE MISSIONS` enables the recent-launch layer and its Satellite dependency. `CONTACTS` cycles the nearest supported contact of whatever type is selected. Satellites are deliberately excluded from those Awareness cohorts and keep their own tracking UX. Selecting the active mode again returns to the neutral chooser and releases only mode-owned dependencies.
- If a civilian or military aircraft is already tracked when `CONTACTS` becomes operational, that source-owned track is adopted as the Context subject before nearest-contact autofocus. Context rechecks the tracker after its dependencies settle, so a newer selection wins, while an explicit clear during activation prevents fallback from silently selecting a replacement. Cockpit entry remains unavailable until that Context transaction has settled, so its camera takeover cannot clear Cesium tracking before adoption. Adoption does not recreate tracking or transfer camera ownership; it initializes the normal 250 km ring, history, proximity results, and Cockpit Previous/Next state for the original aircraft.
- `SEARCH NEARBY SITES` retains the bounded OSM results and makes one user-initiated, view-biased Google Maps Places text search for “military installation.” Google results are source-stamped, deduplicated against OSM by rounded location/name, and remain mapped context rather than operational claims. If Places is unavailable or the API is not enabled for the supplied key, OSM context remains available.
- The expanded desktop header omits the redundant `ON` label; the active mode button carries state. Expanded Contact results also omit the duplicate `GLOBAL CONTEXT` / `CONTEXT ONLY` status row and begin with the selected subject and its 250 km scope. Global Context does not fabricate a selected-entity model preview: the provisional hand-authored aircraft wireframe was removed because it was not geometry extracted from the selected entity's actual asset.
- Dependency ownership is reversible: disabling Global Context releases only dependencies it enabled, while user-enabled layers remain on. This also removes the Military-layer suppression handoff when Global Context owned Military, allowing an already-enabled civilian Flights layer to resume its normal mixed rendering. If OpenSky is unavailable and has no last-good cache, Flights requests a capped 250 nm adsb.lol point snapshot around the current view anchor and labels that provenance explicitly; it never relabels military-feed rows as civilian data. If both inputs fail, Flights remains `UNKNOWN`.
- Space Missions is replay-isolated: Rocket Launches and Satellites are the only Data Layers permitted while the mode is active. Direct UI and voice entry capture the same pre-entry snapshot; internal dependency and restoration enables do not create a user-owned Context session. Entry waits for incompatible layers to shut down, direct incompatible enables are blocked before lifecycle work, and the entry gate remains active through the complete Rocket Launches enable. A newer same-target ON request takes ownership of the pending entry without releasing its isolation snapshot, including when it arrives while the prior request is awaiting the adoption guard. A caller abort, resource cancellation, newer OFF, or layer teardown waits for exact manager settlement and restores that snapshot without resurrecting Rocket Launches. If an abort lands after only part of a restore settles, Context completes the same exact target without the stale caller signal and then replays newer explicit layer intent. Dedicated Voice Context cancellation reports a stable cancelled result plus the current Context state; generic layer visibility additionally exposes manager phase, reason, successor, and lifecycle details. Once an exact voice visibility intent commits, a newer voice turn cannot relabel it as cancelled while Context settlement completes; pre-commit aborts remain cancellable and final lifecycle mismatches remain failures. Clear Selected Layers reserves its complete captured OFF set before sequential teardown; a newer absolute request of any origin supersedes only its layer reservation and remains authoritative. A rejected layer teardown retains the truthful enabled state, rolls already-stopped siblings back to the captured pre-entry set, and aborts replay; rapid exit/re-entry serializes the full Satellite enabled-state and parameter restore before a new snapshot is taken. Contacts remains additive and restores user-enabled layers normally.
- Enabled Data Layer controls report normalized feed health on the button (`LOADING`, `DEGRADED`, `STALE`, `FALLBACK`, or `UNAVAILABLE`) while the metadata line retains the source and reason. A partial CelesTrak group failure keeps the usable catalog and reports `DEGRADED`; a total outage keeps last-good catalog data visible but reports `UNAVAILABLE`.
- On activation it focuses the nearest currently observed aircraft across the civilian and military feeds, with military winning an exact distance tie; if none are available, it focuses an observed AIS vessel. The aircraft search is deliberately uncapped and one refresh-tick retry handles initially empty feeds. This is an attention-priority navigation shortcut, not a high-risk, affiliation, or threat classification.
- A selected aircraft, AIS vessel, or mapped installation gets a 250 km **context window** with nearby cohort counts, nearest examples, source labels, and stale/unavailable reasons. It emits `NEARBY` or `UNKNOWN`; no detection, engagement, affiliation, or sensor-activity conclusion is calculated.
- For a selected live aircraft or vessel, the context window refreshes from the existing tracker/feed position every 750 ms, so nearest distances and cohort counts follow the subject without introducing a duplicate poll loop.
- Aircraft cohort membership uses every locally loaded, selectable contact inside the 250 km window, including a plane hidden only by horizon culling or because its 3D model owns the visual. Counts and navigation therefore do not change with the current camera angle or billboard/model handoff.
- Nearby examples in the context panel are focus controls: they use their owning layer's existing selection/tracking path, then frame that contact. Static-installation distances use ellipsoidal surface distance so the count matches the ground-projected context disk.
- Context selection transfers camera ownership by subject type: selecting a civilian or military flight keeps that layer's moving follow camera, while selecting an AIS vessel or mapped installation first releases any prior aircraft tracker and performs only the source layer's one-time framing. The camera therefore remains user-controlled after non-aircraft selection instead of continuing to move with the previously selected plane.
- Selected AIS vessels use their layer-owned full-detail presentation model in the shared world-overlay host; mapped installations use the tracked-readout aesthetic. Both remain crisp above post-processing without duplicate selected labels; non-selected AIS cards retain their source-owned grid/visibility selection and are host-batched with other world cards.
- **The shared world-overlay host's source/domain registry — the `_sources`/`_domains` Maps every frame's projection/solve/paint pipeline reads, plus every entry-normalizing/validating helper (`normalizeOverlayEntry`, `paintLaneForOverlayEntry`, `selectBoundedOverlayCohort`, `isProtected`, and friends) — lives in its own module, `src/overlays/worldOverlaySourceRegistry.js`.** Unlike the per-layer factory-closure pattern used elsewhere (`deadReckoning.js`, `modelGroundHandoff.js`), these Maps are exported as stable `const` bindings, never reassigned, since `worldOverlay.js` is a true module-level singleton (`initWorldOverlay`/`destroyWorldOverlay` reset their contents, never the bindings). `worldOverlay.js` (`src/overlays/worldOverlay.js`) keeps the per-frame pipeline itself, host DOM/lifecycle, `_records` (pooled paint-rect cache), `_customPaintLanes` (source-owned painters in fixed lanes), and the five public entry-mutation exports, which call into the registry's primitives.
- Space Mission ascent replay uses the compact rocket/thrust overlay only through orbit insertion. Once the replay enters its orbit phase, that vehicle glyph is replaced by a fixed-size cyan dot following the same orbit path and callout.
- While a subject is selected, an inner keyhole compass rotates against camera heading and up to three cyan shafted bearing arrows lock to its single faint tick-marked rim, with their labels inset just inside the circle. Labels explicitly separate the geographic bearing (`BRG`) from the contact's reported course (`CRS`) so the pointer direction is not confused with aircraft heading. They point toward the nearest observed/mapped examples; each cohort displays up to ten examples while retaining the complete locally loaded in-range cohort for navigation, with three visible at a time and a ten-second page rotation shared by the panel and arrows. This distinct neutral-context color avoids implying that all context indicators are military-flight symbols. `PREVIOUS`, `FOCUS`, and `NEXT` controls navigate selection history or the next nearby cohort example through the existing tracker. NEXT uses a cycle-scoped visited set and starts a deterministic new walk after exhausting the current candidates instead of re-admitting the nearest visited contact.
- Installations are viewport-bounded OSM map features (`military=airfield|naval_base|range|barracks|base` and `landuse=military`), capped to a 10° non-dateline request and 700 upstream features. The proxy caches five minutes and serves a one-hour stale fallback. Empty, stale, unavailable, and zoom-too-wide states remain visibly distinct.
- The selected-only visual is one static, unfilled blue circle. It marks the 250 km proximity context window only; it is not coverage or a radar/weapon envelope. Missing broadcasts and unmapped sites are explicitly not evidence of absence.
- The right rail's collapsed Display, CCTV, and Context controls use the same compact sizing language as the left rail's collapsed Data Layers and Scenes controls. These compact-state widths do not constrain expanded panel or child-content widths.

### Motion & Symbology Correctness

- **Flights (commercial + military)** render one poll interval behind real time (30s/15s) and interpolate between two known feed-stamped fixes (OpenSky `time_position`; adsb.lol `receipt − seen_pos`). The display latency is an intentional product decision — do not "fix" it away. The whole fleet dead-reckons at ~12Hz (1m² write gating); aircraft get a 3-poll grace period (faded icon) before removal. When a position epoch pauses, both layers coast for at least 60 seconds of contact grace with an absolute five-minute ceiling. Source backoff marks each contact and the cockpit `STALE`; the cockpit then holds the exact layer position instead of continuing inertial flight. Repeated-position kinematic changes create a forward-only synthetic fix rather than mutating history, and grounded history is lifted only when no owned 3D model already controls its datum. A nominally successful worldwide OpenSky response whose own snapshot epoch is more than two minutes old prefers the existing 250-nm viewport-scoped adsb.lol fallback and labels the source/coverage accordingly when that upstream is available. If the fallback is also unavailable, the layer's freshness/error fields use the source epoch—never the cache receipt time—so the UI reports an old snapshot rather than “just now.”
- **World-space headings at every angle** (`src/data/iconOrientation.js`): aircraft/vessel icon rotation uses the camera right/up basis per tick (alignedAxis always ZERO), which is exact at screen center and for orthographic/nadir views and remains stable through >180° tracked orbits. Perspective rays vary across the viewport, so off-center contacts at oblique pitch can diverge from an exact finite-difference window projection; a regression test pins that known regime, and field evidence decides whether to adopt exact projection with the basis method as fallback. Fleet rotations refresh on camera-pose change; tracked entities per frame. Billboards are horizon-culled via a shared EllipsoidalOccluder.
- **Military/OpenSky reconciliation** (`src/data/militaryRegistry.js`): known-military ICAOs render amber in the flights layer (60s self-poll of the cached mil endpoint when the military layer is off) and are suppressed there while the military layer renders them.
- **Satellites**: 838-sat core catalog (stations/visual/GPS/GLONASS/Galileo/GEO), tracking lands ~726km out via `viewFrom` (tracked entity owns a point graphic so the tracking camera engages), rings realign via primitive modelMatrix (no per-second rebuild flicker), optional `setParams({catalog:'dense'})` Starlink mode.
- **Satellite classes** (`src/data/satelliteClass.js`): every satellite is classified from the CelesTrak group it was ingested with — no extra fetch and no heuristics — into STATION (warm white), NAV (cyan; GPS/GLONASS/Galileo deliberately share one color so the GNSS family reads as one thing), GEO (violet), VISUAL (muted blue-gray catch-all), and COMMS (dim slate, dense Starlink shell only). That module is the single source of truth for class, label, and color, so the dot, the card, and the legend swatch cannot disagree. Two deliberate palette rules: no class may sit in the 40–48° amber band, which is the app-wide known-military convention; and COMMS stays far below VISUAL in Rec.601 luminance so the dense shell stays separable when NVG/FLIR collapse the scene to one channel. The ISS keeps its long-standing red hero dot rather than the STATION color — it carries a permanent name label and its card still reads `STATION · ISS`. `satelliteClassOf` is the single owner of that ISS rule, so the card label and the legend tally can never disagree: during a stations-feed outage the ISS is ingested as `visual`, and both surfaces still file it under STATION.
- Class is also a **text field**, not just a color: `NAV · GPS` / `GEO` / `COMMS · STARLINK` / `STATION · ISS` leads the tracked card's detail block and replaces the raw CelesTrak tag on the detection-overlay label. Because that canvas composites above the post-FX chain, the class stays readable in NVG/FLIR after the in-scene dot colors are flattened.
- The satellites row in DATA LAYERS carries per-layer sub-controls (`DataLayerManager._syncRowControls`, the first consumer of the optional `getRowControls()` layer hook): a **DENSE** chip exposing the existing `catalog` param, and a swatch legend with live per-class counts. Default is the sparse core catalog. The chip is stateless — it declares the params to apply and the manager owns the write — so the Space Missions capture/restore path over the same param stays authoritative. Controls stay hidden while the layer is off. An explicit CORE or DENSE choice participates in versioned local and share-link state; temporary Space Missions overrides do not.
- **The DENSE chip reports the dense LOAD, not the catalog param.** The param flips synchronously while the Starlink shell takes seconds to arrive over a chunked load, and CelesTrak 502s that feed regularly. So the chip reads `DENSE ···` (busy, disabled) while loading, ACTIVE only once dense points are actually on screen, and `DENSE ✕` with the reason on hover when the load fails — a failure also reverts `catalog` to `core`, drops any partial chunk, and leaves the chip clickable to retry. A load is judged by points added, not by HTTP status: a 200 carrying an empty body, a passed-through HTML error page, or only TLEs the core catalog already owns fails with the same revert semantics as a 502. Any explicit request for `core` clears a latched error even when the mode does not change, so a Space Missions restore of an already-core snapshot never leaves the user with a failure they did not cause. Because the load settles asynchronously, the layer pushes a re-render through the optional `setRowControlsListener()` hook; nothing else would repaint that row before the 5-minute catalog refresh, so the count and legend would otherwise sit stale.
- **A dependency owner takes the row with it.** Space Missions borrows this layer for TLE lookup with `showPoints:false`; while points are hidden the layer returns empty row controls, so the legend never describes an empty sky and the chip cannot accept a write that the owner's restore would silently revert.
- The detection-overlay record cache (`_detectionObjects`) is cleared with the catalog on every rebuild: it stamps id/class at creation only, and a rebuild can re-tag a satellite when a partial CelesTrak outage changes which group wins dedupe.
- **FIRMS**: no ground clamping (zero 3D-tiles height sampling), ≤18 screen-decluttered ambient labels, click-to-inspect detail card, 2.5k/3k sprite budgets viewport-clipped by FRP.
- **CCTV v2 foundation:** a pitched
  frustum wireframe (4 corner rays + far-cap rectangle) with a monitor plane at the frustum's
  far cap, retargeting the existing video/canvas texture pipeline. Manual calibration only —
  auto-calibration and the drape mesh pipeline are deleted. A one-shot activation obstruction
  probe (`pickFromRay` on camera activation, clamping the plane short of the first hit) remains;
  ground placement is superseded by the shared-floor v3 behavior below. Calibration persists to
  `gev:cctv-calibration:v2` (wiped clean, no v1 import); a panel-only CAL badge shows
  `CALIBRATED`/`CURATED`/`RAW PRIOR` (no in-world tint). Panel is titled "CCTV" (not "CCTV
  MESH"). Staggered geometry/frame loading is active-first and uses 4 records per 120 ms normally,
  or 2 per 250 ms while tracking/cockpit owns the view (re-evaluated each batch), with coalesced progress
  notifications (roughly 300 ms or ten batches; natural completion and disable each publish their
  terminal state through their own completion paths) and a LOADING FRAMES
  chip and the preview-first auto-expanding panel are unchanged. Coverage polylines are created
  lazily instead of inserting five entities for every catalog camera during initialization: default
  COVERAGE ON enable creates the active/visible 14-camera cohort, and activation always creates the
  selected frustum even with COVERAGE OFF. The ground clamp lifts the cap *center* only so the
  wireframe stays a true pyramid welded to the plane; re-selecting the active camera is a no-op;
  texture swaps gate on canvas content. Coverage is **metro-wide: 250 cameras** (`CCTV_AUSTIN_MAX_SOURCES`
  default 36 → 250, hard bound 300), filtered to `camera_status === TURNED_ON` (~815 live of
  1,003 rows). City packs: Caltrans (districts 4/7/11/3 — SF, LA, San Diego,
  Sacramento; cap 300) and TfL London JamCams (cap 250) join Austin (cap 250) as keyless default
  sources — ~800 cameras total, all RAW PRIOR poses, stills-first. 24 hand-authored fictional/
  synthetic seed cameras (`CAMERA_SEEDS` in `cctvCatalog.js` — the original 8 cities plus the 3
  Indonesian metros that still have no live rows: Medan, Makassar, 2 per city) merge into the
  catalog alongside whatever live sources load (`mergeSeedAndSourceCatalogs`, id-deduped, live
  source wins on a collision) rather than only appearing when live sources are entirely empty —
  seed-only cities keep their `feedConfigured:false` coverage even when Austin/Caltrans/TfL are
  all reachable. A city that gains
  live pack rows loses its seeds (a seed has no stream and renders as an empty green placeholder
  card beside live cameras); `cctvIndonesiaUnofficialPack.test.mjs` enforces this. The per-city and
  per-ruas live counts are listed in `cctvLive.md`. See `docs/DECISIONS.md` for the field-validation history.
- **CCTV v3 UX — viewshed + calibration gizmo:** the COVERAGE toggle is a
  tri-state cycle `OFF → ON → VIEWSHED`; viewshed mode renders each visible camera's frustum
  as a translucent **color-coded volume** (golden-angle hue per camera, `cctvViewshed.js`)
  welded to the same 5 points as the wireframe — zero new scene queries or update cadences.
  **Clean live plane:** while the active camera's monitor plane is showing, **no** frustum
  wireframe and **no** viewshed fill is drawn — neither the active camera's own nor any
  neighbor's. The fill is welded to the plane's far-cap corners and renders both faces
  (`cull: { enabled: false }`), so it would sit opaque over the live video texture, and neighbor
  lines/fills drawn across the plane contaminate the frame. Idle cameras show only their icon,
  and an icon whose screen position falls inside the plane's on-screen quad is hidden too
  (icons are always-on-top billboards, so the depth test cannot do it; `cctvPlaneIconOcclusion.js`,
  refreshed at 80 ms in the projection loop, restored when the plane stops showing).
  The one exception is **ADJUST** (calibration) mode, where the active camera's wireframe stays
  visible because the frustum is what is being edited. Policy lives in the pure
  `cctvCoverageVisibility.js`; the entities stay materialized (hidden), so deselecting restores
  the normal COVERAGE/VIEWSHED presentation instantly.
  **Wireframe/viewshed-volume z-fight guard:** the 4 corner
  rays and mount point are lifted `WIREFRAME_ZFIGHT_LIFT_M` (0.75 m) off
  the true frustum geometry along the local ellipsoid surface normal before
  becoming entity positions — mitigates laptop-GPU-only flicker where
  ray endpoints skim terrain/3D-tile depth near-coincidentally (the bottom
  corner pair can sit below ground per the ground-clamp behavior above),
  compounded by `depthFailMaterial`'s `EXT_frag_depth` dependency on
  inconsistently-supported GPUs. The
  viewshed fill volume shares these same lifted corners by design (it
  tracks the wireframe 1:1). `capCenter` — and therefore the monitor plane
  — stays on the true unlifted geometry, preserving the existing
  corner/plane coincidence invariant. Same fix family as `VESSEL_LIFT_M`
  (`src/data/aisLiveVessels.js`) and `GROUND_FLOOR_LIFT_M`
  (`src/data/groundFloor.js`). See `docs/DECISIONS.md` for build/rollout history.
  The 7 calibration sliders are **deleted**: ADJUST mode puts a direct-manipulation **gizmo**
  on the active camera (`cctvGizmo.js` — heading/pitch rings, E/N/U arrows, range handle at
  the cap center, FOV handles on the cap edges; all 7 offset DOF), plus a click-to-edit
  **effective-pose readout** (HDG/PITCH/FOV/RANGE/HGT/ΔN/ΔE, absolute values). Persistence is
  **save-gated**: edits are live but unsaved (`CAL · EDITED` chip) until SAVE CAL writes
  the v2 store.
  Translation arrows use a depth-test-free pickable tip so E/N/U ownership remains unambiguous even where shafts overlap
  other handles. Avoid hover effects that mutate gizmo polyline geometry (width) — the primitive rebuild blanks the pick buffer and eats the
  following click. Gizmo input checks the topmost, depth-test-free
  handle with `scene.pick` first and uses `drillPick` only as an overlap fallback; this keeps
  hover and press responsive on software GL without changing the real-GPU interaction. Frame serving is bounded independently from the
  10-second active refresh: upstream and Street View attempts abort after 8 seconds, and the
  panel/monitor plane keep at most one same-camera image request in flight. This prevents a
  slow provider from being cancelled and restarted forever while stale `SNAPSHOT · OK` health
  remains beside a pending preview. Grounding is shared with every other height consumer:
  CCTV warms/resolves `groundFloor.js` cells, reads `cachedGroundFloor()`, and delegates optional
  Google 3D refinement to the unchanged `meshFloorSampler.js`. During E/N gizmo movement the
  prior floor is frozen (constant elevation and zero transient samples); release or reset makes
  one resolution request at the committed anchor. U edits remain pure geometry and enforce the
  2 m minimum mount height above whichever shared floor wins, including a rooftop. Public camera
  state exposes `groundPriorM` as the immutable Re:Earth ellipsoidal datum reference; it is kept
  separate from live frustum geometry because Google-3D can refine the rendered ground to the
  photogrammetric mesh.
- **CCTV citywide ambient cards:** the LOD-selected nearby static cameras (20/28/40 by zoom,
  `cctvLod.js`) get **screen-space thumbnail cards** through the shared world-overlay host
  showing paced static frames — reselection on `camera.moveEnd` only, at most one frame fetch
  per second layer-wide, per-source cadences (Austin 5 min, TfL/Caltrans 3 min). Zero-flicker:
  a card renders nothing until its first frame, a drawn frame persists through failed fetches,
  and eviction grace (2-pass/5 s) stops budget-edge churn. Camera icons stay visible at every
  zoom. Eligible candidates are filtered to in-view stills with valid IDs,
  finite distances, and one deterministic representative per camera before
  ranking; videos, hidden/malformed rows, and duplicate outliers cannot alter
  the density scale or displace a valid winner. They are ranked with a
  deterministic 50/50 blend of eye distance and normalized screen-center offset
  before the existing 5×4 distribution pass, so the center wins contested
  density without removing peripheral coverage or changing the bounded count.
  The active camera keeps the v3 monitor plane and is excluded from the
  40-card ambient ring with no thumbnail by default. An explicit
  `activeCameraCardEnabled` presentation option can publish the retained
  protected-card path. Disable tears the tier down completely.
  Coverage/viewshed semantics unchanged.
- **Satellites**: orbit rings rotate about Earth's Z by ΔGMST every ~1s (exact inertial→ECEF compensation; no SGP4 re-runs); the tracked satellite propagates per frame with one shared epoch for dot/label/camera. Verified: ISS holds <1km perpendicular to its ring while tracked.
- **Space Missions (30d)**: recent launches render as bounded shared-host, horizon-occluded mission markers using Launch Library 2 v2.3 detailed records. Enabling the layer selects the unified right-side Context panel's Space Missions mode and enables the required satellite layer. Before applying its temporary dense/hidden Satellite mode, Space Missions snapshots the complete standalone Satellite parameter set and exact enabled-layer set. Disabling Space Missions from either Context or the left Data Layers rail restores those parameters and the exact prior enabled state, so a Satellite layer that was already on stays on while a mode-owned dependency returns off; enabling Satellites by itself remains independent. Selecting a mission isolates its launch-to-orbit transfer and dashed satellite orbit, fills that same panel with navigation/details, and animates a small phase-colored marker along the exact displayed Cartesian samples. Marker hit testing drill-picks through photorealistic tiles so the depth-test-free tactical dot remains reliably selectable; its text is non-interactive shared-host presentation. The selected pad is the camera's zoom pivot: the overview remains centered on its launch site, wheel zoom approaches that site instead of drifting elsewhere, and camera pitch progressively changes from global nadir to an oblique close 3D view. Its protected shared-host callout remains visible and expands to include both mission and launch-site names. `FOCUS` flies directly to a 12 km oblique frame around the selected launch site and retains the same anchored zoom/orbit behavior. `REPLAY ASCENT` resets the selected marker at the pad, frames it from an oblique third-person angle, and follows it through the mission-specific compressed ascent directly into one orbital lap at the default `1×` rate. A live `0.25×`–`4×` slider changes ascent and orbit playback speed; adjusting it mid-replay preserves the current path position and historical mission timestamp. Re-entry/recovery cannot be inserted into replay. At orbit insertion the camera smoothly pulls back over the first fifth of the orbital replay and pitches to a globe-scale nadir view while continuing to target the moving replay point. Replay Cancel, mission navigation, deselection, layer disable, and data refresh all release camera ownership. Reconstructed paths are one continuous 128-sample geodetic curve: horizontal departure begins near zero while altitude rises quickly, then the climb progressively bends toward insertion without the former hard 120 km corner. Unmatched orbit fallbacks are smooth planar inclined rings rather than longitude/latitude ground-track curves. The panel lists disclosed payload names, types, operators/manufacturers, mass, multiplicity, and destination when supplied; an empty LL2 payload collection is shown as `CLASSIFIED / MULTI-PAYLOAD`. Launcher, spacecraft, and recoverable payload stages appear in a compact stage table with serial/flight/reuse details, recovery outcome/type, destination, and final coordinates when those records exist; an empty recovery collection omits the section. Stage recoveries with confirmed coordinates use those coordinates; return-to-launch-site records use the pad; downrange-only records receive an explicitly labeled estimated endpoint along the ascent azimuth. Available endpoints render as static 2 px dashed descent/recovery paths with a fixed final-position dot and an estimated atmospheric-interface segment when applicable. The ascent is geodetically densified above the ellipsoid toward the orbit's nearest insertion point, then rendered with `ArcType.NONE`, so it neither cuts through Earth nor separates from the marker. Because LL2 does not normally supply continuous ascent telemetry, pad-to-insertion paths without upstream trajectory samples are labeled `RECONSTRUCTED ESTIMATE` / `ASCENT ESTIMATE`; only supplied trajectory samples receive the replay wording. Selected-orbit framing fits the complete ring, rear-side linework uses normal scene depth occlusion, and current distance, speed, and callout data come only from a launch-year-validated satellite match. Speed is the magnitude of the SGP4 inertial velocity vector at the same propagation epoch as position, displayed in km/s with km/h available as hover detail. Unavailable operator, site, launch-time, orbit, current-altitude, and speed values omit their detail rows instead of reserving panel space with placeholders. Newly launched payloads absent from the core operational groups use CelesTrak's cached active TLE feed as a lookup-only fallback; weak constellation-name matches are rejected. The replay callout maps compressed animation progress onto Launch Library's mission-relative timeline, showing the historical UTC date/time at the marker's current path position; unavailable timelines remain explicit. Matched live satellite positions propagate at one-second cadence and use a distinct green dot/callout with the current UTC date/time.
  When no mission is selected, the Context panel presents a scrollable newest-first roster of every launch in the rolling window, including the smaller 5 px operator-colored marker, provider, and launch date. Hovering or keyboard-focusing a row shows four compact cyan corner brackets on both that roster row and its corresponding globe dot, rotates the globe at the current zoom to center it, and gives its label declutter priority without selecting it; the globe label remains unbracketed. Selecting a roster row invokes the same mission isolation and full-orbit framing as clicking its globe marker. The replay vehicle is one screen-space SVG/CSS HUD overlay rather than separate Cesium billboard, label, and reticle graphics. It is hidden during ordinary Focus and manual close views, where the standard selected launch-site label remains visible, and exists only while ascent replay is active. Its fixed pixel scale is shared by ascent and insertion, so camera range never resizes the rocket on screen before the phase boundary. Generic Launch Library pad names are reduced to their identifying suffix, and replay timestamps use a cyan state title over unprefixed white UTC date/time values. `REPLAY ASCENT` holds the unframed cyan/white rocket at the pad for a real-time `T−10` countdown, transitions through `LIFTOFF`, and attaches six tapered cyan/white ellipse waves directly below it from liftoff through insertion to convey thrust without adding scene geometry. While replay is active, the single start button is replaced by compact Play, Pause, and Cancel icon controls. Pause freezes countdown or mission time, vehicle/stage positions, camera target, labels, and thrust-wave animation; Play resumes from that exact frame, and Cancel releases replay camera ownership. The rocket and thrust group rotates from the path's live screen-space tangent, so its nose follows the visible ascent curve while the adjacent text remains upright. The camera begins as a close oblique launch chase, then smoothly widens between roughly 120 and 420 km vehicle altitude into a higher oblique context view that keeps the moving rocket targeted while exposing the ascent bend and orbit connection. At insertion the rocket/thrust glyph is replaced by the fixed-size cyan orbit dot, which the camera follows through the existing globe-scale orbit pullback. The chase camera limits per-frame yaw changes across heading wraps so it cannot abruptly cross in front of the vehicle and make ascent read in reverse; the replay-speed slider affects mission playback but not countdown duration.
  Mission world text has no native `LabelGraphics`: overview launch markers publish at most 48 ambient candidates for a 24-winner budget, while selecting a mission clears that overview source and publishes its launch-site callout, stage re-entry annotations, live/estimated payload-position readout, and orbit annotation as protected selected-lane entries. The source retains the exact former strings and colors. Static anchors reuse the Cartesian values used to build their mission geometry; the moving payload entry reads the layer's per-frame live-position cache; catalog-backed orbit annotation positions are cached in the same one-second matrix update that realigns the orbit primitive. Keyhole edge fade, horizon culling, final collision placement, and UI exclusion are owned by the shared host. Deselect restores the bounded overview, and refresh, disable, and destroy replace or clear both mission sources.
  A selected mission renders its orbit as four repeating tactical sectors, each containing one prominent cyan dot followed by one hundred thin translucent dashes. The bright dots act as orbit anchors while the subdued dash field remains depth-tested against the globe and is shown only for the selected mission.
  Close selected-pad views add one static 500 m-radius cyan launch-zone ring with a low-opacity translucent fill over the sampled photoreal launch-site surface. The single scene primitive is created only for the visible selected site and is otherwise dormant. It appears during Focus, sufficiently close manual zoom, and the replay countdown, but is suppressed above 120 km camera altitude, beyond 180 km direct camera-to-pad range, for unselected missions, and whenever Space Missions is inactive. Focus establishes a launch-site-centered camera transform once; subsequent manual heading and pitch changes remain centered on that site without an automated per-frame correction. Surface mission markers and labels use an additional conservative globe-limb margin before the exact ellipsoid occluder boundary, preventing near-horizon visibility from alternating between frames.
- **AIS vessels**: chevron symbology (naval cyan base, type tints), world-space headings, MMSI-keyed reconciliation (selection survives refreshes; pinned 3 refreshes with STALE marker when absent), detection-overlay integration (`type: 'SEA'`), contextStore registration for voice Q&A. Empty-space clicks, id-less photorealistic-tile picks, and Escape dismiss the vessel card/HUD/context and clear its trail; picks owned by another layer (including `gev-trail:*`) and raw vessel-record picks without a live MMSI key are no-ops for vessel selection. Click and key handlers detach while the layer is disabled and reinstall on enable. Selecting another vessel replaces the selection and trail, and reconciliation clears a trail if its owning vessel is evicted.
- **Track trails**: server accumulates per-MMSI ring buffers (`/api/ais-live/track?mmsi=`, Float32+Uint32, 64 samples, 30s/25m thinning); aircraft backfill proxies `/api/opensky-track` (OAuth, own credit bucket) and `/api/adsblol/trace` (tar1090 readsb, ~24h history, ODbL — credit adsb.lol).
- Shared `src/data/pickRegistry.js` stops the two flight layers' click handlers from fighting over the camera.

### Share-link v2 layer state (August 2026)

- Generated share links use a deterministic v2 hash. Existing camera, visual,
  HUD, detection, post-processing, celestial, scope, and map-stack fields remain,
  with compact fields for enabled layers, allowlisted layer options, panel state,
  and the active preset's allowlisted shader controls. An absent layer field uses
  deterministic defaults; an explicit empty field means no enabled layers.
- The registry seals only after all 16 production layers register, and every
  layer has an explicit serialization disposition. Unknown enabled-layer tokens
  reject the layer payload; unknown option tokens are ignored. Restoration
  settles independently per layer so one failed or unavailable source cannot
  block its siblings.
- Restoration is a concurrency-limited, priority-ordered queue
  (`LAYER_RESTORE_CONCURRENCY = 4` in `src/data/layerState.js`), not an
  unbounded fan-out: light layers (flights, military, earthquakes, traffic,
  military-installations, military-awareness) dispatch first, moderate
  layers (bikeshare, rocket-launches, ais-live-vessels) next, and heavy
  layers (cctv, satellites, radio, the bundled local-* datasets, submarine
  cables) are deferred behind the cap. This only changes behavior once a
  session has more layers enabled at once than the cap — a returning user or
  a rich share link with most/all 16 layers on no longer launches every
  layer's init/enable/first-update sequence in the same tick. Small sessions
  (at or under the cap) dispatch exactly as before, and every existing
  per-layer isolation/supersession/abort guarantee is unaffected — the queue
  only reorders WHEN a layer's restore call is made, never how it resolves.
- Stable visible options are limited to aircraft 3D mode, selected civilian and
  military flight IDs, Satellite catalog and selection, CCTV coverage/projection/
  auto-hop, and Radio filter/volume. Playback and tuning, live-data health,
  calibration, caches, lifecycle state, temporary Context ownership, and derived
  effects are deliberately excluded. Radio restore never selects or plays a
  station.
- Normal loads restore the last successful explicit UI, voice, or tool choice
  from versioned local storage. Any valid camera share wins for the current load
  without overwriting recipient preferences. Restore ownership is split by
  visibility, option/selection, camera, visual, map, and individual panel lane:
  a newer explicit action supersedes only the field it owns. In particular,
  navigation cannot turn unrelated layers off, and an option change cannot
  cancel the same layer's visibility transition. Every explicit HUD, detection,
  post-processing, scope, or celestial action from the UI, keyboard, voice, or
  public tool facade claims the visual lane before mutation. Invalid requests do
  not claim that lane or partially change controls.
  Direct globe pointer and wheel gestures supersede the delayed shared camera
  and selected-subject Follow without aborting unrelated layer visibility or
  display-option restoration.
- The initial restore has one terminal promise spanning the camera flight,
  visual/panel callback work, every production layer result, and the
  destination-scoped selected-subject Follow result. Hash writes remain
  suppressed until that aggregate settles. The startup screen does **not** wait
  for it: it lifts on `initialViewReadyPromise` (shared camera flight plus
  visual/panel callback, first painted frame, 250 ms floor), and saved layers
  such as CCTV keep restoring behind the visible app with their own loading
  chips (`Refreshing live data`, `LOADING FRAMES`). Any failure or destroy
  also releases the view-ready promise, so the cover can never hang on it. Destroy settles it as destroyed rather than
  permitting late mutation. A superseded shared visibility intent follows
  the authoritative successor chain to a terminal lifecycle result, including a
  same-target re-enable or opposite-target disable, before releasing the layer
  barrier. Flights, Military, and Satellite first-update
  fetches consume the manager AbortSignal; disable and destroy also abort their
  module-owned feed or dense-catalog requests.
- Only one Flights, Military, or Satellite tracking ID can be durable at once.
  Explicit selection clears the other families, Stop Tracking clears active and
  pending IDs, and ambiguous incoming multi-family selections fail closed rather
  than letting feed arrival order choose the camera owner.
- An explicit aircraft selection made inside Contacts promotes the owning
  Flights or Military layer from a mode-owned dependency into durable state, so
  leaving Context, reloading, or opening the link can restore it. Passive
  Contacts autofocus does not revoke a pending selected aircraft; the exact
  shared/local target wins when its feed row arrives.
- A shared Flights, Military, or Satellite subject that has not arrived yet
  publishes a persistent top-center `ACQUIRING` progress state while the
  existing deferred-restore latch and source-specific deadline remain active.
  Success, expiry/failure, cancellation, superseding intent, owner-layer
  disable, explicit navigation, and teardown all settle and clear that state;
  caller abort remains authoritative after the pending handoff. A latch that
  rejects its deferred selection emits only the terminal failure and never a
  false acquisition state. An unrelated manager failure preempts `ACQUIRING`
  for its full visible dwell; if acquisition is still owned afterward, the
  progress state resumes. A share-specific terminal failure that arrives while
  another failure is visible is queued, and its own fixed dwell starts only
  when that message reaches the screen. Only terminal failures use the existing
  fixed-dwell error presentation.
- Radio category persistence shares the live directory's bounded normalizer,
  including generated genre identifiers with spaces or `&` such as `Hip Hop`
  and `R&B`.
- Shared panel state starts from deterministic defaults and excludes responsive
  auto-collapse. Partial or malformed panel fields cannot import or overwrite
  recipient-local layout preferences.
- A fresh Cockpit entry temporarily collapses the standard left/right map
  panels and opens Cockpit's own Contact and Live Signals rails. This runs only
  on entry: Previous/Next preserves any panel the operator opens while already
  inside. Exit restores the exact standard-panel open/collapsed snapshot from
  before entry; Cockpit-only disclosure changes do not replace that map layout.
  Opening Data Layers while inside Cockpit temporarily collapses the Contact
  panel to prevent overlap. Closing Data Layers restores Contact only when that
  accordion action collapsed it; an operator's own Contact collapse remains
  authoritative.
  Voice selection of the nearest aircraft near a named place follows
  the requested-layer enable → location arrival → destination refresh → nearest
  airborne lookup → aircraft selection path, excludes on-ground records, and
  never enters Contacts or Cockpit unless either mode is named explicitly. The
  destination refresh also runs when the requested layer was already enabled.
  The lookup inspects the full loaded fleet and tracks by stable ICAO identity.
  That complete route is one atomic voice action, so Realtime sibling calls
  cannot race the nearest-aircraft query ahead of layer enablement. A healthy fallback feed is
  queried normally and its source is returned with the selection; fallback with
  no airborne records remains an honest no-data result, not an enable failure.
- Voice treats the parent Context panel and Contacts as separate intents. An
  explicit request to open Context expands only `global-context-panel`; it does
  not choose a mode. An explicit request to open Contacts expands that parent
  first, activates the Contacts sub-view, and returns the settled 250 km window.
  Its `aircraft` count is the exact civilian-plus-military total when both feeds
  can answer, or `unknown` when either component is unavailable.
- Cockpit's top vision switch cycles five rendered looks: the inherited map
  style, CRT, NVG, FLIR, and Noir. There is no empty `NONE` entry.

### Live AIS Vessels (June 2026)

- Server-side `ws` websocket to `wss://stream.aisstream.io/v0/stream` maintained by Vite middleware; `AISSTREAM_API_KEY` never reaches the browser (AISStream has no browser CORS). The `ws` package is used rather than Node's built-in WebSocket specifically because only it can hard-abort a wedged socket (see the watchdog note in the delta block at the top).
- Browser polls same-origin `/api/ais-live` cache every 60s.
- The first enable in a session starts one 30-second client grace timer. Until
  an accepted vessel position arrives, `live`/`open`/`connecting` transport reports
  `LOADING`; the timer is not restarted by the 60-second poll. Expiry or a
  definitive transport/credential failure reports `UNAVAILABLE`. Accepted
  warm vessels survive later zero-position refreshes as stale/degraded data,
  while disable/re-enable owns a new timer and superseded responses remain
  inert.
- Client render cap `VITE_AIS_LIVE_MAX_ROWS` (default 12,000); type-colored ship icons (tanker/cargo/passenger/fishing/tug); screen-space label clustering caps active labels at `VITE_AIS_LIVE_LABEL_MAX_ROWS` (default 900).
- Click-to-inspect wired into the voice context store.

### Voice Control (June 2026)

`GEV MIC` button (bottom UI) starts an OpenAI Realtime session over WebRTC:

- **Token flow**: browser fetches a short-lived client secret from `/api/realtime/token`; the Vite middleware holds `OPENAI_API_KEY` and posts the full session config (instructions, tool schemas, VAD, truncation) to `api.openai.com/v1/realtime/client_secrets`. SDP exchange goes directly to `api.openai.com/v1/realtime/calls` with the ephemeral token.
- **Session defaults** (env-tunable): model `gpt-realtime-2` (or `gpt-realtime-2.1-mini` when the MINI tier is selected — see the model-tier entry below), voice `marin`, reasoning effort `low`, semantic VAD with low eagerness, no response interruption, context window truncated to ~3,000 post-instruction tokens with 0.5 retention ratio — the conversational window stays short because map state is fetched live per turn.
- **Twenty-eight tools** (schemas defined server-side in `vite.config.js`, executed client-side in `src/voice/gevActions.js`): `fly_to_location`, `select_nearest_aircraft`, `adjust_camera_zoom`, `zoom_to_globe`, `set_layer_visibility`, `show_data_layers_menu`, `set_panel_open`, `set_visual_style`, `get_entity_context`, `get_current_view_state`, `set_hud`, `set_detection`, `set_map_stack`, `set_post_processing`, `control_scene`, `control_cctv`, `set_context_mode`, `control_cockpit`, `control_radio`, `track_entity`, `stop_tracking`, `frame_overhead`, `annotate_map`, `clear_annotations`, `move_camera`, `fly_route`, `analyst_query`, and `next_iss_pass`.
> **Reading `npm test` totals:** the count depends on the Node major. The two
> GC-bracketed allocation microbenchmarks (`src/data/focusAllocations.test.mjs`
> = 1 test, `src/overlays/worldOverlayAllocation.test.mjs` = 13) only RUN on the
> calibrated Node 24 runtime; on any other major the runner skips both files and
> their 14 tests are absent from the total. A branch total quoted without its
> Node version is therefore not reproducible. As of the fly_route cinematic
> branch: **2,281 on Node 25.6.1** (allocation suites skipped) = 2,255 on
> `main` + 26 route pins; the same tree on Node 24 reports 2,295.

- **Camera verbs** (`src/cameraVerbs.js`) — one motion slot, driven per clock tick. `move_camera` orbits/pans/tilts/rotates; `fly_route` is a cinematic dolly along an existing route annotation. The dolly's `createRouteFlight`/`advanceRouteFlight` state machine and its route-only helpers/constants/scratch objects live in a sibling module, `src/cameraVerbsRouteFlight.js`, re-exported from `cameraVerbs.js` unchanged — the tick loop, motion slot, and `flyRoute` itself stay in `cameraVerbs.js`.
  - **The route dolly is shaped, not linear** (2026-08-20). A trapezoid speed profile (smoothstep up, cruise, smoothstep down, distance taken as the closed-form integral) eases both ends without changing the pace — duration is still `totalM / ROUTE_M_S[speed]`, with one exception: a 0.5 s minimum keeps a degenerate route from being an instant teleport, so routes under 10 m (slow) / 20 m (normal) / 45 m (fast) fly SLOWER than the speed word, never faster. Turns bank up to **10°** (a 90° street corner settles near 7.5°), measured as a triangular pulse over a 4 s window centred on the camera so the roll leads in and unwinds after. Altitude breathes ±20 m around the 260 m mean and lifts up to 26 m into turns. Pitch is LOCKED at −32°; heading comes from a gaze that leads the path by 6.5 s of travel. `prefers-reduced-motion` zeroes the roll and the altitude shaping and keeps the easing.
  - **Invariants — do not "fix" these.** (1) **Every** release levels the roll: completion unwinds it through the ease-out envelope, and `interruptCameraMotion` zeroes it synchronously (heading/pitch/position preserved). Cesium keeps the last up vector it was handed, so skipping this leaves the user holding a tilted horizon. (2) Heading is interpolated as an ANGLE about the local up, never as a Cartesian lerp — a lerp cannot cross an antipodal pair, so an out-and-back route looked backwards for the entire return leg; `signedTurnRad` branches the exact-180° case deterministically because the cross product's sign there is a floating-point coin toss. (3) A COLD floor cell is missing data, not flat ground: route vertices carry height 0, so trusting them flew a mountain corridor at 260 m above the ELLIPSOID. The corridor warm is fire-and-forget, so the dolly ARMS — camera untouched, no teleport onto the route — for up to 1.2 s waiting for real floor data, falls back to a rendered-mesh probe (`scene.sampleHeight`) when the DEM stays cold — latched to ONE firing per flight, for exactly the cells the cache could not answer, so a route costs at most 8 `sampleHeight` calls however long it arms — and otherwise holds the launch altitude for the whole route. A corridor is only RESOLVED when every cell is accounted for: one warm cell says nothing about the ground under the other seven, and treating it as an answer let the dolly descend to 460 m over a 1,600 m rendered surface. The probe reads the rendered surface at the current LOD (rooftops and primitives included) — a better estimate than nothing, not a guaranteed upper bound. Never descend blind. The floor is SMOOTHED in both directions for the ride while the hard clearance clamp reads the RAW sample, so a cell boundary cannot pop the eye but a cliff is still cleared on the frame it is seen. A pre-departure floor is adopted whole; one arriving mid-flight is eased onto, and the eye's descent rate is capped.
  - Pins: `src/routeCinematics.test.mjs` (26 tests), with `scripts/qa-flyroute-mutations.mjs` reverting each fix individually to prove they are load-bearing (19 named defects); rendered proof `scripts/qa-flyroute-cinema.mjs` (drives the real voice runner, measures the real Cesium camera every frame, writes a labelled contact sheet).
- **Public control facade** on StyleManager (`setHudVisible/setHudLayout/setDetection/setMapStack/setBloom/setSharpen/setOrbit/setCleanView/getControlState` plus `runImmediateNavigation`): every setter syncs DOM sliders + share links + scene snapshots and returns `{ok, ...state}` — voice confirms only what actually happened. Validated `move_camera`, `fly_route`, `frame_overhead`, strongest-fire focus, and entity tracking use the shared navigation transaction, which refuses Cockpit before mutation, advances authority, releases follow owners, cancels stale work, and only then starts the requested action. All four entity layers expose `findByQuery/getNearby/getAllPositions/trackById|selectById/stopTracking/getTrackedInfo`.
- **Scene context** (`get_entity_context`): selected entity from the context store, or visible entities ranked by distance to the view target (≤100km altitude); plus basemap context — view-target picking, 7-point viewport sampling, view-scale classification (global/continental/regional/metro/city/local), reverse geocoding (center ≤750km, viewport samples ≤3,000km), Google Places Nearby via `/api/google/nearby-places` (≤25km), known-landmark matching against `CITY_POIS`, coarse country inference fallback. Context assembly is capped at 1.5s with cache fallbacks; caches are deduped in-flight.
  - **Every selectable layer writes that one slot** (2026-08-21). The tracking layers — flights, military, satellites — publish selection on their own awareness lane (`gev:awareness-subject-selected`, consumed by the readout card and the Contacts panel) and for the life of the voice tools never wrote the shared slot, so `scope:'selected'` silently answered `in_view` with a contact plainly selected on screen. They now call `selectTrackedSubjectContext` / `refreshTrackedSubjectContext` / `clearTrackedSubjectContext` (`src/data/contextStore.js`) on select / poll / deselect. **Invariants: (a)** that write path must NOT dispatch `gev:entity-selected` — tracking layers already own an event lane and a second one makes two surfaces fight over one subject; **(b)** exactly one record per tracking layer, because a frozen snapshot of a moved contact must never reach the visible-entity scan; **(c)** precedence is recency, not layer — one slot, last selection wins, so clicking an overlay entity supersedes a tracked plane as the voice subject while the plane stays tracked. Satellites refresh on the 1 s propagation beat, not per frame.
  - **Context-mode vocabulary is symmetric** (2026-08-21). `set_context_mode` accepts `contacts`; the internal id is `flights`. Every model-readable field (`mode`, `entering`, `priorMode`, nested `context`/`contextRollback`, and the transition diagnostic text) is reported in the accepted vocabulary, with the internal id preserved as `<field>Internal`; an absent secondary mode stays `null` rather than claiming to be `off`. Mapping lives in `src/contextModePolicy.js` so UI text and voice payloads cannot drift. Reporting the internal id made the model read `mode:'flights'` as "Contacts is off" and refuse to answer from the `contactsWindow` counts in the same payload.
  - **Analyst → track handoff carries a key, not just a label** (2026-08-21). `analyst_query` items include `icao24`/`mmsi` alongside the display `id`, and contact lookup uses the shared tiered ranking in `src/data/contactMatch.js`: hex exact → callsign exact → registration exact → callsign prefix → registration prefix → callsign substring → registration substring. The tiers keep an exact callsign ahead of a colliding registration regardless of feed order, and registrations compare separator-insensitively (`G-ABCD`/`GABCD`, `05-8152`/`058152`, `N123AB`/`N-123AB`).
  - **A typed command supersedes the turn it interrupts** (2026-08-21). `sendTextCommand` defers its `response.create` behind an active response instead of colliding with it, marks that response superseded so a late function call from it is refused rather than dispatched, and drops the old turn's queued follow-up. A refused call is still ANSWERED — a terminal `{ok:false, superseded:true}` `function_call_output` — because an unanswered `function_call` strands a pending call and deadlocks the model; the refusal creates no response of its own. A burst of typed commands coalesces into one response while keeping both conversation items.
  - **Subject reconciliation across satellite catalog rebuilds** (2026-08-21). A dense↔core toggle or TLE refresh clears and repopulates the catalog, so the published subject is re-resolved against the new satrec; a subject that did NOT survive releases the slot. The per-frame refresh cannot do this itself — `_getTrackedFramePosition` returns early once the satellite has no catalog entry — so the reconcile runs at rebuild completion. An empty catalog is a rebuild in flight, not a disappearance.
  - **One aircraft-proximity engine** (2026-08-22). `collectAircraftProximityWindow` (`src/data/militaryAwareness.js`) is the single computation behind both the Contacts panel window and the voice analyst's entity-centred "how many nearby", so the panel readout and the spoken count for one centre are identical by construction. **Invariant: do not re-derive a proximity count anywhere else.** They diverged before because the panel read live billboard positions (20,000 cap) while the analyst used last-fix coordinates over a 2,000-record slice — 111 on screen, 15 spoken. Explicit regions and arbitrary points deliberately keep the general record engine. Entity-centred results carry `window: {engine:'contacts-window', centeredOn, radiusKm, flights, military, aircraft}`.
  - **Centre precedence for nearby asks**: explicit place in the question > Contacts subject (a selected non-contact entity never silently becomes the centre) > an entity the user names > the current view, said aloud. Contacts active with no subject uses the view rather than reading an empty panel.
  - **Contact-match ties break on hex ascending.** `track_entity` is a mutation fulfilling "follow that one", and the model's observed answer to a non-ok track result is to retry with guesses rather than ask, so the lookup always commits rather than returning an ambiguity. What it owes the caller is stability: hex is unique and always present, so the same query resolves to the same contact for as long as both are loaded.
- **Visual grounding**: at `local` view scale with no structured identity, the client captures the Cesium canvas (≤1200px JPEG, black-frame detection, double-render for freshness) and sends it as `input_image` with a strict "do not invent labels" instruction.
- **Context window**: only the latest viewport screenshot stays in context — the client deletes the prior image item (`conversation.item.delete`) before adding a new one (images are the most expensive item, re-billed every turn). Text history is bounded by the **server-side** `truncation: { type: 'retention_ratio', retention_ratio, token_limits.post_instructions }` set in `/api/realtime/token` (cache-friendly batched truncation). There is intentionally **no** client-side per-turn conversation-item cap — deleting from the front of history each turn busts the Realtime prompt cache. A spatially-aware summarize-and-prune policy is specced for a future iteration.
- **Model tier + spend guard** (`src/voice/voiceCost.js`, August 2026): the voice heading row carries a `STD`/`MINI` toggle and a running session-cost readout (`~$0.42`).
  - **Tier selection.** `standard` = `gpt-realtime-2` (default), `mini` = `gpt-realtime-2.1-mini` (~3× cheaper per audio token). The client sends `?tier=` to `/api/realtime/token`; the endpoint resolves it through the shared registry, so an unknown, empty, or hostile value falls back to `standard` rather than reaching OpenAI as a model id. Responses echo `X-GEV-Voice-Tier` / `X-GEV-Voice-Model` (plus `X-GEV-Voice-Tier-Fallback: 1` when a bogus tier was downgraded). Persisted at `gev:voice-cost:tier`.
  - **Applies NEXT session.** The model is fixed when the ephemeral token is minted, so a live session always keeps the model it connected with; toggling mid-session only records the preference (the button title says so). The cost tracker's lifetime is the session's lifetime and its model binding is immutable from `start()` to `stop()` — rebuilding it on toggle would erase accrued spend and let repeated toggles bypass the cap. The tracker may only be replaced once the session is FULLY SETTLED (`isVoiceSessionSettled()`: not active **and** no data channel **and** no peer connection) — `!isActive()` alone is not enough, because the `error` status reports inactive while the transport can still deliver a late `response.done`. The toggle itself reads and writes only the persisted preference, never the live tracker.
  - **Env overrides.** `OPENAI_REALTIME_MODEL` / `OPENAI_REALTIME_MODEL_MINI` remain authoritative per tier, so a drifted upstream model id is a `.env` fix rather than a code change. Because an override can point a tier at any model, the client prices against the model id the server actually echoed, **not** the tier it requested. An unrecognised id is billed at the most expensive known rates plus one console warning — under-metering is what lets a cap be overrun.
  - **Metering.** Token usage from each `response.done` is folded into a per-session estimate. Cached tokens are subtracted from their modality totals; any aggregate-minus-details residual (and any payload with no detail at all) is attributed to audio rates, so uncertainty always resolves *upward*.
  - **Thresholds** (one object, persisted at `gev:voice-cost:limits`): soft warning at **$2** — amber readout plus exactly one console line; hard cap at **$5** — the session ends through the ordinary stop path (data channel and peer connection closed, mic tracks stopped) and the readout reads `Session ended — cost cap`. `0`/negative disables a threshold and round-trips through storage as an `'off'` sentinel (raw `Infinity` would JSON-serialize to `null` and silently restore the default); a corrupt entry falls back to the defaults rather than disarming the cap.
  - **Cap semantics — in-flight tools COMPLETE and are NOT rolled back.** A session-ending latch (`isSessionEnding()`) is checked at the tool-dispatch site, so no *new* tool is dispatched once the cap trips. `extractFunctionCalls` yields at most one call per event, so that single check covers the whole batch. A tool already executing may still finish its map mutation (a camera flight, a layer toggle, an annotation). This is deliberate: unwinding a partially applied map change has no safe general implementation, and a half-reverted camera/layer/annotation state is worse than a completed one.
  - **In-flight response at teardown → the accounting is INCOMPLETE.** Usage only arrives with `response.done`, which never comes for a response cut off by teardown (`stop()` closes the peer connection, and the server cancels rather than completes it). Rather than invent a token count for it, the tracker is marked `incomplete`: the chip shows a trailing `*` (`~$1.00*`) as a see-note mark and the tooltip carries the reason. Deliberately **not** presented as a lower bound — the estimate can also run high (residuals and unrecognised models bill at worst-case rates, and sub-cent totals round up), so it is partial rather than directional. (A bounded teardown drain was tried and removed: `pc.close()` closes the data channels a drain would listen on, so it was structurally dead.)
  - **⚠️ Model ids and rates are external facts** read from OpenAI's model + pricing pages on 2026-08-18 and marked VERIFY-AT-RELEASE in `voiceCost.js`.
- **Reliability**: tool-call dedupe (2.5s window across call/item/args keys); response-create queueing that respects active responses and defers follow-ups when the user starts speaking; per-tool follow-up instructions so the agent confirms only what actually happened (zoom confirms only on `ok=true`).
- **Aircraft identity honesty:** “What is this aircraft?” reads callsign, operator, registration, type, and route only from the selected contact context. Missing operator, route, or type enrichment is named explicitly rather than silently omitted or inferred from the callsign.
- **Diagnostics**: every client/server event is posted to `/api/realtime/debug-log` and appended to `.gev-logs/realtime-conversations.jsonl` (gitignored) with secret/image redaction; last 30 errors persist in `localStorage` (`gev-realtime-errors`); `window.__gevVoiceCommands.getDiagnostics()` in the console.
- **Counting semantics ("near")** — a CONTRACT; new count-bearing tool work inherits it. Three honest numbers exist for one question: the Contacts cohort (250 km around the subject, what the panel shows), `analyst_query`'s count of *currently-loaded* records for the requested scope, and the layer-wide loaded total in `coverage.layersQueried[].records`. They diverge legitimately — the flights layer loads by viewport, so after a camera dive the loaded set can hold a fraction of the cohort (field case: panel 42, analyst 8). The contract:
  1. **Contacts ACTIVE** → "near / nearby / how many aircraft" means the **Contacts window** — the panel's numbers, spoken verbatim. Mechanism: `contactsWindow` (`{centeredOn, radiusKm, flights, military, vessels}`), carried by both `analyst_query` and `get_current_view_state`, derived by `contactsWindowFromSnapshot()` from the same snapshot the panel renders so the two cannot drift. A cohort whose feed cannot answer reports `'unknown'`, never a confident zero.
  2. **Contacts OFF** → "nearby" means **in view**; "near \<place\>" means a radius around that place. A radius query with Contacts active and no explicit centre is centred on the **active contact**, not the camera.
  3. **Every count names its scope in words** — "42 in your window", "8 in view", "about 30 within 250 km of Austin" — never a bare number. `analyst_query` returns `scopeLabel` so this is mechanical. Two different numbers with named scopes are not a contradiction.
  4. **The loaded-data caveat is stated once when relevant**: counts cover loaded data, and the flights layer loads where you look (appended to `coverage.note` for radius/view scopes over viewport-loaded layers).
- **Degradation**: without `OPENAI_API_KEY`, `/api/realtime/token` returns 503 and the mic button surfaces the error; the rest of the app is unaffected.

### Voice Backend #2: Claude + Web Speech API (September 2026, stopgap)

A second, **additive** voice backend for users without an OpenAI budget —
per PM decision `ec1f62af-ba33-4f83-b602-76ae742bfc59`, explicitly temporary
and not a replacement for OpenAI Realtime above. Anthropic has no
speech-to-speech API, so Claude is paired with the browser's own
**Web Speech API** (`SpeechRecognition` for STT, `SpeechSynthesis` for TTS)
— $0 cost, turn-based rather than always-listening.

- **One `window.__gevVoiceCommands`, two backends.** `src/voice/voiceBackendSwitch.js`'s
  `createVoiceBackendCoordinator` delegates every public call
  (`start`/`stop`/`setStatus`/`setMicrophoneEnabled`/`setVoiceSpeaker`/
  `isActive`/`getDiagnostics`) to whichever backend is currently selected.
  Both backends share the SAME DOM tray (one `#gev-voice-control`, one mic
  button, one cost readout) and the SAME `gevActions.js` action runner (one
  `createGevActionRunner()` call, not two) — Claude is a second *caller* of
  the existing tool runner, not a new tool implementation. `runner` itself
  is pinned to the OpenAI-built instance regardless of which backend is
  active, so camera-verb/prewarm wiring is never installed twice.
- **`[GPT|CLAUDE]` backend pill** sits next to the STD/MINI tier pill inside
  the voice tray. Hidden by default; revealed only once BOTH hold: the
  server reports `ANTHROPIC_API_KEY` configured (`GET /api/setup/status`,
  the `anthropic` key entry's `set` field) AND this browser supports both
  Web Speech pieces (`isSpeechRecognitionSupported() &&
  isSpeechSynthesisSupported()` in `src/voice/webSpeechIO.js`) — Firefox has
  no default `SpeechRecognition` support, so the pill simply never appears
  there rather than failing on click.
- **Turn-based state machine, not always-listening.** `GevClaudeVoiceController`
  (`src/voice/gevClaudeVoice.js`) runs `idle → listening → thinking →
  toolExecuting → speaking → idle` per utterance — `webSpeechIO.js`'s
  recognizer is push-to-talk (one result per `start()`), so there is no
  "connected and waiting" state. **Known limitation, not silently patched:**
  the hold-Space push-to-talk shortcut always targets OpenAI Realtime, even
  while Claude is selected — only the mic BUTTON is backend-aware.
- **Bounded multi-turn tool loop.** Unlike this app's single-shot treatment
  of an OpenAI Realtime function call, Anthropic's Messages API can return
  several `tool_use` blocks per response and ask for MORE tools after their
  `tool_result`s come back. `src/voice/claudeToolLoop.js` holds the pure
  bookkeeping (`extractToolUseBlocks`, `buildToolResultMessage`,
  `extractFinalText`, `hasExceededToolLoopLimit`,
  `trimConversationHistory`) — `MAX_TOOL_LOOP_ITERATIONS` hard-stops a
  confused model or a tool that always looks actionable, and speaks
  whatever partial confirmation is available rather than hanging silently.
  Conversation history is trimmed to a short window, mirroring the OpenAI
  pipeline's own "map state is fetched live per turn" philosophy.
- **Non-streaming proxy** (`anthropicProxy()`, `vite.config.js`), mounted at
  `POST /api/anthropic/messages`: reads `ANTHROPIC_API_KEY` server-side
  (browser never sees it), injects `tools: toAnthropicTools(GEV_TOOL_SCHEMAS)`
  server-side — same trust boundary as `GEV_REALTIME_TOOLS`, the client
  never defines what's callable — and defaults `system` to
  `GEV_CLAUDE_VOICE_SYSTEM_PROMPT` (`src/voice/voiceSystemPrompt.js`, the
  same persona/tool-usage contract as OpenAI Realtime's own instructions, so
  the two backends can't drift apart in what they're allowed to do). Returns
  `503` if the key is unset, mirroring `/api/realtime/token`. Opt-in per-IP
  rate limit via `GEV_RATELIMIT_ANTHROPIC_PER_MIN`.
- **Model tier + cost tracker** (`src/voice/claudeVoiceCost.js`) mirrors
  `voiceCost.js`'s shape: `standard` = `claude-haiku-4-5-20251001` (default),
  `pro` = `claude-sonnet-5`, both overridable via `ANTHROPIC_VOICE_MODEL` /
  `ANTHROPIC_VOICE_MODEL_PRO`. Audio never reaches Claude (STT/TTS happen
  entirely in the browser), so pricing is plain per-token input/output —
  no audio-token tier to account for. Shares the same visible cost readout
  (`#gev-voice-cost-value`) OpenAI uses; whichever backend is active repaints it.
- **Visual states.** `thinking`/`speaking` are genuine new states (Claude
  round-trip latency plus TTS playback are both real time the user should
  see something for); `toolExecuting` deliberately reuses the existing
  `executing` CSS hook (`DATASET_STATUS` remap table in `gevClaudeVoice.js`)
  rather than duplicating the amber tool-running treatment.
- **Explicit manual-QA gap**: real microphone capture and real speech
  synthesis cannot run in `node:test` or in `npm run test:track`'s puppeteer
  harness — see `TESTING.md`'s Claude voice backend scenario. `npm run
  build`/`npm test` prove the pure tool-loop/coordinator logic is correct,
  not that the end-to-end voice round trip works.
- **Degradation**: without `ANTHROPIC_API_KEY`, or on a browser lacking Web
  Speech support, the backend pill never appears — OpenAI Realtime is
  entirely unaffected either way.

### AI HUD Summary (June 2026)

- HUD `SUMMARY` readout requests a five-word intelligence-style summary from `/api/openai/hud-summary` (model `OPENAI_HUD_SUMMARY_MODEL`, default `gpt-5-nano`, minimal reasoning).
- Input is the live basemap label context (place/street/nearby-place labels + enabled layers) — the model is instructed not to infer from coordinates.
- Output is sanitized to exactly five words; falls back to the deterministic telemetry summary on error/timeout (5s abort); typewriter animation on update.

### Map Stack Switcher (June 2026)

- `src/mapStackController.js` switches between Google Photorealistic 3D (`photoreal`, opt-in: the tileset loads when a Google or ion key is present but starts hidden and only shows when the user picks it), keyless Esri World Imagery (`DEFAULT_BOOT_STACK`, the landing basemap on every fresh boot with or without keys, with keyless terrain), keyless Esri Dark Gray Canvas (a muted dark basemap for pairing with HUD visual styles), Bing Aerial / Aerial-with-Labels via Cesium ion world imagery (require `CESIUM_ION_TOKEN`), and OSM tile fallback. Bing Road is **retired**: it is gone from `MAP_STACKS`, from the `set_map_stack` enum, and from the voice aliases (road phrasings now resolve to OSM, the one shipped road basemap). The share hash carries no basemap (see below), so an old `map=bing-road` / `map=photoreal` link is simply ignored and lands on Esri — pinned live in `scripts/qa-map-source-tray.mjs`. The two Esri stacks (`esri-imagery`, `esri-dark-gray`) share one on-screen "Powered by Esri" attribution credit and one OSM tile-failure fallback watchdog, gated on the `ESRI_ATTRIBUTED_STACK_IDS` set rather than either id alone.
- The bottom Visual Presets tray presents a **six-tile MAP SOURCE row** (`#map-stack-chips`, `src/mapStackChips.js`): Google 3D, Esri Satellite, Esri Dark Gray, Bing Aerial, Bing Labels, and OSM. The duplicate left `#stack-panel` is retired. The six tiles share one row on desktop and two rows on narrow screens, carry `aria-pressed` on the active source, and remain keyboard-reachable with a visible focus outline.
- The lit tile follows controller state, not the click: a rejected switch (no ion token) or a superseded one (rapid A→B) leaves the genuinely active source lit, and the tray heading keeps its short-label status readout (`...` while switching, amber on `lastError`).
- Ion stacks remain visible and keyboard-focusable when no ion token is configured, but expose `aria-disabled="true"` and do not switch. Their accessible label and tooltip quote `getStacks().unavailableReason` — the same string `setStack()` puts in the toast. OSM works keyless. The `ION` badge is gated on the stack's own `requiresIon`, so a `photoreal` chip unavailable because the Google tileset failed says so instead of falsely demanding an ion token.
- Stack choice does **not** participate in share links or the live hash: no `map=` key is written, and a `map=` key in an incoming link is ignored. Every load and reload lands on Esri Satellite (booted once by `main.js`; OSM takes over automatically if Esri is unreachable) with no second basemap activation behind it. Google 3D and the other stacks are manual in-session choices via the chip row or the `set_map_stack` voice tool, which share the `_setMapStack()` path, and are not remembered across reloads. Rationale: `docs/DECISIONS.md` § 2026-10-08 startup restore.
- **Photoreal coverage-gap auto-fallback (2026-09).** Google Photorealistic 3D Tiles only ship photo-textured "surface" mesh for ~2,500 cities; elsewhere the tileset streams bare, untextured terrain that reads as a flat near-white viewport, and no Cesium/Google API exposes a per-view "has coverage" flag. While `photoreal` is active, `MapStackController` samples the rendered canvas ~500 ms after each `camera.moveEnd` settles (never per-frame — this codebase's render-loop discipline forbids that); a sample is "blank" when it is near-white AND near-uniform (luminance alone would false-positive on legitimately bright real scenery like snow or desert). Two consecutive blank samples (throttled to at most one sample per 2 s) trigger a silent `setStack('esri-imagery')`, mirroring the existing `_watchEsriProvider` tile-failure fallback: one-way per episode, re-arms with a fresh strike count the next time photoreal becomes active, reuses the same `lastError`/amber-chip plumbing, and also shows a one-shot toast (`consumeCoverageFallbackFlag()`) since losing photoreal at a spot the user deliberately flew to is visually obvious.
- **Photoreal tileset LOD tuning (2026-09, performance audit).** `src/mapStartup.js`'s `loadPhotorealisticTileset()` previously called `Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true })` with zero LOD tuning — Cesium's own default `maximumScreenSpaceError` (16px) targets near-photographic fidelity assuming the tileset has the GPU to itself, but this app runs the tileset alongside fleet 3D models (draw-call-per-model, no instancing — up to 700 concurrent in "all" mode), the panoptic detection overlay, and a GLSL post-process style, all potentially active at once. It now passes `maximumScreenSpaceError: PHOTOREAL_MAXIMUM_SCREEN_SPACE_ERROR` (`24`, exported so tests/tuning stay in one place) and `dynamicScreenSpaceError: true` explicit (already Cesium's own default as of 1.138, pinned here so an upstream default change can't silently alter this app's behavior) — trading a small amount of distant-tile crispness for GPU headroom under combined-layer load. Esri/OSM/Bing stacks are unaffected (they aren't `Cesium3DTileset`-based).

### Voice Map Whiteboard / Annotations (June 2026)

- Runtime entry: `src/main.js` calls `initAnnotations({ viewer, tileset })`, exposes `window.__gevAnnotations`, and passes the engine into the voice action runner.
- Engine contract: `src/annotations/annotationEngine.js` owns annotation state, TTL/fade lifecycle, concurrent anchor resolution, duplicate detection keyed on geometry, cancellation on clear/newer generations, and a hard cap of 120 live marks. Deferred outline upgrades drain FIFO at concurrency 2; queued work retains the owning abort controller and is discarded on a generation change before it can fetch.
- Resolver contract: `src/annotations/annotationResolver.js` converts names/coords/screen pixels into world anchors and optional geometry. The resolver is type-aware: Google Geocode/Places gives a centroid + scope, OSM/Overpass supplies admin/place/footprint/street/enclosing-area geometry, route requests use `/api/route`, and ambiguous/far results are rejected or recovered near the current view instead of drawing misleading blobs. Only explicitly country/state/county-scoped asks bypass near-view recovery and proximity gating; state scope requires a leading `state of …`/`the state of …` phrase, while bare names, proper names ending in “State,” and administrative geocode result types alone remain guarded. Overpass throttles remain distinct from normal transients: `Retry-After` is honored for one retry, and a repeated throttle ends only that mark's outline upgrade.
- Renderer contract: `src/annotations/hybridAnnotationRenderer.js` routes draped `area`/`route` geometry to world-space Cesium rendering and reticles/pins/arrows/callouts to the screen-space SVG renderer. Area labels are screen-space callouts so all captions share one visual language; progressive outline upgrades convert the existing screen group in place when the anchor snaps to the resolved centroid.
- Tooling: voice has `annotate_map` and `clear_annotations` tools. Annotations accumulate and persist by default; clearing is explicit only. Partial failures, approximate synthesized zones, and route fallbacks are returned as structured tool results so the voice layer can be honest.
- Console/dev API: `window.__gevAnnotations.tour()`, `.demo()`, `.annotate()`, `.clear()`, `.count()`, and `.list()` are the deterministic no-mic test surface.
- Current known resolver gap: mall/lifestyle districts such as "The Domain, Austin" can prefer a named building over the broader retail envelope. Product decision is that districts should become envelope + key buildings, but the scoring change still needs a careful multi-case validation pass.

### 3D Aircraft + Tracking

- **The TRACKED contact's 2D↔3D handoff is DEFAULT behaviour, driven by camera distance alone.** It does NOT consult the DISPLAY-rail `3D` toggle, which continues to own the FLEET (the un-instanced draw-call budget stays the operator's decision). Policy lives in `src/data/trackedModelRegime.js` and is shared by both layers: enter below `TRACKED_MODEL_ENTER_ALT_M` = 150,000 m and hand back to the billboard only above `TRACKED_MODEL_EXIT_ALT_M` = 172,500 m. The swap distance is set at these thresholds because 2D reads correctly at ~600 km and the handoff belongs at ~150 km (see `docs/DECISIONS.md` for the playtesting history). **Consequence, recorded on purpose:** the tracked contact now enters 3D NEARER than the FLEET does (`MODEL_ALT_CEIL_M` = 800,000 m, unchanged), so with the DISPLAY-rail `3D` toggle on, 150–800 km draws surrounding contacts as models while the selected one is still a glyph. Nothing double-draws (the fleet pass skips the tracked icao) and aligning the two is a fleet-side decision, deliberately out of scope. **The two thresholds are asymmetric on purpose:** a single threshold makes a tracked orbit sitting ON the boundary strobe billboard↔model as the camera's altitude wobbles across it. Do not collapse them. The latch is scoped per selection, so a new target re-evaluates against the ENTER ceiling rather than inheriting the previous target's exit band. Exactly ONE model is involved; it loads on demand when the regime opens, is HIDDEN (not released) on regime exit so re-entry has no load gap, and is released by the existing teardown on deselect/re-track/destroy. Cockpit and TR-3B suppression are unchanged. **Two invariants around it:** (a) the hysteresis latch AND the load-failure latch are per-selection state cleared by `_resetTrackedSelectionState()` in the tracking lifecycle (deselect / re-track / cross-layer / init / destroy) — the predicate's icao-change guard is defence only, since it needs a drawn frame while nothing is selected and the render governor's idle mode does not promise one; (b) on-demand loading is bounded at 3 attempts per selection with a 1.5 s backoff and one console warning naming the asset — the driver runs every `scene.preUpdate`, so an unbounded catch means a missing GLB spins load→reject at frame rate. The billboard stays the visual throughout a failed load.
- **Grounded 3D handoff is terrain-validity gated.** A ready civilian or military glTF does not own the visual until `groundSnap` (`src/data/groundSnap.js`) can answer with a MEASURED photoreal-surface height. On success the layer writes `height + the model's measured belly offset` before revealing the model. Cache movement is measured on the WGS84 surface, not across altitude, so a stationary contact keeps its snap through poll-time vertical-datum changes. Model existence or GPU readiness alone never suppresses the billboard floor, and ordinary zoom/style/deselect transitions preserve a valid snap cache. **Two states, and the difference is the whole design.** COLD — nothing has ever resolved for this icao (tiles still streaming on first sight, sample failure, backoff after a first miss): there is no evidence of where the ground is, `heightFor` returns null, the model stays hidden and the depth-test-free 2D billboard remains opaque and floored. WARM — a snap resolved and then a >`MOVE_INVALIDATE_M` (50 m) taxi move stopped it answering directly: the measurement is DEMOTED to a bounded last-known rather than deleted, and it keeps answering while the resample is outstanding, so a taxiing aircraft does not pop 3D→2D→3D across a 2–30 s retry backoff. The bound is `HELD_SNAP_MAX_DRIFT_M` = 250 m from the spot the value was measured at, past which the hold is dropped rather than stretched and the contact is COLD again. It is spatial with no timer beside it (ground under a contact that has not moved does not change; what invalidates the value is the contact MOVING) and deliberately a quarter of the billboard chain's `HELD_FLOOR_MAX_DRIFT_KM` — that hold only ever RAISES a sprite, while a held snap IS the model's placement, so its error shows in both directions. A fresh sample releases the hold, and so does a ground flip (which already calls `forget`). **A loading model is HIDDEN, never zero-scaled:** admission sets `show = false` (Cesium's default is `true`, and an unplaced primitive would claim the visual at the identity matrix), and ownership is `ready && show` — Cesium 1.138's `Model.update` has no `show` guard, so hiding a primitive costs its load nothing.
- Commercial and military aircraft use the same high-level FLEET model regime: 2D billboards when zoomed out, optional glTF models when closer, controlled by the DISPLAY rail `3D` toggle and `Proximity` / `All` modes. Models are PER-CLASS (see `docs/DECISIONS.md` for the Hangar-fleet rollout): real CC-BY GLBs for light/bizjet/turboprop/widebody/helicopter/uav (`CLASS_MODEL_REAL` in `src/data/aircraftClass.js` — meters-baked, scale 1, per-model belly/radius; provenance in `public/models/README.md`), the shared `airplane.glb` for the remaining civilian classes, and the military layer maps weight classes (real GLBs / 747 heavies / `jet.glb` fastjets, per-model heading offsets, always flat amber). Textured civilians carry a HEAVY tint, not a light one: `MODEL_COLOR_BLEND_AMOUNT` is `0.94` in BOTH layers under Cesium's `ColorBlendMode.MIX`, so the class colour supplies 94% of the surface and the asset's own texture ~6%. The visual direction is clean light silhouettes with only a weak diffuse contribution from the approved textures, so liveries deliberately do NOT read. IR boost raises the blend to a full `1.0`. Under NVG/FLIR (map preset or Cockpit vision) models render unlit flat-white at full alpha and scene fog is disabled (fog otherwise blacks out distant models with the globe hidden); state restores on exit.
- The DISPLAY-rail `3D` toggle is the user-facing activation path for both aircraft layers. Their small approved GLBs build their render resources without Cesium's frame-spread job queue, preventing continuous Photorealistic 3D Tiles streaming from starving model readiness; model caps, tracking, camera, and fallback billboards are unchanged.
- **The `3D` toggle DEFAULTS ON in `proximity` on a first run.** Proximity is itself the budget — models appear only below `MODEL_ALT_CEIL_M` and only for the nearest `MODEL_MAX` in view — so the default costs nothing at globe scale, and `all` remains a deliberate opt-in. A fresh boot runs NO layer-state restoration (`LayerStateCoordinator.start()` returns early with neither a share payload nor stored state), so four independent initializers decide what a first-run operator sees and must agree: `booleanOption('models3d', 'e', true)` in `src/data/layerState.js`, `_models3dEnabled = true` in BOTH flight layers, `this._models3dEnabled = true` in `src/ui.js`, and the `active` / `visible` classes on `#models3d-toggle` / `#models3d-mode-row` in `index.html`. All four are pinned together in `src/data/layerState.test.mjs`. Explicit state still wins: because the codec omits default-valued options, `models3d: false` is now what travels in a link (`lo=…f.e.0`) and restores OFF at both aircraft layers. **Consequence for returning users:** a stored `gev:layer-state:v2` blob is a FULL options snapshot, so a session that wrote one before this change carries `models3d:false` and keeps 3D off until the operator flips it (or clears the key) — the durable snapshot is treated as the recipient's own state, by design.
- **Consequence of the flip on the recorded tracked/fleet inversion:** the 150–800 km band where surrounding contacts draw as models while the SELECTED one is still a glyph is now what an operator sees WITHOUT arming anything. The inversion itself is unchanged and still deliberate (see `src/data/trackedModelRegime.js`); only its reachability changed.
- Civilian and military 2D aircraft use the established distance scale: `3×` near
  the camera and a `0.5×` floor from 8,000 km outward. A standard 20 px ambient
  icon therefore remains about 10 px at globe altitude while retaining the
  established close-range silhouette. Any compact alternative requires
  before/after visual evidence.
- Fleet model eligibility is distance-based with on-screen priority and hard caps (`MODEL_MAX`, `MODEL_MAX_ALL`) to avoid draw-call explosions. Each model owns its own `modelMatrix`; shared scratch matrices are forbidden because they caused stacking/flicker.
- **The model-ground-handoff engine (world-transform builder, ground-sample exclusion list, grounded display-position resolver, gap-proof billboard→model handoff, model-ownership predicates, stale-grounded-contact re-floor sweep) is one shared module, not two copies.** `src/data/modelGroundHandoff.js` (`createModelGroundHandoff()`) holds the logic that `flights.js` and `militaryFlights.js` used to carry as near-duplicate private copies, using the same per-layer factory-closure pattern as `deadReckoning.js`/`groundSnap.js`. `militaryFlights.js`'s fleet handoff still applies its own per-class heading override on top of the shared engine's default (a thin per-layer wrapper, not folded into the shared module, since the override is genuinely per-layer). The two files' stale-re-floor sweeps had ONE discovered behavioral discrepancy — `militaryFlights.js` skipped a contact a model already owns, `flights.js` did not — preserved verbatim via a required `gateStaleRefloorOnModelOwnsVisual` option rather than silently reconciled; which behavior is correct is an open follow-up, not decided by this extraction. Deliberately **not** moved: `flights.js`'s held-floor/corridor-warming system (OpenSky-enrichment-adjacent, has zero `militaryFlights.js` counterpart) stays there, unshared, by design.
- **`flights.js`'s adsbdb type/route enrichment (best-effort type/registration/route lookups for planes whose live feed carries no usable classification) lives in its own module, `src/data/enrichmentQueue.js`** (`createEnrichmentQueue()`). This is a `flights.js`-only extraction — `militaryFlights.js` has no counterpart, since its aircraft are pre-classified from the military registry rather than looked up. The module owns the bounded request queue (max 4 concurrent, ≤5/s drip, priority lane for tracked/model-eligible planes), the ambient fleet type-classification sweep (nearest-on-screen-first, gated by a rolling token-bucket budget so a busy session can't monopolize the free community adsbdb API), and the `window.__GEV_ENRICH_AMBIENT_QA` seam headless QA harnesses use to shrink the budget knobs (`scripts/qa-enrich-ambient.mjs`).
- Tracked aircraft use standalone model primitives driven from the already-settled dead-reckoned display position, while the tracked Cesium entity remains billboard-backed so `viewer.trackedEntity` always has a ready bounding sphere.
- **Dead-reckoning is one shared engine, not two copies.** `src/data/deadReckoning.js` (`createDeadReckoning()`) holds the ENU-frame extrapolation/interpolation math (bracketing-fix interpolation, constant-rate-turn extrapolation through the render-delay window, warm-up detection) that both `flights.js` and `militaryFlights.js` used to carry as near-duplicate private copies — same factory-closure pattern as `groundSnap.js`/`trailRenderer.js`: each layer creates its own instance (`renderDelaySec`, position-history/flight-data accessors, and per-layer field-name readers for velocity/track, since OpenSky and adsb.lol name those fields differently) so the caches stay per-layer while the math is shared. The persistent `last` scratch object (`courseDeg`/`speedMps`/`courseHold`/`extrapolating`) preserves the original zero-allocation module-scratch discipline — callers read it immediately after calling `deadReckon()`, same hot-path contract as before. `flights.js`'s dev-only focus-evidence QA override is an optional constructor param the military layer simply omits.
- **Fleet-billboard presentation (normal/Cockpit-far-dot rendering, TR-3B sprite resolution, IR-boost model reload batching) is one shared engine, not two copies.** `src/data/aircraftPresentation.js` (`createAircraftPresentation()`) holds the visual contract that `flights.js` and `militaryFlights.js` used to carry as near-duplicate private copies — same factory-closure pattern as `deadReckoning.js`/`groundSnap.js`/`trailRenderer.js`: each layer creates its own instance via accessor closures for reassignable per-layer state (billboards/flight-data/tracked-icao maps get replaced wholesale by test-reset/destroy paths) plus required callback params for genuine divergence (`resolveFleetColor`, `resolveFleetScale`, `cockpitFarColor`, `getModelSpec`). `militaryFlights.js` passes the same function for both `resolveFleetColor` and `cockpitFarColor` since its cockpit-far dot has no separate civilian-color branch. `_modelSpec`/`_modelColor`/`_modelMatrix`/`_ensureModel`/`_updateTrackedModel` stay per-layer by design — their branch structures and asset catalogs genuinely differ.
- Flights and military layers mirror the same tracking invariants: no warm-up freeze/jump, altitude-scaled framing, trail head glued to the displayed plane, no pull-out when switching targets, and no cross-layer orphan when switching between commercial and military tracks.
- Regression surface: `npm run test:track` drives the real app headless with synthetic aircraft feeds and asserts the tracking invariants without depending on live OpenSky/adsb data. `src/data/trackedModelRegime.test.mjs` pins the tracked contact's threshold math, the enter/exit asymmetry, and the default-on / cockpit / TR-3B / deselect wiring in both layers.

### TR-3B conversion Easter egg (August 2026)

- With a contact tracked, CONTEXT ▸ CONTACTS shows a small 🛸 chip beside COCKPIT (`#tr3b-toggle`, gated by `CockpitView.syncTr3bToggle()` on a tracked contact — not on the cockpit entry policy). Pressing it converts that contact into a TR-3B and pressing it again restores the real aircraft. State lives in `src/data/tr3bRegistry.js`: a session-scoped module-level `Set` keyed by ICAO 24-bit address, shared across both flight layers the same way `militaryRegistry.js` is, so a conversion holds through a civil↔military handoff. It is deliberately NOT persisted (no localStorage, no share-link param, no schema change) and layer teardown deliberately leaves it intact — only a page reload clears conversions.
- The sprite is two hidden kinds (`tr3b`, `tr3bHot`) in `src/data/aircraftIcons.js`, authored in the same 96×96 nose-up pipeline as the eight class silhouettes, so the triangle points along the display course through the existing screen-projected rotation path with `alignedAxis` still `ZERO`. They are unreachable from `classifyAircraft()`. Variant selection rides the existing `irBoost` layer param, so under NVG/FLIR/surveillance the hull stays cold and the four emitters render hot; a style switch re-images only converted contacts, never the rest of the fleet.
- Both layers resolve every `aircraftIcon()` call through a local `_iconKind()` shim (identity for unconverted contacts), so no refresh path — poll reconciler, two-tier raster swap, presentation pass, tracked entity — can revert a conversion.
- The class label follows the conversion across every surface that reports one: tracked card, cockpit/`getTrackedInfo`, Contacts, and the analyst record's `aircraftClass` (`tr3b`, the style-independent id, so a query answers the same in FLIR as in Normal). Callsign, flight level, speed, and route stay live-feed truth.
- A converted contact is billboard-only. It is excluded from model eligibility at SELECTION time, so it never consumes a `MODEL_MAX` cap slot, with the handoff guard and the tracked-model regime guard kept as defence. The billboard stays shown, so the contact keeps satisfying the `getNearby` / `getDetectableObjects` visibility guards and still works in Contacts and Cockpit.
- Regression surface: `src/data/tr3bRegistry.test.mjs`.

### Split-flap status chips (August 2026)

- The three status chips flip their LABELS over character by character when the text changes, like a departure board: `#global-loading-label` ("LOADING LIVE DATA" → "LOAD COMPLETE"), `#traffic-sync-label`, and `#cctv-sync-label` ("loading frames" → "camera grid ready"). All three route through `setSplitFlapText()` in `src/splitFlap.js`; there is no other writer of those three elements. The progress counters (`#*-sync-progress`, `#global-loading-detail`) are deliberately left as plain `textContent` — they tick several times a second, and flapping them reads as a slot machine.
- `#global-loading-label` doubles as the universal top-center status banner, so anything routed through `_showGlobalStatusNotice()` flaps as well — in particular the share-link restore notices, of which "Shared military flight could not be restored — feed unavailable" is the longest at 63 characters. That needs no special case: `planSplitFlap()` compresses the stagger to hold the 620 ms budget (26 ms → 6.9 ms per column at that length), every column is reserved for the whole cascade, and `element.textContent` is the complete notice at every instant, so the `aria-live` region announces the whole sentence rather than a fragment. A notice deferred minutes past boot is equally safe: `ensureHost()` re-validates the shell on every call, and the long-lived `Text` node is never replaced.
- **DOM text is the truth, and its node NEVER moves — do not "fix" this.** The first call upgrades a chip label into a permanent shell (`ensureHost`): a `.gev-flap-text` span holding one long-lived `Text` node, plus an `aria-hidden` `.gev-flap-cells` sibling. After that the ONLY text operation for the life of the chip is `node.data = next`. Nothing is reparented, so the label is never transiently empty and the `aria-live` region never sees a removal/reinsertion pair it could announce twice. `element.textContent` is the settled string at every instant, because the cells carry no text at all: both glyphs are CSS generated content (`::before` from `data-flap-prev` = outgoing, `::after` from `data-flap-next` = incoming), which never reaches `textContent`. This keeps QA pins honest and lets `_updateTrafficSyncChip`'s own `textContent !==` guard keep working. The shell is built on a tick where the text is NOT changing, so no real label change ever carries a structural mutation.
- **No animation loop, and exactly ONE `setTimeout` per change.** CSS `animation`/`transition` only, triggered once per text change and staggered through a per-cell `--gev-flap-delay`. The single timer is the settle that strips the cells; the width ease ends on a `transitionend`/`transitioncancel` listener, never a second timer. Idle cost is zero, there is no periodic work, and nothing requests a Cesium render or takes a render-governor hold. `setSplitFlapText` is a no-op on unchanged text, which is required — the chips are repainted by a 60 ms and a 500 ms ticker.
- **Only what was visible flaps away.** An interrupted cascade (A→B cut short by C) derives each column's outgoing glyph from `visibleGlyphs()` — what that column is actually SHOWING at that instant, which for a column whose stagger has not elapsed is still A, not the pending B. `FLAP_TURN_RATIO` must track the `gev-flap-out`/`gev-flap-in` keyframe crossover in style.css.
- **Columns never renumber mid-cascade — do not "optimise" this away.** For the whole cascade the board keeps one column per index of the LONGER string, each holding its own width; a column the new string does not reach flaps to a BLANK in place (`data-flap-next=" "`) rather than collapsing. Collapsing stacks the absolutely-positioned outgoing glyphs on one x AND lets a later glyph slide into an earlier column, which makes `visibleGlyphs()` lie and the interrupt rule flap the wrong glyph away. Pinned by "a cleared column holds its place instead of letting later glyphs slide left".
- Length changes are eased, never snapped, and the ease is placed so it never fights the flaps (`.gev-flap-sizing`): a GROWING label reserves its columns as the cells go in and eases at the START; a SHRINKING one holds full width for the whole cascade and eases at SETTLEMENT.
- Accessibility: the cells sit in an `aria-hidden` wrapper and the settled string is real text in the a11y tree, so the `aria-live` chips announce the label once per change rather than character fragments. No `aria-label` is used — ARIA prohibits naming a generic `<span>`. Because the text node is permanent and only its data changes, a label update is a single `characterData` mutation and settlement is none — node churn in a live region can double-announce.
- A chip hidden by clean-UI, recording mode, or an un-`.visible` (`opacity: 0`) traffic/CCTV chip swaps instantly instead of animating where nobody can see it; `prefers-reduced-motion: reduce` does the same.
- Kill switch: `SPLIT_FLAP_ENABLED` in `src/splitFlap.js`. Set it `false` and every chip returns to a plain instant swap with no other change.
- Regression surface: `src/splitFlap.test.mjs`.

### Panoptic Detection + Tracked Readout (June 2026)

- `src/data/detection.js` samples enabled layers through each layer's `getDetectableObjects()` contract and renders bounding boxes/labels from the shared host's sole Cesium post-render callback so boxes align with the final camera frame.
- Detection diagnostics count fading labels from the arbiter rows that are
  actually rendered. The label QA harness uses time-weighted label exposure for
  churn and requires conclusive solve/frame samples at both its 12,000-object
  pathological field and 5,200-object normal field without relaxing budgets.
- `src/data/detectionDraw.js` performs the batched, DPI-crisp canvas drawing for tier-colored labels, corner brackets, callouts, and distance-scaled tracked boxes. Unit tests cover label measurement and draw geometry.
- `src/data/trackedReadout.js` publishes a protected shared-host callout above tracked aircraft and satellites or selected mapped installations. It reads only each layer's cached display position—never a fresh entity position evaluation—preventing readout jitter against the rendered target. AIS selection remains in the vessel source's protected card path.
- **Detection labels/brackets are masked wherever their on-screen RECTANGLE overlaps the active CCTV monitor plane's projected screen rectangle, regardless of 3D depth.** The overlay's own horizon culling (`EllipsoidalOccluder.isPointVisible`) has no awareness of 3D scene geometry, so without this check an object's bracket/label would always composite above whatever 3D geometry sits in front of it in the scene. Each frame, `_collectOcclusionPlanes()` reads `cctvLayer.getOcclusionPlanes()` (via the `DataLayerManager` facade's `callLayerMethod`) — at most one entry, the active camera's plane, only while it's actually showing (§2c one-plane-at-a-time invariant). That plane's four corners are projected into 2D screen space once per frame through the same view-projection matrix used for every object's own screen position (`computeOcclusionPlaneScreenQuads`, `src/data/detectionPlaneOcclusion.js`). Masking is a **rectangle-vs-rectangle** overlap test (`isRectMaskedByPlanesOnScreen`, Separating Axis Theorem — an off-angle plane's screen quad is not axis-aligned), applied at two levels, both required: the bracket's own drawn rectangle (`detection.js`'s per-object loop, `bracketRect = {sx∓halfW, sy∓halfH}`), and every candidate corner placement's label-card rectangle inside `buildLabelPlacements()` (`src/data/detectionLabelGeometry.js`). The card check is the one that matters in practice — a card sits `halfW`/`halfH` + an 8-12px gap + the card's own width/height away from its anchor (routinely 40-100+ px), so an anchor-point-only test (the original approach, superseded) let a card still land on the plane even when the object's own anchor was correctly outside it. A label whose every candidate corner is blocked by the plane is dropped for that frame entirely, rather than forced onto a corner that still overlaps it. Masking is deliberately **not** a 3D depth test: CCTV planes sit at the real-world coordinates of the road/intersection they monitor, so nearby vehicle dots are often at similar-or-nearer camera depth than the plane itself, and a depth-only test (an earlier, since-superseded approach) left them visually overlapping the plane on screen despite passing the depth check. Screen-space masking is re-evaluated every frame, so an object un-masks the instant its projected rectangle clears the plane's. Scoped to this one check; every other layer's "see contacts through terrain" behavior (`disableDepthTestDistance: Number.POSITIVE_INFINITY`) elsewhere in the codebase is unaffected.

### CCTV — Indonesia unofficial live HLS pack (internal demo only)

- 1026 hardcoded cameras — Jakarta (15: 1 JPO + 14 `binamarga-unofficial-*`
  toll cameras), Bina Marga toll corridors (451 `bmtol-unofficial-*` across 25 corridors, listed below), Bandung (60
  `bandung-pelindung-*` from pelindung.bandung.go.id), Denpasar (96: 1
  Gunung Agung + 95 `denpasar-atcs-*`), Surabaya (141 `sby-atcs-*`), Cianjur (1 `cianjur-atcs-*`), Mataram (12 `mataram-atcs-*`), Pasuruan (31 `pasuruan-atcs-*`), Sumedang (35 `sumedang-atcs-*`), Malang (199 `malang-atcs-*`) — configured in `config/cctv_sources.indonesia_unofficial.json`,
  loaded independently of every other CCTV pack by
  `loadIndonesiaUnofficialSources()` (`src/data/cctvSourceCatalog.mjs`) so it can never disable the Austin/Caltrans/TfL live
  open-data packs. `sourceKind: 'unofficial-hls-id'` on every row.
  **Static config only — no auto-discovery or crawling of Indonesian ATCS
  portals; adding another city means manually adding another row.**
- **UNOFFICIAL, not for public/commercial deployment**: stream URLs were
  reverse-engineered via manual browser network inspection of public city
  CCTV portals. There is no formal data-sharing agreement with DKI Jakarta,
  Pemkot Bandung/Diskominfo (Pelindung), or Denpasar ATCS. See `DATA_SOURCES.md` for the full
  disclosure and each row's `license` field for the per-camera text.
- **Pelindung Bandung rows** are a curated, geographically spread subset
  (60 of ~270 streams that looked live when probed; coordinate-deduped,
  `headingDeg` unknown so `headingConfidence: 'low'`). Streams are
  `https://pelindung.bandung.go.id:3443/video/<vendor>/<name>.m3u8`
  (HLS v3, 14 s segments). Streams can go offline at any time. The 3 ATCS
  Bandung rows (Samsat/Buahbatu/Pasteur, `atcs-dishub.bandung.go.id`) were
  removed because they returned 404 upstream (mediamtx had no publisher);
  Bali Tower (Jakarta) was unreachable from the dev network and is not
  included. Rationale: `docs/DECISIONS.md`.
- **Bina Marga toll rows (APPROXIMATE LOCATION)**: 14 cameras (Akses
  Tanjung Priok ×5, Becakayu ×9 — 4 of them ramps/loop whose KM is guessed
  from the street name, so even less precise) whose stream URLs come from the
  binamarga.pu.go.id CCTV Tol ruas pages (hosts `pub2.hk-opt.com`,
  `cctv.kkdm.co.id` — operated by toll concessionaires, not Bina Marga).
  The source gives names only, so lat/lon are interpolated from the KM
  marker along a hand-drawn two-to-four-point route polyline (error roughly
  2 km or more) and heading is the assumed road bearing. Every such row says
  `APPROX. LOCATION` in its name, provider and license; do not treat these
  as surveyed positions. Cipali (`cctvastra.lintasmarga.com`) is included as
  `bmtol-unofficial-cipali-*` (see the corridor list below): the host omits its
  TLS intermediate, which `config/ca/` now bundles (Sectigo R36), so verification
  stays on.
- **Bina Marga toll corridor rows (451, APPROXIMATE LOCATION)**: `bmtol-unofficial-<prefix>-*`, one `cityId` per
  corridor: `tol-jakarta-cikampek` 42 `jakcik`, `tol-serpong-balaraja` 41 `sebal`, `tol-jalan-layang-mbz` 43 `mbz`,
  `tol-jorr-selatan` 21 `jorrs`, `tol-akses-tanjung-priok` 20 `atp`, `tol-jagorawi` 22 `jagorawi`,
  `tol-jorr-timur` 23 `jorre`, `tol-cipularang` 16 `cipul`, `tol-sedyatmo` 12 `sedyatmo`, `tol-jakarta-tangerang` 10 `janger`,
  `tol-padaleunyi` 9 `padcil`, `tol-semarang-batang` 15 `jsb`, `tol-balikpapan-samarinda` 13 `balsam`,
  `tol-pekanbaru-dumai` 21 `permai`, `tol-medan-tebing-tinggi` 11 `jmkt`, `tol-bengkulu-taba-penanjung` 18 `bengtab`,
  `tol-padang-sicincin` 11 `pacin`, `tol-palembang-indralaya` 10 `palindra`, `tol-indralaya-prabumulih` 9 `indraprabu`,
  `tol-pekanbaru-bangkinang` 10 `pekbang`, `tol-sigli-banda-aceh` 11 `sibanceh`, `tol-indrapura-kisaran` 18 `inkis`,
  `tol-binjai-langsa` 10 `binsa`, `tol-dalam-kota-jakarta` 20 `jtc`, `tol-cipali` 15 `cipali` (host `cctvastra.lintasmarga.com/barat/KM_*.m3u8`; only live recordings-free streams, KM 70-188 mapped onto the 115.6 km OSM chain from Cikopo), from the matching binamarga.pu.go.id CCTV Tol
  ruas pages (hosts `jmlive.jasamarga.com`, `pub2.hk-opt.com`, `pub.hk-opt.com`, `info.serbaraja-tollroad.co.id:20443`).
  Only cameras whose name carries a `KM nn+nnn` marker AND whose stream returned
  a real video segment when probed are included; gate/ramp/rest-area names have
  no KM so they are left out. Position = KM measured along the OpenStreetMap motorway centerline (ODbL) from a
  per-corridor origin (Jakarta-Cikampek: Cawang end; Serpong-Balaraja: KM 12.7 at the Serpong end; JORR South and JORR East:
  one JORR chain from Pondok Pinang eastward, KM converted to chain distance by a piecewise calibration against the
  exit KMs listed on Wikipedia (residual error up to ~1.5 km); Jagorawi: Cawang end; Cipularang: KM 65.8 at the
  Cikampek end; Akses Tanjung Priok: KM 58 at the Cakung end; MBZ: same KM axis as Jakarta-Cikampek,
  snapped to the MBZ viaduct; Sedyatmo: KM 19.0 at the JORR crossing; Padaleunyi: KM 122 at Padalarang;
  Semarang-Batang: KM 347.4 at Semarang; Indrapura-Kisaran: KM 86.9 offset so KM 125-132 sits near Kisaran;
  Dalam Kota (JTC): Cawang to Pluit via Tomang, the camera KM scaled linearly onto the 18.3 km OSM chain as if the road were 20 km (Wikipedia interchange KMs disagree with that by up to ~1 km);
  Binjai-Langsa: KM 17.0 at Binjai; Sigli-Banda Aceh: chain from the Banda Aceh end, KM = chain km; the Sumatra and
  Kalimantan corridors use the portal's own KM against the OSM chain from the toll start). All origins are assumptions,
  not field-verified; heading = the
  local road bearing, `headingConfidence: 'low'`. Streams can go offline at any
  time. The remaining Bina Marga ruas (dozens of streams, mostly without a usable KM or without a reliable KM origin)
  are deliberately not added; the global catalog cap is 4000 (`CCTV_MAX_SOURCES`, `DEFAULT_CCTV_MAX_SOURCES` in
  `src/data/cctvSourceCatalog.mjs`, which also sizes the health map) and the full catalog now sits near 3000 rows; over the cap it is silently truncated (one `console.warn`), so check `/api/cctv/sources` after adding a pack. Why only the densest ruas:
  `docs/DECISIONS.md` ("Bina Marga toll batches 4-7"). Revoke with the `bmtol-unofficial-*` prefix.
- **ATCS Denpasar rows (95, positions guessed)**: stream URLs
  (`https://atcs.denpasarkota.go.id/stream/<ID>/stream.m3u8`) were copied by
  the operator from the browser Network tab of the public ATCS page (requests
  succeeded with no Authorization header); the repo never calls the site's
  authenticated device API. The source gives no coordinates, so positions are
  guesses: 59 rows are placed from the street name in the camera ID
  (`APPROX. LOCATION`, ~1-3 km or worse) and 36 rows whose street could not
  be identified sit on a ring around central Denpasar (`CITY-LEVEL ONLY` —
  the marker means "somewhere in Denpasar", not a location). Heading unknown.
  Rationale: `docs/DECISIONS.md`.
- **ATCS Surabaya rows (141, positions guessed)**: stream URLs
  (`http://36.66.208.101:5000/hls/cctv_<N>/stream.m3u8`, plain http on a bare IP; the
  proxy fetches server-side and only the registered origin is allowed for
  nested segments) were copied by the operator from the browser Network tab
  (no Authorization header). 133 rows are placed from the street/intersection in
  the label (`APPROX. LOCATION`), 8 unidentifiable ones sit on a ~900 m ring
  around central Surabaya (`CITY-LEVEL ONLY`). Heading unknown. Only streams
  whose media sequence advanced across several probes were kept. The single
  Rationale: `docs/DECISIONS.md`
  ("ATCS Surabaya"). Revoke with the `sby-atcs-*` prefix.
- **ATCS Cianjur row (1, position unknown)**: `https://atcs.cianjurkab.go.id:5443/LieApp/streams/liliarahsuroso.m3u8`,
  copied by the operator from the Network tab (no Authorization header). The stream name gives no
  identifiable street, so the marker is placed at the centre of Cianjur town and labelled
  `CITY-LEVEL ONLY`. Relative segment names resolve through the same HLS manifest proxy. Revoke with
  the `cianjur-atcs-*` prefix.
- **ATCS Mataram rows (12)**: `https://relay-cctv.mataramkota.go.id/<slug>/video1_stream.m3u8`,
  copied by the operator from the Network tab (no Authorization header). 6 rows are placed from the
  intersection name (`APPROX. LOCATION`), 6 sit on a ~600 m ring around central Mataram
  (`CITY-LEVEL ONLY`). The streams are low-latency HLS (fMP4); the manifest proxy drops the LL-HLS
  tags (`EXT-X-PART`, `PRELOAD-HINT`, `RENDITION-REPORT`, `SERVER-CONTROL`) and serves a plain live
  playlist. Rationale: `docs/DECISIONS.md` ("ATCS Mataram"). Revoke with the `mataram-atcs-*` prefix.
- **ATCS Pasuruan (31) and Sumedang (35) rows**: `https://dishub.pasuruankab.go.id:5444/LiveApp/streams/<NAME>.m3u8`
  and `https://shinobi.sumedangkab.go.id/<path-token>/hls/<group>/<id>/s.m3u8`, copied by the operator
  from the Network tab (no Authorization header). Positions come from the label: Pasuruan 21
  `APPROX. LOCATION` / 10 `CITY-LEVEL ONLY`, Sumedang 23 / 12; the city-level ones sit on a ring around the
  regency centre. Pasuruan's server used to omit its TLS intermediate certificate, so the dev proxy trusts the
  bundled public DigiCert intermediate in `config/ca/` (`src/server/intermediateCaTrust.mjs`, installed once by
  `cctvProxy()`); verification stays on. Pasuruan has since moved to a Let's Encrypt chain that Node verifies
  on its own, so that file is now only a harmless spare. What is trusted is the intermediate, never a leaf: a
  leaf renewal needs no action. A new `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / "fetch failed" on a host means its
  issuer changed; add the new public intermediate to `config/ca/`. Rationale: `docs/DECISIONS.md` ("ATCS
  Pasuruan and Sumedang").
  Revoke with the `pasuruan-atcs-*` / `sumedang-atcs-*` prefixes.
- **ATCS Yogyakarta rows (133)**: `https://cctvjss.jogjakota.go.id/<folder>/<name>.stream/playlist.m3u8`
  (Wowza, plain HLS, no cookie, no portal session, standard public TLS chain). The pack stores the stable
  `playlist.m3u8`; the `chunklist_wNNN.m3u8` URL seen in DevTools carries a per-session id and must not be
  stored. Positions come from the label: 99 `APPROX. LOCATION` / 34 `CITY-LEVEL ONLY`; two cameras that failed on 2026-10-12 served live HLS again on 2026-10-14. Revoke with the
  `jogja-atcs-*` prefix.
- **ATCS Surakarta rows (134, FLV)**: `https://surakarta.atcsindonesia.info:8086/camera/<Name>.flv` (anonymous
  HTTP-FLV, one unbounded chunked stream per camera, no cookie or login). The 2026-10-14 re-check admitted a camera only when it returned the `FLV` header plus at least 50 KB of data and then
  streamed through `/api/cctv/media`; 18 URLs never answer, 3 use the VP6 codec that browsers cannot play, and the rest failed the proxy check. Rows carry
  `feedType: 'flv'`, `sourceKind: 'unofficial-flv-id'`, positions guessed from the label: 101 `APPROX. LOCATION` /
  33 `CITY-LEVEL ONLY`. Revoke with the `surakarta-atcs-*` prefix. Playback and proxy: see "FLV playback" below.
- **ATCS Pekanbaru rows (32)**: `https://cctv.pekanbaru.go.id/hls/cam-10.200.<x>.<y>/index.m3u8` (plain HLS,
  `#EXT-X-VERSION:6`, 5 s MPEG-TS segments, `Access-Control-Allow-Origin: *`, no cookie or portal session). The
  city page lists 86 cameras; only those that served a valid segment (first byte `0x47`) in at least one of three
  probes (2026-10-13; re-checked 2026-10-14, +3) are stored. The origin is slow (up to ~40 s) and 52 cameras answer 404, so the set can
  change; re-probe before adding more. The page carries no coordinates: 26 `APPROX. LOCATION` (a node shared by
  the two named roads in OSM, or a Nominatim hit bounded to Kota Pekanbaru) / 6 `CITY-LEVEL ONLY`. The two
  "Flyover Sudirman - Nangka" cameras share a label, so their ids end in the IP octets. No seeds for the city.
  Revoke with the `pekanbaru-atcs-*` prefix.
- **ATCS West Sumatra rows (106)**, read from the provincial aggregator `dashboardbencana.sumbarprov.go.id/cctv-kab-kota`
  and the city portals it links to. Only cameras that served a valid segment in a probe (2026-10-13) are stored.
  - `bukittinggi-atcs-*` (39): `hls.bukittinggikota.go.id/hls<n>/<token>/hls/<id>/cam<k>d<m>/s.m3u8` from the city's
    `api/get-list-camera`, which also publishes each site's latitude/longitude. 8 of its 47 cameras served no segment.
  - `solok-atcs-*` (18): `cctv.solokkota.go.id/<token>/hls/<id>/<id>/s.m3u8` from `kominfo.solokkota.go.id/showcctv`
    (no coordinates: 5 `APPROX. LOCATION` from Nominatim, 13 `CITY-LEVEL ONLY`). "Simpang Sigege" served no segment.
  - `padang-atcs-*` (28): `streamcctv.padang.go.id:3000/stream/<uuid>/channel/0/hlsll/live/index.m3u8`, Low-Latency
    HLS with fMP4 (`EXT-X-MAP`, `EXT-X-PART`). `hlsManifestProxy.mjs` already drops the LL tags and rewrites the init map and
    segments, so the browser gets a standard live playlist (checked end to end through `/api/cctv/media`). Names come from the portal
    modal; no coordinates (all `APPROX. LOCATION`, anchored on the named market, clinic or office).
  - `padangpanjang-atcs-*` (14): `mtx.padangpanjang.go.id:3443/cam<n>/index.m3u8` (MediaMTX, fMP4), names and site
    coordinates from the portal's `getCctv` JSON. The host omits its intermediate TLS certificate, so
    `config/ca/sectigo-public-server-auth-ca-dv-r36.crt` is bundled (same mechanism as Pasuruan and Malang). cam12 answers 404.
  - `pesisirselatan-atcs-*` (7): `live.pesisirselatankab.go.id/<key>/hls/kominfo/<id>/s.m3u8` with the coordinates from the
    page's `api.php?action=get_cameras`. "Kamera Carocok 4" repeats Carocok 3's stream and "Kamera Carocok 1" answers
    "File Not Found", so both are left out.
  - Rows whose source publishes coordinates carry the tier `SOURCE-PUBLISHED LOCATION` (position is the source's own, not
    surveyed; heading unknown, `headingConfidence: low`). Cameras at one site are spread ~45 m so every marker is selectable.
  - Not included: Padang Pariaman (its 14 streams are `i-see.iconpln.co.id` session URLs, all answering 502 with an expired
    TLS certificate) and Payakumbuh (two YouTube embeds, no HLS). No seeds exist for these cities.
  Revoke with the matching `<city>-atcs-*` prefix.
- **ATCS Kabupaten Bandung Barat rows (45)**, `bandungbarat-atcs-*`, from `atcs.bandungbaratkab.go.id` (Dishub KBB). Its public
  `/get-cctv` JSON lists 58 cameras with a name and coordinates; each one is a datarhei Restreamer page on
  `atcs-dishubkbb.urbanaccess.net`, whose `channels/<uuid>/config.js` names the manifest `memfs/<uuid>.m3u8` (master playlist, 720p,
  MPEG-TS, 2 s segments). The `?session=` token the playlists carry is not required (segments answer 200 without it), so only the
  bare manifest URL is stored and no `portalSession` is needed. Coordinates are the source's own (tier `SOURCE-PUBLISHED LOCATION`,
  heading unknown), shared sites are spread ~45 m, and elevation is per camera (611-1366 m, Open-Meteo). 13 cameras are left out
  because they answered 404 on every probe. Two Padalarang Flyover cameras (Cimareme / KBP) flip between 404 and live; they are
  listed since they served in every probe of the latest re-check, and may drop out again. TLS is a
  complete Let's Encrypt chain, so nothing was added to `config/ca/`.
- **ATCS Java / Banten rows (301)**, `<site>-atcs-*`, all `SOURCE-PUBLISHED LOCATION`, plain HLS, no cookie or `portalSession`,
  heading unknown, shared sites spread ~45 m, elevation per camera from Open-Meteo. Sites and counts (re-checked 2026-10-14: Banten +23, Semarang +13, Banyumas +5, Magelang +1): Magelang 75
  (`magelang-atcs-*`, datarhei Restreamer on `dev.cctv.magelangkota.go.id` / `restreamer.magelangkota.go.id`, `?session=` not stored),
  Semarang 59 (`livepantau.semarangkota.go.id/<uuid>/index.m3u8`), Cianjur 44 (Ant Media `atcs.cianjurkab.go.id:5443`, from the page's
  `/get-maps` list), Tangerang Kabupaten 28 (`cctv-dishub.tangerangkab.go.id/storage/video/<id>/<id>.m3u8`), Banjar 20 (Ant Media
  `atcs.banjarkota.go.id:5443`), Tasikmalaya 18 (`atcs.tasikmalayakota.go.id/camera/*.m3u8`), Banyumas 20
  (`cctv.dev.banyumaskab.go.id/<name>/index.m3u8`, master then variant), Banten province 37 (`cctv.bantenprov.go.id/service/stream-cctv/<id>/index.m3u8`, ids `banten-atcs-(lebak|bapenda|kp3b|gerbang|banten)-*`;
  of 164 listed, 127 still answer 404 although flagged Online). Rule: a valid first segment in the final probe AND a playlist through
  `/api/cctv/media`. Kota Serang 20 (`serang-atcs-*`, `stream.serangkota.go.id/LiveApp/streams/<name>.m3u8`, Ant Media; the server omits its TLS
  intermediate, so `config/ca/` bundles GlobalSign GCC R6 AlphaSSL CA 2025, valid to 2027-05-21; 3 of 23 listed are down). Not added: Ciamis and Kudus (no coordinates published), Medan and Kabupaten Bogor (list API needs a client
  id/secret), Jawa Tengah Dishub GIS (login), Grobogan (no public list found). Rationale: `docs/DECISIONS.md` ("ATCS Java and Banten").
  Revoke per site with its `<site>-atcs-*` prefix.
- **ATCS Aceh / Kalimantan / Situbondo rows (153)**, `<site>-atcs-*`, all `SOURCE-PUBLISHED LOCATION`, plain HTTPS HLS, no cookie, token or
  credential, heading unknown. Banda Aceh 47 (`api.bandaacehkota.go.id/cctv/memfs/<uuid>.m3u8` x45 and `cctv-stream.bandaacehkota.info` x2;
  many are park or water-level monitors), Balangan 36 (`cctv.balangankab.go.id/hls/<slug>/index.m3u8`), Banjarmasin 33
  (`atcs.banjarmasinkota.go.id/stream/<code>/index.m3u8`, about 30 s behind live), Kotawaringin Barat 22
  (`cctv.kotawaringinbaratkab.go.id/storage/stream/cctvN/aN.m3u8`, behind Cloudflare but served without a challenge), Tanah Bumbu 11
  (`atcs.tanahbumbukab.go.id/hls/cctv_chNN/index.m3u8`; two flaky channels dropped), Situbondo 19 (`cctvstream.situbondokab.go.id/cctvN/index.m3u8`, MediaMTX on demand: 12 more listed cameras answer HTTP 500 `source ... has timed out`, and the 19 can drop out the same way).
  Rule: advancing media sequence over three probes plus a valid segment through `/api/cctv/media`. Not added: Kutai Timur (WAF
  challenge), Jatim Pelayaran (MJPEG over http with embedded camera
  credentials), Pontianak (YouTube embeds), Kaltim (inactive, WebRTC or session tokens), the cctvnusantara.com aggregator (stream URLs not published).
  **Kediri 17 / Pati 4 rows** (`kediri-atcs-*`, `pati-atcs-*`) come from sources that publish no coordinates, so none is `SOURCE-PUBLISHED`:
  15 Kediri rows are `APPROX. LOCATION` (Nominatim match for the place named in the stream path `pplterpadu.kedirikota.go.id:8888/<slug>/index.m3u8`,
  error ~200 m-2 km), 2 (nabatiasa, water_torn) are `CITY-LEVEL ONLY` on a ring around central Kediri; the 4 Pati rows
  (`streaming.patikab.go.id/memfs/<uuid>.m3u8`, master then variant) are `APPROX. LOCATION` from the cctvnusantara.com listing, not from the source. Rationale: `docs/DECISIONS.md` ("ATCS Aceh, Kalimantan and Situbondo").
- **ATCS Gresik / Jombang rows (71)**, `gresik-atcs-*` (55) and `jombang-atcs-*` (16), `SOURCE-PUBLISHED LOCATION`, no credential stored.
  Gresik (`cctvkanjeng.gresikkab.go.id/hls/<slug>/index.m3u8`) only runs a stream while a viewer exists, so rows carry
  `onDemand: {controlUrl}`. `src/server/onDemandStream.mjs` (one manager per `cctvProxy()`) calls the host's anonymous
  `POST <controlUrl>/start?viewer_id=…`, sends `/heartbeat` every 20 s, `/stop`s after 60 s without a browser request or on server
  close, and `/media` retries the playlist for up to 10 s while the host writes it. A failed start answers 502 with a fixed generic
  message and marks the camera `SOURCE_OFFLINE`; the host's own error text (it quotes camera RTSP credentials) is never read.
  Jombang (`cctv.jombangkab.go.id/cgi-bin/nph-zms?monitor=N…`, ZoneMinder MJPEG) rows carry `pageToken: {pageUrl}`. The stream
  answers 403 without the 2 h JWT its public page prints next to each stream URL; `src/server/pageToken.mjs` reads the page,
  caches it in memory for 45 min (forced refresh at most every 30 s, after a 403) and never persists or returns the token.
  `src/server/mjpegSnapshot.mjs` takes the first JPEG part of the multipart stream and rejects ZoneMinder's "Unable to stream"
  placeholder by SHA-256. MJPEG is not a video feed type, so these cameras run in the panel's image mode and `/api/cctv/frame/:id`
  returns one fresh frame per poll. Both fields are same-origin-checked on load and omitted from every public payload. Rule: Gresik
  advancing playlist over three snapshots plus a segment over 10 KB through `/api/cctv/media`; Jombang a decodable, changing,
  non-placeholder frame through `/api/cctv/frame`. 19 Gresik cameras and 9 Jombang monitors are left out (down at source).
  Rationale: `docs/DECISIONS.md` ("ATCS Gresik and Jombang").
- **ATCS discovery-sweep rows (420)**, `<site>-atcs-*`, plain HLS, no cookie, token, query string or credential, heading unknown, shared
  sites spread ~45 m, elevation per camera from Open-Meteo. Found by checking the CCTV/ATCS subdomains of all 514 regencies and cities
  (Permendagri 72/2019) and reading each site's public pages, scripts and JSON for m3u8 URLs and coordinates. `SOURCE-PUBLISHED LOCATION`
  (the site publishes coordinates): Nganjuk 289 (`wxyz.nganjukkab.go.id/<app>/streams/<id>.m3u8`), Banjarbaru 47
  (`stream-backup.banjarbarukota.go.id/<name>/index.m3u8`), Jambi 19 (`cctv.jambikota.go.id/stream/<n>/stream.m3u8`), Garut 15
  (`cctv.garutkab.go.id/streams/cam_<n>/live.m3u8`), Karo 12 (plain **http** `72.62.122.47:8888/cam<n>/index.m3u8`; the only http host besides
  Surabaya's, pinned by address in the pack tests), Lebak 10 (`cctv.lebakkab.go.id/hls/CAM-<n>/main/index.m3u8`). No published coordinates:
  Ciamis 14 (`ams.ciamiskab.go.id:5443/LiveApp/streams/<id>.m3u8`) and Pemalang 12 (`stream.pemalangkab.go.id/...`) are `APPROX. LOCATION`
  from Nominatim, plus 3 Pemalang cameras `CITY-LEVEL ONLY` around the Pendopo. Balangan gains 2 cameras (Tugu Gula Habang Lampihong
  utama / area) that the source added later; 13 other listed Balangan cameras answer 404. Rule: advancing media sequence over three
  probes plus a segment over 10 KB through `/api/cctv/media`. Not added: Wonosobo (per-viewer token), Brebes (API 401), Kudus, Samarinda and
  Sukoharjo (challenge pages), Sibolga, Pematangsiantar, Sidoarjo smartcity, Indramayu, Kuningan, Tuban, Kebumen (no static HLS to read).
  Rationale: `docs/DECISIONS.md` ("ATCS discovery sweep"). Revoke per site with its `<site>-atcs-*` prefix.
- **ATCS Malang rows (199)**: `https://cctv.malangkota.go.id/cctv-stream/streams/<24 digits>.m3u8`. The origin
  answers 403 without a portal session, so these rows carry `portalSession: {bootstrapUrl, referer}`.
  `src/server/portalSession.mjs` (one store per `cctvProxy()`) GETs the bootstrap URL anonymously, follows up to 5
  same-origin redirects, keeps the cookies in memory for `min(Max-Age, 30 min)` and attaches them plus the `Referer`
  to the `/media` and `/rel` upstream fetches. The cookie is bound to the User-Agent that obtained it, so the
  bootstrap and the stream requests both use the proxy UA (`eagleeye-view-cctv-proxy/1.0`). A 403 triggers one
  refresh and one retry (forced refresh rate-limited to once per 30 s). Off-origin redirects are rejected and
  `portalSession` is never sent to the browser. The origin also omits its TLS intermediate; the bundled
  GeoTrust TLS RSA CA G1 in `config/ca/` covers it (leaf expires 2026-11-09). 167 rows `APPROX. LOCATION` / 32
  `CITY-LEVEL ONLY`. Dev proxy only — a static deployment has no session layer. Rationale: `docs/DECISIONS.md`
  ("ATCS Malang"). Revoke with the `malang-atcs-*` prefix.
- All 3 upstreams serve **multi-level relative-path HLS manifests**
  (master playlist → sub-playlist → segments). A byte-for-byte proxy pipe
  breaks this (relative URIs resolve against our own origin, not
  upstream), so `src/server/hlsManifestProxy.mjs` rewrites every relative/
  absolute URI in a manifest response to route back through a new
  `/api/cctv/media/:id/rel?p=<absolute upstream URL>` sub-route
  (`vite.config.js`), recursively handling nested manifests. The upstream
  host is never exposed to the client; the `/rel` route only ever fetches a
  URL whose origin matches the camera's own registered `source.url`
  (`isAllowedRelOrigin` — SSRF guard).
- Client playback: `createProjectionRuntime()` (`src/data/cctvProjectionRuntime.js`)
  always tries a dynamically-imported `hls.js` first (`attachHlsJs()` in
  `src/data/cctvProjectionVideo.js`, code-split, loaded when an HLS camera is
  activated). The browser's own HLS engine (`attachNativeHls()`, watched by
  `cctvNativeHlsWatch.js`) is only the fallback, used when `Hls.isSupported()`
  is false or the hls.js chunk fails to load. It is deliberately not chosen via
  `video.canPlayType('application/vnd.apple.mpegurl')`: current Chrome answers
  "maybe" there too, yet its native engine fails on these feeds and no hls.js
  instance exists to recover. Rationale: `docs/DECISIONS.md`.
  `destroyProjectionRuntime()` tears down the `Hls` instance before clearing
  `video.src`.
- UI: the CCTV panel source badge reads `⚠ UNOFFICIAL SOURCE · <STATUS>`
  (amber, `[data-frame-state='unofficial']` in `style.css`) for every camera
  in this pack, and the meta line shows the config's short `provider`
  disclaimer string automatically (`src/cctvPanelMixin.js`).
- Source health (`/api/cctv/health`, classifiers in
  `src/data/cctvSourceHealth.mjs`): a video camera is `ok` when the playlist
  answers with a video/mpegURL type (compared case-insensitively; a missing
  Content-Type is accepted for an `.m3u8` URL). `degraded` is reserved for
  transient trouble (5xx, 401/403/429, timeouts, wrong media type). `offline`
  means the provider removed the feed: HTTP 404/410, or the host is
  unresolvable/refusing (`ENOTFOUND`/`ECONNREFUSED`). The panel badge then
  reads `⛔ CAMERA OFFLINE · SOURCE DOWN` (`[data-frame-state='offline']`) in
  place of the generic KIND · STATUS label, and the meta line / monitor-plane
  placeholder carry `Camera offline at source (…)`. Status is per request, so a
  feed that comes back flips to `ok` on its next successful fetch.
- FLV playback (`feedType: 'flv'`, Surakarta): `src/data/cctvFlvPlayback.js` dynamically imports `mpegts.js`
  (own code-split chunk, loaded only when an FLV camera is shown) and plays the stream in the same `<video>`
  that feeds the canvas, so the monitor plane still never binds to the element directly. Browsers without MSE
  (`mpegts.isSupported()` false) or a failed chunk load report playback `unavailable`; there is no native FLV
  fallback. `mpegts.js` has no in-place recovery, so `src/data/cctvFlvSelfHeal.js` rebuilds the player on any
  mpegts error, on `no-data` (nothing within the connect timeout) and on a stalled playhead, with the same
  exponential backoff and offline cap as HLS; a `playing` event resets the attempt counter. Live latency is
  chased (`liveBufferLatencyChasing`, max 3 s). Looping is disabled for FLV. Proxy side
  (`src/server/liveStreamProxy.mjs`, used by `/api/cctv/media/` for `feedType: 'flv'`): `Range` is not
  forwarded, the response is forced to `video/x-flv` with `Cache-Control: no-store`, the body is piped
  unbuffered, the upstream fetch is aborted the moment the browser disconnects, and an upstream that sends no
  headers within 15 s (`LIVE_STREAM_HEADER_TIMEOUT_MS`) is cut and the camera is marked offline. Rationale:
  `docs/DECISIONS.md` ("ATCS Surakarta: FLV via mpegts.js").
- HLS playback (browsers using hls.js; controller in
  `src/data/cctvHlsSelfHeal.js`, wired in `attachHlsJs`): a fatal network error
  restarts via `loadSource(url)` (fresh playlist, live edge) up to
  `HLS_MAX_NETWORK_ERROR_RECOVERIES`; a fatal media error uses
  `recoverMediaError()` up to `HLS_MAX_MEDIA_ERROR_RECOVERIES`. When a budget is
  spent the player is destroyed and rebuilt after an exponential delay
  (`HLS_REATTACH_BASE_DELAY_MS` 2 s doubling to `HLS_REATTACH_MAX_DELAY_MS` 30 s,
  `HLS_REATTACH_OFFLINE_MAX_DELAY_MS` 120 s for an `offline` source); a rebuild
  waits while the camera is not the active one. A buffered fragment resets all
  budgets. A watchdog (every `HLS_STALL_CHECK_MS`) restarts a feed whose playhead
  has not moved for `HLS_STALL_RESTART_MS` while the tab is visible and the video
  is playing.
- Empty playlists: `/api/cctv/media/:id` only writes `ok` after the manifest body
  starts with `#EXTM3U` (`isValidHlsPlaylist`). A 200 with an empty or non-playlist
  body is `degraded` ("Source sent an empty playlist") and answered 502. Measured
  2026-10-08: every `jmlive.jasamarga.com` camera (236) returns an empty 200 or a
  502, whatever headers are sent.
- No-data timeout: a feed in `connecting`/`recovering` with no fragment buffered for
  `HLS_CONNECT_TIMEOUT_MS` (20 s, paused while the tab is hidden or the camera is
  inactive) is rebuilt and reported with `reason: 'no-data'` (plane `NO DATA FROM
  SOURCE · RETRYING (#n)`, badge `⚠ NO DATA FROM SOURCE · RETRYING`). Natively played
  HLS gets the same through `src/data/cctvNativeHlsWatch.js` (reload on timeout or
  `error`, same backoff; reset on `playing`).
- Playback state (`runtime.playback`, exposed as `playbackState` in the public
  camera state): `connecting`, `live`, `recovering`, `retrying`, `unavailable`.
  `ok` health only means the playlist is reachable, so the monitor-plane
  placeholder (`videoPlaceholderHealth` in `src/data/cctvPlaybackStatus.js`)
  shows `WAITING FOR VIDEO` / `STREAM INTERRUPTED · RECOVERING` /
  `STREAM STALLED · RETRYING (#n)` instead of the health message, `offline`
  keeps its own wording, and while `retrying` the plane shows the placeholder
  rather than the frozen last frame. The panel badge shows `STREAM · CONNECTING`,
  `STREAM · RECOVERING` or `⚠ STREAM STALLED · RETRYING`
  (`[data-frame-state='stalled']`) between the offline and generic labels.
- **Revocation** (either is sufficient): set
  `CCTV_INDONESIA_UNOFFICIAL_ENABLED=0`, or delete
  `config/cctv_sources.indonesia_unofficial.json` (or the file pointed to by
  `CCTV_INDONESIA_UNOFFICIAL_FILE`).
- **Upstream is capacity-constrained, not just latent**: direct timing
  measurements against the Jakarta source found segment download times
  ranging 1–14s against a ~7.5s segment duration — sometimes exceeding the
  segment's own playback window, both through our proxy and fetched
  directly. `attachHlsJs()` (`src/data/cctvProjectionRuntime.js`) accounts for this:
  the player keeps hls.js's default live-sync distance (3 segments; options in
  `src/data/cctvHlsConfig.js`, no override), because a larger fixed count
  puts 2 s-segment hosts (Denpasar, Mataram) 10 s behind a 14 s window and
  the segment being fetched 404s once it rolls off — rationale in
  `docs/DECISIONS.md` ("CCTV HLS live-sync distance"). While the projection loop runs,
  `src/data/cctvHlsVisibility.js` restarts the active camera's hls.js feed
  (`loadSource()` on the attached instance) when the tab becomes visible after being
  hidden at least `HLS_RELOAD_AFTER_HIDDEN_MS` (10 s); shorter hides and inactive
  cameras are untouched ("CCTV HLS: reload on tab return" in `docs/DECISIONS.md`).
  The `Hls.Events.ERROR` handler runs a bounded recovery loop
  (`hls.startLoad()` for `NETWORK_ERROR`, `hls.recoverMediaError()` for
  `MEDIA_ERROR`, retry counters reset on the next successful
  `FRAG_BUFFERED`) instead of destroying the player on the first fatal
  error — these unofficial feeds fatal-error far more often than a normal
  CDN-backed HLS source.
- **2D panel live-video mirror**: the CCTV panel's preview pane has a
  `<video id="cctv-frame-video">` element (`index.html`) alongside the
  existing still-image `<img id="cctv-frame">`. For video/HLS cameras
  (`activeCamera.isVideo`, from `getPublicCameraState()`), it's fed a
  `MediaStream` from `cctvLayer.getProjectionMirrorStream(cameraId)`
  (`src/data/cctv.js`) — a `canvas.captureStream(12)` of the *same*
  offscreen projection canvas already being painted with decoded frames for
  the 3D monitor plane, not a second hls.js/MSE connection. This is the
  same `MediaStream` the 3D plane's own proxy video consumes (one stream,
  two `<video>` consumers — spec-safe); `getActiveProjectionMirrorStream()`
  only lazily creates its own if the proxy video's eager creation didn't
  already. This is deliberate: a second concurrent player per camera would
  double the load against sources that already can't reliably serve one. Wiring lives in
  `_syncCctvVideoMirror()`/`_clearCctvVideoMirror()`
  (`src/cctvPanelMixin.js`); `_clearCctvFrame()` (the still-image cleanup)
  no longer touches the mirror element, since both run every render pass
  and the mirror must survive a render where the `<img>` path is
  simultaneously idle. Image-feed cameras are unaffected — the mirror is a
  no-op for them and the `<video>` element stays hidden
  (`opacity: 0`, `#cctv-frame-video` in `style.css`).
- **The 3D monitor plane's material is bound to the projection canvas (or a
  proxy video of it), never to the raw `HTMLVideoElement`.** For image feeds,
  the plane's material is bound to the projection canvas (`runtime.canvas`,
  the fixed-size offscreen double-buffer surface) and `refreshProjectionTextures()`
  swaps that double-buffer at `PROJECTION_TEXTURE_SWAP_MS` (1000 ms / 1Hz).
  For video feeds, `createProjectionProxyVideo()` creates a hidden, muted
  `<video>` fed by `canvas.captureStream(12)` and binds the plane's material
  to it ONCE, at runtime creation (`proxyVideo`/`mirrorStream` on the
  runtime) — Cesium's native `HTMLVideoElement` texture path does an
  in-place `copyFrom` on every render tick instead of the destroy+recreate a
  canvas-reference swap requires, eliminating the flash/flicker that
  swap caused even at a throttled rate. `drawProjectionFrame()`'s video-mode
  branch still draws the current video frame onto `runtime.canvas` via
  `ctx.drawImage(video, ...)` (auto-scales any decoded size) exactly as
  before — the proxy video's own source is that fixed-size canvas, so it can
  never observe a mid-stream decoded-size change or MediaSource reset, the
  two failure modes that ruled out binding the plane directly to the
  upstream video element. If `canvas.captureStream` is unsupported,
  `proxyVideo` stays null and video mode falls back to the same
  double-buffer swap as image mode, just throttled to
  `PROJECTION_VIDEO_SWAP_MS` (~83 ms / ~12fps) instead of 1Hz. See
  `docs/DECISIONS.md` for the full root-cause history (direct video binding
  → double-buffer swap → proxy video).
- **Video-mode monitor plane deduplicates against the video's own decoded-frame
  counter, not just readyState.** `drawProjectionFrame()`'s video branch skips
  the redraw/rebind entirely when `video.getVideoPlaybackQuality().totalVideoFrames`
  hasn't advanced since the last tick — mirroring the image path's
  `projectionFrameSignature()` pixel-hash dedup, sized for video's faster
  cadence (a per-tick pixel hash would be too costly at 12fps). Root cause of
  the flicker this fixes: every `canvasStamp` bump forces
  `refreshProjectionTextures()` to swap the double buffer and reassign
  `planeMaterial.image`, and every such reassignment is a documented flash
  opportunity while Cesium rebinds the texture (same finding the paragraph
  above cites) — the video branch used to bump unconditionally on every RAF
  tick whenever `readyState>=2`, including during an HLS stall/buffer when
  nothing new had actually decoded, so a stalled feed flashed every frame.

### CCTV camera picker — custom ARIA listbox

The first time CCTV is turned ON with no camera selected, it lands on the
live Denpasar camera (`pickDefaultCameraId`, `src/data/cctvDefaultCamera.js`,
city `DEFAULT_CCTV_CITY_ID = 'denpasar'`): the live (`feedConfigured`) Denpasar
camera, else a Denpasar seed, else the first catalog record. The default is
only a pending placeholder (`S._defaultCameraPending`) until the enable flow
activates it and flies there; any real selection, deselect, or re-init clears
it, and an already-active camera is never overridden.

The Scenes panel's scene-recipe picker (`src/scenes/scenePicker.js`) uses the
same custom listbox pattern (button trigger + body-portaled `position: fixed`
`<ul role="listbox">`, dark blurred popup, cyan scrollbar, keyboard support
shared with `handleCctvListboxKeydown`) instead of a native `<select>`. It is
disabled while a scene runs. The popup's width is a minimum (the button's
width) and grows to fit the longest scene name, capped at the viewport edge,
so labels are not clipped. Its height is capped (~5 rows, `POPUP_MAX_HEIGHT_PX`)
so it stops above the shot list, and longer lists scroll inside the popup.
Because the popup is `position: fixed`, any scroll outside it (panel, page)
closes it rather than leaving it floating.

Scrolling panels share the CCTV panel's cyan themed scrollbar (8px, cyan
gradient thumb) instead of the OS-native white bar: the Scenes panel, its shot
list, the Context and Contacts panels, and the left/right panel stacks. The
selector group lives next to `.cctv-panel-inner` in `style.css`; add new
scrolling panels to it.

Brand logo: `public/logo.svg` is the static cyan (`#00d4ff`) eagle (source art
`Logo_EagleEye.svg`), used by the title bar, the loading screen and the favicon.
`.brand-logo` uses a 288:513 aspect ratio. `logoGaze.js` still runs but finds no
`#globe`/`#globe_cage` parts in the eagle, so it is a no-op.

The CCTV panel's camera picker is a custom-built `role="listbox"`
control (not a native `<select>`) so the open popup is ordinary page
HTML/CSS instead of OS-native chrome, rendering identically on every
platform — a native `<select>`'s open `<option>` popup is rendered by the
OS/browser and ignores the panel's custom CSS (see `docs/DECISIONS.md` for
the cross-platform rendering issue this replaced). Markup is
`.cctv-camera-picker` > `#cctv-camera-trigger` (`<button>`) +
`#cctv-camera-listbox` (`<ul role="listbox">`) in `index.html`. Pure
render/sync/keyboard logic (`cctvCameraOptionLabel`,
`shouldRebuildCctvCameraListbox`, `renderCctvCameraListboxOptions`,
`syncCctvCameraListboxState`, `handleCctvListboxKeydown`) lives in
`src/cctvCameraListbox.js`, mirroring `src/mapStackChips.js`'s
render-only-on-set-change / sync-every-tick split; camera ordering itself
stays owned by `orderCctvCameraOptions()` in `src/cctvPanelMixin.js`
(unmoved). Open/close/keyboard wiring lives in `cctvPanelMixin.js`
(`_initCctvCameraListbox`, mirroring `radioPanelMixin.js`'s disclosure
pattern: one `AbortController`, click-outside via `pointerdown`,
Escape-to-close via a capturing `keydown` listener that returns focus to
the trigger). The popup uses `position: fixed` (not `absolute`), positioned
from `getBoundingClientRect()` in `_positionCctvListbox()` — required
because `.cctv-panel-inner` gets `overflow-y: auto` when the panel is
docked in `#right-context-rail`, which would clip an
absolutely-positioned popup. `ui.js`'s two global hotkey guards
(`_globalKeydownHandler`, `_poiKeydownHandler`) gained
`|| this._isCctvListboxOpen()` alongside their existing
`select, input, textarea` check, so arrow-key navigation inside the open
popup can't also fire style/POI hotkeys. Type-ahead-to-letter is not
implemented (the list is unofficial-first ordered, not alphabetical, so it
would be low value) — a known gap, not a silent omission.

**Portal (fixed 2026-09, follow-up):** `#cctv-camera-listbox` is reparented
onto `document.body` in `_initCctvCameraListbox()` (`_cctvCameraListbox`
stays cached from its original `index.html` location; only the live DOM
node moves). `.cctv-panel-inner` has `backdrop-filter`, and per the CSS
Filter Effects spec any element with `backdrop-filter`/`filter`/`transform`
becomes the *containing block* for its `position: fixed` descendants — so
left where `index.html` places it, the popup's viewport-relative
`getBoundingClientRect()` coordinates resolved against the panel's box
instead of the screen, rendering as a large mispositioned dark rectangle
(field-reported same week as the initial ship). The portal is undone in
`StyleManager.dispose()` (`this._cctvCameraListbox?.remove()`) so a
re-instantiated instance can't find a stray node already on `document.body`.
See `docs/DECISIONS.md` for the incident this fixed.

**Width (fixed 2026-09, follow-up):** `_positionCctvListbox()` sizes the
popup to `.cctv-panel-inner`'s content width (panel width minus its own
padding), not the trigger button's own width. The trigger sits between
PREV/NEXT and is only ~1/3 of the panel's width, so a trigger-width popup
truncated every camera label to a couple of characters (field-reported).
The popup now lines up with the panel's other full-width rows. See
`docs/DECISIONS.md` for the incident this fixed.

### Not Currently in Runtime

- Weather radar (removed before OSS v1 after QA; no reliable visible payoff)
- General replay/timeline systems outside the Space Missions experience
- LiDAR explorer and paired-point CCTV calibration experiments

## Auth + Launch

- Recommended launcher: `./scripts/dev-fresh.sh` (also: `dev-secure.sh` for stricter bindings, `dev-cctv.sh` for CCTV source-pack tuning)
- A successful Pinokio install writes the owner-only `pinokio/.installed`
  marker. The nested launcher menu resolves that marker from its own directory:
  an absent marker exposes Install, a present marker exposes Start, and a
  running server with a captured ready URL exposes Open EagleEye View.
- Build gate: `npm run build`
- Network access: local-only by default (`HOST=localhost` in dev-fresh.sh); LAN is an explicit opt-in via `HOST=0.0.0.0` (launcher prints a key-exposure warning + LAN URL; see SECURITY.md)
- OpenSky default mode: OAuth (`OPENSKY_AUTH_MODE=oauth`; `anon` works without credentials)
- Google key expected in Keychain service `google-maps-api` (or `GOOGLE_MAPS_API_KEY`, or `.env`)
- OpenSky credentials expected in Keychain service `opensky-network` (or env, or `.env`); `OPENSKY_AUTH_MODE` and `OPENSKY_CREDENTIALS_FILE` read from `.env` too
- Optional-key precedence in `dev-fresh.sh` is uniform — explicit shell env, then `.env`, then Keychain: `OPENAI_API_KEY` (Keychain `openai-api`/`api-key` — voice + HUD summary), `AISSTREAM_API_KEY` (`aisstream-api`/`api-key` — live vessels), `CESIUM_ION_TOKEN` (`cesium-ion`/`token` — Bing stacks), `TOMTOM_API_KEY` (`tomtom-api`/`api-key` — live traffic flow), `FIRMS_MAP_KEY` (`firms-map`/`map-key` — live fires), `LL2_API_TOKEN` (`.env` only)
- An empty string is not "unset" on either side of the launcher, and both sides are handled. `scripts/read-dotenv-value.mjs` hides the requested key from `process.env` for the duration of the read (Vite's `loadEnv` otherwise lets an inherited empty export win over the parsed files) and restores it after. A key the launcher resolves to nothing is then removed from the dev server's environment outright (`env -u`), not merely omitted — the child inherits this shell's environment, and Vite backfills `.env` only over undefined variables, so an empty export in either place would shadow a configured key. `CCTV_CALTRANS_DISTRICTS` is the deliberate exception: empty is its documented Caltrans kill switch and is passed through as-is
- `.env` supported via `.env.example` template

### Proxy/Security Baseline

- CCTV proxy rejects client-specified upstream URLs (server-side source allowlist only).
- CCTV upstream still-image fetches use an explicit abort controller with an
  eight-second timeout; the timer is cleared on every success or failure path.
- OpenSky response cache stores successful upstream responses only; OAuth token refresh calls are coalesced.
- A cold OpenSky failure uses the current camera subpoint only to request a cached adsb.lol point fallback capped at 250 nm. A fresh OpenSky response or last-good cache wins; a nominally successful worldwide snapshot more than two minutes old prefers viewport-scoped adsb.lol when available, otherwise the stale source is reported honestly. The fallback is visibly source-labeled and is never presented as a worldwide snapshot.
- GBFS response size is capped; CCTV health map is bounded.
- Proxy error payloads are sanitized (no internal error details returned to clients).
- `OPENAI_API_KEY` is server-side only; the browser receives ephemeral Realtime client secrets from `/api/realtime/token`.
- `AISSTREAM_API_KEY` is server-side only; the browser reads the same-origin `/api/ais-live` cache.
- `/api/google/nearby-places` keeps the Google key out of Places requests issued for voice scene context.
- `/api/google/text-search` keeps the Google key server-side for view-biased Places recovery used by annotation resolution.
- `/api/overpass` is bounded by body/response caps, per-client/global rate limits, concurrency limits, mirror fallback, in-flight dedupe, cache bounds, and static validation that every selector is spatially bounded.
- `/api/military-installations` uses an independent limiter with the same 90-per-client/300-global one-minute bounds, so viewport installation refreshes never consume `/api/overpass` annotation/traffic capacity.
- `/api/mymaps/<dataset>` serves only datasets named in `src/data/myMapsSources.mjs`; the request never reaches the upstream URL (map ids are fixed server-side), KML bodies are capped at 2 MiB, and the result is cached 6 h with a single-flight refresh and a stale copy on upstream failure.
- `/api/route` proxies bounded OSRM route requests for annotation routes, with profile allowlisting, distance caps, response caps, caching, and sanitized "no route found" errors.
- Track endpoints: `/api/ais-live/track?mmsi=` (server-accumulated ring buffers; sub-route handled before the rows snapshot), `/api/opensky-track?icao24=` (OAuth, 60s cache, sanitized errors, independent OpenSky credit bucket), `/api/adsblol/trace?hex=` (60s cache, 5MB cap, ODbL attribution required in UI).
- Realtime debug logs redact API keys, bearer tokens, client secrets, and image data URLs before writing to disk; request bodies are size-capped.

## UI/UX Runtime Defaults

- Z ladder: panels promote within 100–139 (renormalized on wrap), voice pill 150, toast 200, clean-view exit 300.
- Panel POSITION keys are versioned `v8` (`gev:panel-pos:v8:<id>`); collapsed-state keys remain `v6`. The one-time position reset clears stale DISPLAY placements that could overlap the Context rail.
- Map Source lives in the bottom Visual Presets tray. The left accordion contains no MAP STACK panel, and the `k` panel token that addressed it is gone from the share registry, so legacy `ui=k...` state takes the ordinary unknown-token skip.
- A dock popover (Visual Presets, Location) auto-dismisses on mouse-away unless pinned. Focus inside the tray defers that dismissal only when the browser reports `:focus-visible` — keyboard focus and typed-into fields hold the tray open; a mouse-clicked tile does not, because Chromium focuses a `<button>` on press.
- GEV MIC control is a glass capsule (var(--glass-bg), blur(24px) saturate(1.4), 999px radius; panel radius in error state).
- The desktop right rail (`#right-context-rail`) owns `DISPLAY`, `CCTV`, its active parameter controls, and `GLOBAL CONTEXT` as one fixed responsive stack in that order. Its compact buttons use the same 176 px width as the left accordion and one consistent 50 px height, share the left stack's 52 px edge inset and measured top baseline across HUD variants, then constrain themselves against visible HUD/chrome rectangles and the remaining vertical corridor. `DISPLAY` is no longer draggable and legacy saved coordinates are ignored.
- The right rail is labeled **DISPLAY** (formerly "MOVE") and groups, in order, HUD, DETECT, Bloom, Sharpen, 3D, Clean-UI (HUD + DETECT promoted to the top). Its expanded controls retain the same compact 176 px width as the right-side tabs instead of growing to the wider Context detail-card width. It starts expanded on first run and respects the user's later `v6` collapse choice. Collapses/expands with directional chevrons (`◀` collapsed, `▶` expanded).
- Display and Context use matching 330 px expanded widths and matching compact tab dimensions. The parameter panel is part of Display's expanded content. DISPLAY may remain open beside one contextual panel; CCTV and Context are mutually exclusive. In Tactical HUD, expanding CCTV or Context hides the other contextual launcher while DISPLAY remains independently available. The most recently opened right-rail panel owns the constrained lane even when it appears later in DOM order; passive restoration and automatic disclosure do not replace that explicit owner. Minimal and other HUD layouts retain the collapsed launchers; when their active panel exceeds the measured corridor, the rail reserves sibling heights and gaps and scrolls the active panel internally.
- `STYLE PRESETS` and `LOCATIONS` start collapsed, expand on intentional hover/click, and auto-collapse after hover leave delay.
- Collapsed mini-status indicators show active style and active location/landmark.
- Detection mode is user-controlled and persists when switching styles. It also STARTS on — Dense @ 75% for every style on a first run, Normal included — as a `GLOBAL_POST_DEFAULTS` baseline that does NOT set `_detectionUserOverridden`. Exception: selecting a military style (CRT/NVG/FLIR) auto-enables the same Dense preset, but only until the user manually changes detection this session (`_detectionUserOverridden` gate), after which style switches never touch it.
- Detection runs in the bottom lane of the shared host's single world-overlay `postRender`
  listener (not `preRender`) to eliminate bounding-box drift at close zoom.
- **Detection takes NO continuous-render hold** (`src/data/detectionRenderDemand.js`, summarized under Render Governor above).
  It repaints on CHANGE and asks the governor for exactly one more frame while work that spans
  frames is still outstanding. Gated by
  `scripts/qa-perf.mjs` §1b, which also counts the PAINTER's own frames so a painter that had been
  disabled outright could not score a perfect idle. The invariants:
  - **Every kind of outstanding work must terminate.** A predicate that can stay true forever is
    the hold under another name. Three qualify: the enable fade-in, label fades, and a solve the
    frame could not run.
  - **Label fades count in BOTH directions.** A newly selected label is `selected`; counting only
    the fade-out tail left it invisible on a parked scene until an unrelated frame arrived.
  - **Paint and demand share ONE monotonic timestamp** — the host frame's `frame.timestamp`
    (`performance.now()`, sampled once per frame). Re-sampling dropped the terminal frame of a fade
    (paint at 219 ms drew alpha 0.99545; a policy re-reading at 220 ms said "done"), and a wall
    clock that jumps backwards keeps demand alive until it catches up. Nothing in the draw pass may
    use `Date.now()`.
  - **A skipped paint DEFERS, never cancels.** The relief valve's skip and its follow-up request
    come from one decision (`detectionPaintSkipDecision`), so it cannot drop the only frame that
    was requested.
  - **A changed detectable set dirties the solve.** Detection PULLS candidates per paint but
    re-solves on a private 125 ms throttle, so a layer tick that swapped contact A for B could be
    spent on a paint that declined to re-solve. `markDetectionSourcesChanged()` is called from the
    manager's layer tick and visibility change, next to the render request each already makes —
    discrete events seconds apart, never per frame — and it deliberately does not request a frame
    itself, because the caller already did.
  - **AIR brackets stay prompt because the AIRCRAFT LAYERS hold the loop, not detection.**
    Brackets — including the alpha-floored ones — are painted inside
    `_drawOverlay` from live positions and take no part in the sources-changed notification, so the
    obvious worry is a floored bracket sitting stale on a parked scene. It cannot: an AIR bracket
    exists only while an aircraft layer is enabled, and `flights.enable()` /
    `militaryFlights.enable()` each take a continuous-render hold for their own per-frame fleet
    animation. For exactly as long as there is anything to bracket, the scene renders every frame.
    Measured on a parked camera: `holds: ["flights"]`, `requestRenderMode: false`, and an
    outside-aircraft population change moved the painted bracket count with no camera input. This
    is a COUPLING, so `detectionRenderDemand.test.mjs` pins it — a later perf pass that strips those
    holds the way it stripped detection's would take bracket promptness with it, silently.
  - Known, pre-existing, and deliberately out of scope here: the overlay's backing store does not
    re-derive on a DPR change mid-session (`worldOverlay` sizing — untouched by this work).
- The detection MODE BANNER (`DENSE VIS:… SRC:… DENS:…% ELASTIC …ms`) is
  developer telemetry and is HIDDEN by default. It paints only under
  `?detectDebug=1` (the `trafficDebug` convention), resolved once per
  `initDetection`. The same numbers are always available from
  `getDetectionDiagnostics()`. On a zero-object frame the "armed, nothing in
  view" signal is carried by the scanlines and sparse focus ring, not the banner.
- The HUD summary's `NEAR <landmark>` callout is capped at 150 km (metro scale).
  Beyond that it falls through to the `SECTOR <lat> <lon>` readout. The POI
  catalogue covers eight cities, so a looser bound made the HUD announce
  landmarks on other continents.
- Panoptic mode shows labels on ALL items (no stride skipping). Tracked/selected items keep bounding box but suppress label (skipLabel flag). Tracked items get enlarged bounding boxes (56×44 vs default 22×14).
- The 3D aircraft toggle reveals `Proximity` and `All` modes and drives both commercial and military aircraft layers. It ships ON in `Proximity`, so the button paints lit and the mode row paints open from markup; the panel is therefore ~36 px taller than before, which Cockpit's Display/Radio strip absorbs through its existing primary-only corridor solver.
- The host-painted tracked-target readout sits above the post-FX layer and follows tracked aircraft/satellites or selected mapped installations using each layer's display-position contract.
- Cockpit entry is gated to the operational Contacts context bundle. The
  Context chooser must be in Contacts mode, Live Flights and Military Flights must both
  be enabled, and a civilian or military aircraft must be tracked. The visible
  Cockpit actions and the `C` shortcut use the same gate, so ordinary standalone
  flight-layer selection cannot enter a context-dependent cockpit.
- **Aircraft cockpit view:** selecting a commercial or military aircraft reveals a `COCKPIT` action (`C`). Cockpit mode temporarily releases Cesium's orbit-follow transform and drives a first-person camera from the tracked aircraft's existing smoothed display position and course. Its concave helmet-visor HUD shows callsign, UTC time, coordinates, curved roll/pitch guides, and a seven-division heading tape. Ambient commercial and military AIR contacts use a Cockpit near/far band selected by the shared Display 3D mode: Proximity admits at 150 km and retains to 185 km; All admits at 400 km and retains to 450 km. The shared 3D toggle now applies in Cockpit: Off keeps in-range contacts as rotating 2D aircraft silhouettes, while On lets a ready admitted glTF take over without a drawing gap. The Cockpit model cap remains 60 and can only lower the map budget; in-range contacts that are capped or still loading remain 2D silhouettes instead of degrading to out-of-range dots. Contacts outside the selected band use small rotation-free cyan-white pips for civilian aircraft and amber pips for military. The pilot's own airframe is not drawn in first person, and exiting clears the Cockpit band and restores normal map silhouettes/models. The normal left accordion remains available for Layers and Scenes and keeps the same 26vh HUD-aligned anchor used in map mode, independent of whether the bottom-left Contact card is expanded or collapsed; the right-rail CCTV and Context chooser are hidden to avoid duplicating or overlapping the cockpit presentation. When the intelligence HUD is enabled, its classification, scene summary, collection/orbit metadata, coordinates, and imaging-status text remain visible as reduced peripheral cockpit telemetry; the optical center and flight instruments stay clear, and turning the HUD off still hides it. Ground speed, exact heading, and rendered altitude form one compact lower-center instrument cluster, keeping the horizon and peripheral view open. A second live altitude tape hugs the inside-right visor rim: its rail and nine moving ticks are derived from the same responsive keyhole radius, remain 20 px inside the circular edge even on wide displays, fade deeply at both vertical ends, and move continuously behind a fixed current-altitude pointer; its interval tightens automatically near the surface and it is suppressed on narrow screens. Cockpit mode also has a weather-backed transparent volumetric-cloud pass derived from the supplied FBM/domain-warped R&D shader. It renders at no more than 520×320, uses 24 ray steps/three FBM octaves at 12 FPS, is clipped to the visor, fails clear when Open-Meteo is unavailable, and stops its animation completely on cockpit exit. It does not restore the prior CPU weather canvases, precipitation, scene fog, or any map-mode effect. When Contacts is active for the tracked aircraft, the compact `CONTACT` rail adds the 250 km subject window, four cohort counts, nearest observed/mapped example with relative bearing and distance, freshness, explicit uncertainty, and Previous and Next controls plus its own collapse control. The mirrored right rail is a three-page **cockpit briefing carousel**: source-backed live signals, location-matched regional headlines, and local place/current-weather context from OpenStreetMap Nominatim and Open-Meteo. It is manual-first: Previous, Next, and direct page controls are always available, and the visible `CYCLE OFF` / `CYCLE ON` control starts or stops the nine-second page cycle. The cycle pauses on hover or keyboard focus and stops while collapsed, hidden, or outside cockpit mode; live signal data continues refreshing either way. Empty news matches and unavailable news use compact text states rather than reserving an empty media frame; partial local data remains explicit. Article links open their original publisher, and no headline is treated as verified risk intelligence. On desktop both cockpit rails use the same width and share a bottom-aligned safe baseline in opposite corners above the peripheral MGRS/GSD/time telemetry, leaving both that text and the lower-center instrument cluster readable. They collapse independently to slim tabs without stopping live data updates. Narrow screens use separated top/bottom fallbacks. Empty-space globe clicks are inert while cockpit owns the camera; `C`, `Escape`, or `EXIT COCKPIT` explicitly exits and restores the same tracked entity and standard follow camera. Unknown feeds remain unknown, selection loss still exits safely without inventing a replacement track, and the cockpit never presents the summary as threat scoring or an all-clear. This is a desktop first-person presentation, not a WebXR session.
- **Cockpit left-panel clearance:** the Cockpit Contact card and peripheral HUD participate in the adaptive left accordion's live obstacle measurements, including live viewport-height changes. Expanding Layers or Scenes keeps the active panel in the available upper-left corridor with internal scrolling; it does not cover the Contact card, lower Cockpit controls, or Cesium credit line. Outside Cockpit the hidden card does not alter the normal corridor.
- **Cockpit Context scope:** the 250 km radius applies to the air/sea proximity cohorts. Installation counts come only from the currently loaded viewport and are labeled `CURRENT VIEWPORT ONLY` in the cockpit as well as the normal Context panel; neither surface presents them as a complete 250 km installation survey.
- **Cockpit camera anchor:** first-person mode does not write feed-boundary corrections directly into the camera. A cockpit-only inertial anchor advances from the selected aircraft's displayed course and speed, then converges toward the authoritative delayed track with correction capped below forward motion. The displayed kinematics are derived from the same consecutive fix segment as the rendered position, with raw feed speed/course used only as fallback; a transient zero/missing feed speed therefore cannot freeze a visibly moving aircraft after layer enable or a map/cockpit handoff. Rendered altitude continues to come from that interpolated track position. Late ADS-B fixes and short render stalls can remove drift without accelerating or reversing the view. Camera placement runs before scene update/culling at a bounded 20 Hz so a moving cockpit does not force Photoreal 3D Tiles to retraverse on every display frame; textual instruments update at 10 Hz and context/layout work at 4 Hz. Every far Cockpit contact pip shares one stable Cesium texture-atlas entry and skips unused screen-projected course calculations, while only in-range 2D aircraft silhouettes pay the screen-projected rotation cost; ambient glTF collections are hidden/retained rather than synchronously destroyed at cockpit entry, and context rails lay out only on explicit content/state changes and viewport resize. The deliberate 15/30-second layer interpolation delays and per-Cesium-frame position caches remain unchanged.
- **Cockpit route, vision, and view controls:** visible on-screen `COCKPIT`, `RESET`, and `EXIT COCKPIT` controls replace reliance on the `C` shortcut. RESET uses the same canonical globe route as the map and voice actions, exits Cockpit, and releases its camera ownership rather than exposing the hidden map-style top action. When the tracked commercial flight has a plausible ADSBDB route, the top of the right briefing rail shows a compact `FROM → TO` airport strip and the visor shows a centered estimated-destination chevron with its relative bearing; absent or implausible route data hides the strip and cue rather than guessing. The cockpit-local vision control is an interactive `PREV / CURRENT / NEXT` carousel over the inherited map preset, `CRT`, `NVG`, `FLIR`, and `NOIR`; its previous/next actions wrap, and activating the current value advances to the next style. The inherited entry is named directly, such as `NOIR`, and retains that map shader. There is no empty `NONE` entry. CRT, NVG, FLIR, and NOIR temporarily activate the existing Cesium post-process stages, while returning to the inherited entry or exiting Cockpit restores the pre-entry visual style. The regional-news page uses a free Google News RSS locality query first, with the existing GDELT query retained only as a fail-soft fallback; linked headlines remain reporting, not verified incidents or risk intelligence.
- **Cockpit weather status:** the earlier multi-canvas atmospheric compositor remains fail-closed and is not attached to the live viewer. Cockpit clouds are a separate transparent WebGL pass with a capped 520×320 framebuffer, 24 ray steps, three FBM octaves, and a 12 FPS ceiling. It defaults off and starts only when local storage explicitly contains the persisted `WX ON` opt-in (`'1'`). When opted in, observations refresh after five minutes or 25 km of aircraft movement, fail transparent when unavailable or clear, and stop on exit or disable. `WX OFF` governs atmospheric rendering only: the briefing still fetches source-backed Nominatim, headline, and Open-Meteo local-information data, aborting and replacing any in-flight request when the selected aircraft changes. No weather effect runs in map mode and no synthetic fallback is shown.
- **Cockpit trail visibility:** entering cockpit hides the selected aircraft's trail body and head so they cannot cross the first-person view; exit restores them. This cockpit-only presentation change does not alter the normal map-mode invariant that aircraft trails render through terrain using their depth-fail material.
- **Aircraft course slew:** civilian and military 3D models retain the 60°/s course limiter, but each rendered frame can consume at most 250 ms of accumulated slew time. A long tile/render stall therefore catches up over multiple visible frames instead of turning one delayed frame into a heading snap.
- **Manual-first cockpit briefing:** the right-side Live Signals / Regional News / Local Info carousel does not advance automatically on page load. Previous, Next, and direct page controls remain available; the visible `CYCLE OFF` / `CYCLE ON` toggle explicitly starts or stops the nine-second page cycle, which still pauses on hover/focus and while collapsed, hidden, or outside cockpit mode. Live signal data continues refreshing in either state.
- **Photoreal horizon blend:** Cesium's sky atmosphere remains enabled behind the hidden base globe, but its light intensity, saturation, and brightness are reduced from the library defaults so the distant Google Photorealistic 3D Tiles boundary blends into the sky instead of producing a bright cyan horizon seam.
   - **Cockpit direction and speed tapes:** plausible destination metadata now drives one translucent, isometric visor chevron labeled directly below with the estimated geographic bearing; the prior full geodesic dashed path is not rendered. A mirrored live ground-speed tape follows the inside-left keyhole rim using the same responsive curve, end fades, fixed pointer, and fractional tick motion as the altitude tape on the right. Speed values scroll upward as they increase while altitude values scroll downward. Its tick endpoints and current-speed pointer share the rail's inset-circle origin, so the markings stay attached to the visible curve rather than drifting inward with the text-label gutter.
- Voice control UI (`#gev-voice-control`) shows status states OFF / CONNECTING / LISTENING / EXECUTING / ERROR.

### Current Global Post Defaults

First-run defaults move together as one coherent console presentation. Every
one is a FIRST-RUN baseline only: a share link or the operator's own hand
still wins over it, and none of them sets the `_detectionUserOverridden` /
explicit-intent flags that would suppress a separate landed behaviour.
Pinned in `src/reasonableDefaults.test.mjs` (feather, intensity, detection, OUTSIDE
opacity) and `src/data/layerState.test.mjs` (3D). See `docs/DECISIONS.md`
for why these specific values were chosen.

| Control | Default | Notes |
|---|---|---|
| Bloom | `OFF`, intensity `100%` | |
| Sharpen | `ON`, intensity `49%` | |
| HUD | `ON`, layout `tactical` | |
| Detection | `DENSE` @ `75%` | ON for EVERY style on a first run, Normal included. Same frozen `MILITARY_DETECTION_PRESET { mode:'dense', densityPct:75 }` object the military styles and Contacts context mode already apply (Contacts OWNS detection while active and restores the prior state on exit — `contactsDetectionPolicy.js`; Cockpit deliberately does not touch detection at all). Style-switch semantics: CRT/NVG/FLIR still carry `detection: MILITARY_DETECTION_PRESET` and still yield to `_detectionUserOverridden`; Normal has no `STYLE_PRESET_DEFAULTS` entry, so switching TO Normal touches nothing. A share link carrying `dm=OFF` still restores OFF. |
| Detection allocation | `ELASTIC` | Begins with roughly equal capacity across active layers and redistributes unused entitlement (`labelArbiter.js:170`, `allocateLayerQuotas`). `WEIGHTED` allocates using visible demand with square-root demand scaling and semantic layer weights (`labelArbiter.js:181`) and is available as a non-default mode. |
| Detection Fade | `7%` | Label/card fading band around the keyhole. |
| Detection OUTSIDE opacity | `1%` | `KEYHOLE_OUTSIDE_OPACITY_DEFAULT` in `src/celestialRing.js`, mirrored by `#detection-opacity-slider`'s markup value AND readout, `GLOBAL_POST_DEFAULTS.detectionOutsideOpacityPct` in `ui.js`, and `_detectionOutsideOpacityPct` in `sharelink.js`. Slider `step` is `1`. `AIRCRAFT_BRACKET_FLOOR_ANCHOR` in `src/data/detectionPolicy.js` moves with it — calibrated so `AIRCRAFT_BRACKET_ALPHA_FLOOR` (0.35) lands exactly at the default. The `ko` PARSE fallback stays at `5` (see `docs/DECISIONS.md`). |
| Scope feather | `11%` | Soft scope-mask edge. `SCOPE_FEATHER_RATIO_DEFAULT` in `src/scopeMask.js`, mirrored by `#scope-feather-slider`'s markup value AND readout and `_scopeFeatherPct` in `sharelink.js`. The slider spans 0–100; an explicit `0` is the hard-crop path. The `scf` PARSE fallback stays at `35` (see `docs/DECISIONS.md`). |
| Scope intensity | `0%` | Scope-mask intensity dial starts fully transparent. `SCOPE_INTENSITY_DEFAULT` in `src/scopeMask.js`, mirrored by `#scope-intensity-slider`'s markup value AND readout and `_scopeIntensityPct` in `sharelink.js`. The slider spans 0–100. The `sci` PARSE fallback stays at `100` (see `docs/DECISIONS.md`). |
| 3D aircraft models | `ON`, mode `proximity` | See 3D Aircraft + Tracking section above and the DISPLAY-rail entry below. |
| Style shader params | CRT/NVG/FLIR pixelation `1.2` (just above the native `1.0` floor) | Thermal/FLIR ships an optional Ironbow "Predator" palette (`palette` uniform, default `0` = accurate grayscale). |

Two terms that must never be conflated: scope FEATHER softens the black
scope-mask edge; detection FADE is the label/card fading band around the
keyhole.

**A default has THREE surfaces, and a PARSE fallback that is not one of
them.** The value literals (engine constant, markup value, markup readout,
`ui.js` `GLOBAL_POST_DEFAULTS`, the share generator's starting state) must
all move together, because a fresh boot runs no restore and those literals
ARE the startup state. The `scf` / `ko` PARSE fallbacks deliberately do NOT
move with the live defaults: they answer what an OLD LINK that omits the
field meant, under that era's default — see `docs/DECISIONS.md`.

**They do NOT all persist the same way, and only one of them persists at
all:**

- **3D models** have durable storage — `gev:layer-state:v2` in local
  storage, written by `LayerStateCoordinator` on explicit intent. A session
  that stored a snapshot keeps whatever it stored, across tabs and restarts.
- **Detection mode/density and scope feather have NO storage key at all.**
  Their only durable carrier is the URL hash (`dm`/`dd`, `scf`), written on
  a 500 ms debounce. A same-URL reload therefore keeps them only if that
  debounce already fired; a bare URL or a new tab returns to these
  defaults. That is simply what these controls have always done, and is
  the reason "stored state wins" is true of the 3D toggle and not of the
  other two.

**Known edge (detection, pre-existing):** a hash-restored `dm=OFF` restores
the MODE but not `_detectionUserOverridden`, which is session-scoped. A
recipient of an OFF link who then selects a military style therefore gets
the style's auto-enable, where the original author — who had turned
detection off by hand — would not have.

## Operational Notes

- **Splash screen ("Initializing photorealistic world...") hides on real
  render readiness, not a flat timer.** `src/splashGate.js`'s
  `composeSplashReadiness()` gates hiding `#loading-screen` on
  `Promise.all([viewReadyPromise, firstFramePromise, minVisibleMs])`
  (`viewReadyPromise` = `styleManager.initialViewReadyPromise`, the shared
  camera + visual/panel restore only — never the saved-layer restore):
  `firstFramePromise` resolves on the scene's own one-shot
  `postRender` event (bounded by a 5s `FIRST_FRAME_FALLBACK_MS` fallback
  for WebGL context loss / headless environments), and
  `MIN_SPLASH_VISIBLE_MS = 250` is a pure UX floor against flashing on an
  unusually fast boot — not a readiness gate. The share-link recipient
  path's own separate, deliberate ~1500ms `_initialShareRestoreTimeout` in
  `ui.js` still runs before the shared camera flight (see below for what the
  splash waits on).
- **Bulk cross-layer restore is throttled to `RESTORE_CONCURRENCY = 4`
  concurrent layer lifecycles**, via one `p-queue` instance owned by
  `DataLayerManager` (`runThroughRestoreQueue()`). This applies at every
  bulk fan-out site: page-load layer-state restore
  (`LayerStateCoordinator._restoreSelectedState()`), Context-mode session
  restore (`restoreEnabledLayerIds()`), Context-mode exit's layer teardown
  (`ui.js`'s `_clearLayersOutsideContextMode()`), and Contacts/Global
  Context's own dependency auto-enable (`militaryAwareness.js`'s two
  internal fan-outs) — all four share the SAME global bound, so they can't
  stack past 4 concurrent lifecycles even if they race each other. A single
  explicit `toggle()`/`setEnabled()` call is never delayed by this queue,
  even while it's saturated by an in-flight bulk restore of other layers —
  only bulk fan-outs are gated, not ordinary UI interaction. See
  `src/data/manager.js`'s `RESTORE_CONCURRENCY` constant for the full
  reasoning (browser same-origin connection ceiling headroom + CCTV's
  measured cold-start cost).
- **Earthquake discs are STATIC geometry.** Every quake is a `CLAMP_TO_GROUND`
  ellipse; a `CallbackProperty` axis re-tessellates its ground primitive every
  frame, which cost 32.4 ms/frame and 30 fps on the shipped 58-event feed. The
  axes are plain numbers, redefined only when a poll brings new data, and the
  former ±15% radius pulse is gone. Because nothing in the layer animates
  per frame, it holds NO continuous-render hold — the governor stays idle with
  earthquakes on, and the manager's `layer-tick` / `layer-visibility` requests
  carry new data to the screen. Pinned in `src/data/earthquakes.test.mjs`.
- **Geocode framing has an off-centre sanity gate.** A viewport that is both
  bigger than any city (>300 km diagonal) and not centred on its own geocoded
  location (anchor >15% of the diagonal from the centroid) is replaced by a
  40 km metro box on that location. This is what stops "Tokyo" — which geocodes
  as the PREFECTURE, islands and all — from framing open Pacific. `country`
  results are EXEMPT by decision (several have the same pathology from overseas
  territories; reframing a country is a product decision, not a bug fix), and an
  explicit `viewMode: 'overview'` ask bypasses the gate entirely so "show me an
  overview of Hawaii" still frames the whole administrative area.
- **Viewport framing is antimeridian-safe.** `flyToViewportBounds` pads from the
  short-way-round longitude span and wraps the padded edges, so a dateline-
  crossing box stays its true width. Raw subtraction inflated a 0.41° metro box
  to 86.7° and a 60° territory to 132°.
- CCTV calibration persists at `gev:cctv-calibration:v2` (v2 rebuild;
  the store was wiped clean, no import from the old `v1` key).
- CCTV v3 floor QA pins are: zero samples for heading-only edits; zero transient
  samples and constant elevation during E/N drag; one shared-floor resolution on
  release; late one-shot shared-cell work is permitted during viewshed idle. The
  A+B harness intentionally excludes citywide LOD assertions.
- Draggable panel positions persist at `gev:panel-pos:v7:<panel-id>` (collapsed states at `gev:panel-collapsed:v6:<panel-id>`).
- Legacy draggable-panel position keys may remain in local storage for backward compatibility, but the map-mode right rail ignores them; collapsed states still persist at `gev:panel-collapsed:v6:<panel-id>`.
- Flight/military tracked entities cache dead-reckoned positions per frame to avoid callback desync flicker.
- Aircraft 3D-model and tracking invariants are covered by `npm run test:track`; run this before touching `flights.js`, `militaryFlights.js`, `detection.js`, or `trackedReadout.js`.
- Annotation resolver behavior is pinned by `src/annotations/annotationResolver.test.mjs`; re-run that suite before changing place-resolution scoring.
- Layer input handlers (click + keydown) are detached on disable for flights/military/satellites/AIS vessels.
- Traffic tile cache is capped and traffic layer supports explicit destroy cleanup.
- Traffic feed state is honest about simulation. `getStats().mode` is the
  CONFIGURED source ('live' = a TomTom key is present, 'sim' = keyless), NOT
  this instant's health — health rides on `error`. Keyless reads FALLBACK with
  `SIMULATED — add TomTom key for live` in both the sync chip and the panel
  meta line; an unreachable `/api/tomtom/status` reads
  `SIMULATED — traffic service unreachable`; a total flow-fetch failure in live
  mode sets `error` (DEGRADED · `SIMULATED — <reason>`) and zeroes the stale
  coverage number. `stats.loading` covers outstanding flow work as well as the
  road fetch, so a failure landing after the 250 ms paint race still ends the
  shared loading batch as LOAD FAILED. Harnesses must gate on `!stats.error`,
  never on `mode === 'live'` alone.
- Traffic runs in `sim` mode (white dots, hardcoded speeds) unless `TOMTOM_API_KEY`
  is configured (env or Keychain `tomtom-api`/`api-key`), which enables `live` mode:
  TomTom flow vector tiles via the budget-governed `/api/tomtom` proxy
  (`.gev-cache/tomtom/`, 120 s TTL, `TOMTOM_DAILY_TILE_BUDGET` default 40k/day),
  decoded client-side (`flowTiles.js`), matched onto Overpass roads
  (`flowMatch.js`), and rendered as green/amber/red dot color + speed/density
  scaling (`trafficFlowStyle.js`); closures spawn no dots; unmatched roads stay
  white. Road fetch bounds center on the camera look-at point (`trafficBounds.js`).
- **`parseRoads()`'s per-road `sampleHeight` fallback is capped, not
  unconditional (fixed 2026-09).** A dense-city detailed fetch (triggered
  whenever camera altitude drops to/below `FAST_FETCH_ALTITUDE`, 4500 m,
  including `residential`/`unclassified` roads) can return thousands of OSM
  ways. The parser's cold-cell fallback height used to call the real
  depth-buffer/tileset raycast `scene.sampleHeight()` synchronously once per
  way with no cap, unlike `meshFloorSampler.js`'s own scene queries (rationed
  to `MAX_SAMPLES_PER_CALL = 40`) — enough sustained main-thread blocking to
  trigger Chrome's "Page Unresponsive" dialog. `MAX_HEIGHT_FALLBACK_SAMPLES`
  (40, exported from `traffic.js`) now caps that raycast per `parseRoads()`
  call; roads past the cap simply keep `baseHeight=0` until Phase 2/3's
  batched, cached ground-floor resolution (`groundFloor.js`) fills in their
  real per-waypoint height, which is the common case anyway — the fallback
  raycast was already redundant for any road whose cell resolves in time.
  Pinned in `src/data/traffic.roadHeight.test.mjs`.
- Development captures opened with `?trafficDebug=1` mint an interaction anchor
  from the exact `camera.changed` event that arms each debounced load, then emit
  scheduling-correlated User Timing entries for production `response.json`, road
  parse, flow-race, dot construction, heat-line rebuild, and next-post-render
  boundaries. Every trace is paired with the exact camera-change that scheduled
  its load; mismatches are counted drops. Cesium's `moveEnd` remains a diagnostic
  mark only: it arrives about 500 ms after stillness, typically after fetch has
  begun, and fetch never waits for it. Production builds remove the flag, hooks,
  counters, and timing labels.
- Voice debug log: `tail -f .gev-logs/realtime-conversations.jsonl` (gitignored).

Replay chase-camera updates run in Cesium `preUpdate` before scene traversal, preventing 3D-tile refinement stutter when the mission replay speed is reduced. Replay Ascent first gives the selected launch site a five-second tile-preparation hold before displaying the T-minus countdown. Replay ascent duration is mission-specific: disclosed insertion, SECO, or separation timing is compressed into the replay, while sparse records use reconstructed path length with bounded fallback timing instead of a universal fixed duration. Replay transitions directly from ascent to orbit; stage re-entry/recovery remains static contextual linework and is never a camera-tracked playback phase. The screen-space rocket/thrust symbol renders at 50% of its 92 × 138 px design box, while the separate callout text remains unchanged. Successful/upcoming selected missions show a current orbit marker: green for a reliable TLE match or amber and explicitly estimated when no live match exists. Failed launches show their source status and suppress live/estimated orbit markers and fallback rings. A retained Launch Library orbit is labeled as the planned target, an absent ascent is reported as unavailable, and replay-only controls remain hidden unless the selected mission has a rendered track; authoritative supplied trajectory points remain visible when present. Mission orbit primitives realign by model matrix each tick from the same current-GMST frame as their marker, preventing ring/marker drift; their host annotation reads the position cache updated in that same tick. During depth-dominant ascent segments, the replay rocket retains its last valid path-facing rotation rather than snapping toward the camera. Mission selection and replay overlays never call photoreal `sampleHeight()` from the render loop; the launch-zone ground primitive and precomputed surface-safe replay path avoid remote tile-refinement probes that previously caused a one-second globe texture pulse. The shared host replaces the former mission-label visibility churn and quadratic overlap loop; the layer's remaining frame sweep only culls native point/billboard geometry and refreshes selected UTC copy when its displayed second changes. Replay samples uneven path vertices by cumulative distance and normalizes camera-yaw easing to frame time.

Orbit replay framing uses one combined bounding sphere for Earth and every sample of the selected orbit. The camera derives its final range from that full envelope, while its look-at target retains a radial bias toward the moving vehicle rather than collapsing onto the singular Earth-center frame. Compact-orbit launchers therefore remain tracked during camera rotation, and highly eccentric transfer orbits still keep both the globe and their distant apogee arc visible. The orbital camera stays on one side of the mission's 3D orbit plane and uses the vehicle radial as visual up, so forward motion remains screen-left through polar/local-heading wraps instead of alternating left and right. The fixed-size cyan orbit dot retains one pixel scale throughout the pullback. While replay owns the camera, the selected launch-site host label is suppressed so it cannot duplicate or overlap the replay vehicle's DOM callout; cancel/completion restores it.

Mission ascent paths use a long cubic insertion transition that matches the incoming climb direction and the sampled orbit tangent. Because a Cartesian cubic can otherwise chord through the ellipsoid for some inclined insertion geometries, every blended sample preserves the original climb's smooth minimum-altitude envelope. This removes the artificial right-angle insertion corner and corresponding rocket heading snap without allowing the ascent path to enter the globe.

Insertion is source-aware: catalog-backed missions propagate the matched satellite to the historical insertion epoch. Projected missions have no authoritative historical phase, so their orbital plane starts over the launch site and follows a plausible launch azimuth—south-southwest for western North American sites and polar missions, eastward otherwise. The projected insertion advances only by the disclosed ascent duration or a ten-minute fallback, producing one continuous downrange climb into the forward orbit tangent instead of using UTC as an arbitrary phase and correcting through a 180-degree hook.

The reconstruction does not add a full revolution around Earth: ordinary launch vehicles use a gravity turn and downrange acceleration before orbital insertion, rather than spiraling around the planet during powered ascent.

At close range, the selected launch site's 500 m highlight is a single material-backed `GroundPrimitive` classified against both terrain and photoreal 3D Tiles. It has no fixed world-space height offset, so the translucent disc and rim remain draped across the rendered launch-site surface during tile refinement. A small render-state polygon depth bias keeps coplanar ring fragments above the photoreal mesh at low oblique angles without making the geometry float or drift.

The Space Missions roster prioritizes data-rich records using available mission, orbit, payload, trajectory, timeline, and recovery fields; launch time remains the tie-breaker.

When no live catalog track is available, the mission view marks the approximate orbital ring as `PROJECTED ORBIT` in purple and renders the ascent-to-insertion transfer in green; catalog-backed satellite orbits remain cyan.

The replay vehicle is a smaller solid cyan silhouette without the former orange flame; its initial pad anchor uses photoreal terrain, globe height, or launch elevation fallback so it remains above the surface during tile loading. Replay begins at a close launch-complex range so pad detail remains visible before the camera widens into the ascent context view. Its initial camera heading is perpendicular to the ascent/orbit direction for a profile view, then eases into tangent tracking. Small screen-space reprojection changes are damped for the animated marker on both ascent and orbit, while large camera or phase changes snap to the authoritative path position.
Space Missions keeps the Satellite layer available for catalog/TLE matching but suppresses its standalone fleet points and orbit rings. While those visuals are hidden, their per-frame dense propagation, one-second core point-buffer rewrite, and one-second orbit-matrix rotation are suspended; selected mission telemetry continues to propagate independently. The selected mission's live or estimated satellite marker uses fractional wall-clock time, so it moves continuously rather than creating a once-per-second position discontinuity and one-frame photoreal globe LOD pulse.

During ascent replay, the camera, Cesium callbacks, and HTML vehicle overlay share one replay sample per rendered frame. The tracked overlay is projected directly from that shared position instead of applying a second screen-space lag filter, preventing the vehicle and globe from repeatedly advancing and snapping back.

After the initial broadside launch profile, the ascent chase camera stays in a rear-quarter view about 30 degrees off the vehicle's forward path bearing, widening smoothly toward 45 degrees as orbit context appears. Cesium's `HeadingPitchRange` already places the camera opposite the supplied heading vector, so replay does not add a second 180-degree inversion; the trajectory therefore travels away toward the horizon while remaining visibly offset from the screen centerline.

During orbit replay, the camera continues following the selected vehicle but eases its look-at target down toward the vehicle's sub-satellite globe anchor. The range expands when necessary for high-altitude missions, keeping both Earth and the tracked label visible through the full revolution. The active replay clock clamps at the final orbital sample rather than wrapping to ascent progress zero; replay completion therefore leaves the final globe/orbit framing in place and does not return to the launch site.

Reconstructed mission orbits use a small downrange launch-to-insertion arc, so their estimated ground track is not artificially drawn directly over the launch pad in top-down views. The ascent remains connected to the ring at its selected insertion point.
Collapsed right-rail controls use the same 176 px width as collapsed left-rail controls, while expanded right-side detail panels retain their independent widths. DISPLAY starts expanded only on first run and then respects persistence; DISPLAY may remain open beside CCTV or Context, while CCTV and Context remain mutually exclusive without persisting forced collapses. Selecting a dedicated Context mode opens its right-side surface and clears unrelated layers after first snapshotting their exact state. Final exit restores the original enabled set and changed parameters. Cockpit View hides the right-side CCTV control because CCTV is not part of the cockpit rail. Airborne cockpit altitude uses the tracked aircraft's reported aviation MSL altitude, never the potentially negative Cesium terrain/ellipsoid render height; confirmed grounded contacts display `0 ft` without rewriting that source field. A cold photoreal floor shows `ACQUIRING SURFACE` for at most five seconds, then uses the source target-height fallback instead of freezing the camera indefinitely.
Replay transport uses one Play/Pause toggle plus Cancel. During ascent only the active thrust ring is visible; stage-recovery handoff uses a pulsing dot.

## Tooling Snapshot

- `tools/cesium-render.mjs`: headless Cesium render capture via Puppeteer.
- `tools/streetview-panorama.mjs`: Street View tile panorama stitcher.
- `tools/streetview-headings.mjs`: heading sweep capture; supports neighbor traversal.
- `tools/pano-pinhole.mjs`: equirectangular-to-pinhole reprojection.
- `tools/sat-ortho.mjs`: Map Tiles ortho stitch and centered crop with georef corners.
- `scripts/track-regression.mjs`: headless real-app regression harness for aircraft tracking/model/detection invariants (`npm run test:track`) Its frame-sampling windows allow up to 10 s per frame (minimum 60 s) and its `__dfSettle` waits for at least 4 real render frames, because a SwiftShader frame takes 0.5–5 s on a loaded machine.
- `scripts/qa-map-source-tray.mjs`: browser proof for the four-source Map Source
  tray — presentation, keyboard disclosure, responsive bounds, unpinned
  auto-dismiss, ACQUIRING status, and retired/unknown stack-id restore
  (`QA_BASE_URL=http://localhost:4173 npm run qa:map-source-tray`). Add
  `-- --keyless` to force the no-ion-token expectations on a keyed server; both
  invocations are gates.
- `scripts/qa-l9-matrix.mjs`: the L9 release-candidate QA matrix in one command
  (`node scripts/qa-l9-matrix.mjs --url http://localhost:4173`). Orchestrates
  the `qa-*.mjs` fleet plus `track-regression` as subprocesses and adds
  repo/feed/in-browser probes; a check whose key the target lacks is SKIPPED
  with an OWNER-RUN tag rather than failed. Run with `--list` to print the
  manual checks it cannot automate.

## Maintenance Rule

State facts in this file in present tense only — every sentence should read
as "X is true," never "X changed to become true on date Y." When a value or
behavior changes, EDIT the existing prose in place rather than appending a
new dated note; this file describes the CURRENT system, not its history.

Rationale for a non-obvious decision (why a threshold, algorithm, or
behavior is what it is) belongs in `docs/DECISIONS.md`, not here — add a
short pointer ("see `docs/DECISIONS.md`") from the section of this file it
explains, rather than writing the rationale inline.

When runtime behavior or architecture changes, update this file (and
`docs/DECISIONS.md` if the change is worth explaining historically) in the
same change set as code updates.
