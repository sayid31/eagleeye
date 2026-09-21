# Changelog

This changelog records public product changes. For the authoritative description
of current runtime behavior, see [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md).

## [Unreleased]

### Fixed

- **CCTV camera picker rendered as a plain white dropdown on Windows.** The
  picker was a native `<select>`; its open `<option>` popup is rendered by
  the OS/browser and ignores author CSS — Windows Chrome rendered it opaque
  white regardless of the dark closed-state styling, while macOS Chrome's
  native popup happened to honor the styling. Replaced with a custom
  `role="listbox"` control (`src/cctvCameraListbox.js` +
  `src/cctvPanelMixin.js`) so the open popup is ordinary page HTML/CSS,
  rendering identically on every platform. Full keyboard support (arrow
  keys, Home/End, Enter/Space, Escape) and click-outside-to-close are
  unchanged in behavior from a native `<select>`; see
  `docs/CURRENT-STATE.md` for details.

### Changed

- **Closed the remaining EagleEye View rebrand gaps.** A prior rebrand pass
  renamed display-only text but deliberately left several things unchanged;
  this closes those gaps:
  - `localStorage` keys that still used the old dotted `godsEyeView.<feature>.<field>`
    convention (panel positions/collapsed state, CCTV calibration, scene
    project, voice cost tier/limits, cockpit weather toggle) are now on the
    existing colon `gev:<feature>:<version>` convention. A one-time,
    idempotent boot migration (`src/storageKeyMigration.js`, wired into
    `main.js`) carries a returning user's existing values forward under
    their new keys — nothing is lost, and the migration is safe to run more
    than once.
  - The voice assistant's spoken self-identification changed from "GEV Voice
    Control" to "EagleEye Voice Control" (`src/voice/voiceSystemPrompt.js`).
  - Remaining cosmetic old-brand text in `style.css`, `.env.example`, dev
    scripts (`dev-fresh.sh`, `dev-cctv.sh`, `dev-secure.sh`), internal Cesium
    `PostProcessStage` names, and outbound `User-Agent` strings in
    `vite.config.js` (proxy identification only — the embedded GitHub URLs
    and `Referer` header are unchanged, since the repository itself is not
    being renamed).
  - **Unchanged by design**: the `LICENSE` file's Bilawal Sidhu copyright
    notice (a legal requirement of the MIT license), the media credits in
    `docs/media/README.md`, the maintainer attribution and YouTube "God's
    Eye View" series links in `README.md`/`CONTRIBUTING.md`/`SECURITY.md`,
    `package.json`'s `name`/`author`/repository URLs (kept truthful to the
    real, unrenamed `bilawalsidhu/gods-eye-view` GitHub repository), and the
    internal `window.__godsEyeView` debug global (not user-visible).

### Performance

- **Continuous-render holds on the AIS Vessels, Street Traffic, Satellites,
  and Rocket Launches (mission-replay mode) layers are now conditional**,
  matching the pattern the render governor already used for detection and
  military awareness. Each of these previously forced the scene to repaint
  every vsync for its entire enabled lifetime, even while showing nothing
  that was actually moving on screen — the same measured cost class
  documented for the render governor itself (~60% GPU / ~54% of a CPU core
  idle-with-nothing-enabled before it existed). Now each layer holds
  continuous render only while it genuinely needs it (something visibly
  animating on screen) and releases it the rest of the time, so more layers
  can run together without the frame cost stacking up:
  - AIS Vessels holds only during an active focus/de-emphasis transition.
  - Street Traffic holds only while moving dots exist for the loaded viewport.
  - Satellites holds only while a catalog point is actually on screen.
  - Rocket Launches' mission-replay chase camera gets its own hold, scoped to
    just the replay's own duration, separate from the layer's existing
    always-on hold (unchanged) — the replay's per-frame occlusion sweep
    itself is intentionally not part of this change.
  Flights and Military Flights were audited too and intentionally left
  unconditional this round — their hold is currently load-bearing for the
  Intelligence HUD's aircraft brackets staying repainted; fixing that
  properly needs its own follow-up. See `docs/CURRENT-STATE.md` for the full
  per-layer breakdown.

### Added

- **Claude (Anthropic) voice backend — a temporary, opt-in alternative to
  OpenAI Realtime**, for users without an OpenAI voice budget. Since
  Anthropic has no speech-to-speech API, it's paired with the browser's own
  Web Speech API (`SpeechRecognition`/`SpeechSynthesis`) — turn-based
  (push-to-talk) rather than always-listening, and $0 per-turn cost for
  audio since STT/TTS never touch Claude. A `[GPT|CLAUDE]` pill appears next
  to the existing STD/MINI tier toggle in the voice tray, but only once an
  `ANTHROPIC_API_KEY` is configured (via **POWER UP**, `.env`, or Keychain)
  *and* the browser actually supports Web Speech (Firefox lacks it by
  default, so the pill simply doesn't appear there). Both backends share one
  mic button, one cost readout, and the exact same 28 GEV tool
  implementations (`src/voice/gevActions.js`) — Claude calls the same
  action runner OpenAI Realtime does, so nothing the app can do depends on
  which backend is talking. A bounded multi-turn tool loop
  (`src/voice/claudeToolLoop.js`) handles Anthropic's tool-use shape, which
  — unlike this app's single-shot treatment of OpenAI function calls — can
  ask for more tool calls after the first batch resolves. This is
  explicitly a stopgap: switch back to OpenAI Realtime once voice budget
  allows. See `docs/CURRENT-STATE.md`'s new "Voice Backend #2" section for
  the full design and known limitations (Space push-to-talk still only
  targets OpenAI; no automated end-to-end voice-loop test — see
  `TESTING.md`).
- Real, live HLS video for 5 Indonesian CCTV cameras (Jakarta, Bandung ×3,
  Denpasar) — an **UNOFFICIAL, internal-demo-only** source pack layered on
  top of the existing fictional seed cameras. Stream URLs were
  reverse-engineered via manual browser network inspection of public city
  CCTV portals (Jakarta Smart City, Bandung Dishub ATCS, Denpasar ATCS);
  there is no formal data-sharing agreement with any of these city
  governments, and this is not vetted for public/commercial deployment. A
  new server-side manifest-rewrite proxy (`src/server/hlsManifestProxy.mjs`
  + a `/api/cctv/media/:id/rel` sub-route in `vite.config.js`) resolves the
  multi-level relative-path HLS manifests these sources use, keeping the
  real upstream host server-side only; client playback goes through hls.js
  for browsers without native HLS support
  (`createProjectionRuntime`/`destroyProjectionRuntime` in
  `src/data/cctv.js`). The CCTV panel badge reads "⚠ UNOFFICIAL SOURCE" for
  every camera in this pack (`src/cctvPanelMixin.js`). Revoke at any time by
  setting `CCTV_INDONESIA_UNOFFICIAL_ENABLED=0` or deleting
  `config/cctv_sources.indonesia_unofficial.json` — see `DATA_SOURCES.md`
  for the full disclosure. The camera dropdown sorts these unofficial
  sources to the top (with a ⚠ prefix on the label) instead of leaving them
  buried among the ~500 live open-data cameras
  (`orderCctvCameraOptions` in `src/cctvPanelMixin.js`).
- Automatic fallback when Google Photorealistic 3D has no photo coverage at
  the current view. Google's photo-textured tiles only cover ~2,500 cities
  worldwide; elsewhere the map used to show a flat, near-white viewport with
  no indication anything was wrong (reported: interior Kalimantan,
  Indonesia). The app now detects this after the camera settles and
  silently switches to Esri Satellite imagery, with a toast explaining why.
  Flying back to a covered city and re-selecting Google 3D re-arms the
  detector.

### Fixed

- Indonesia unofficial HLS cameras' 3D monitor plane no longer goes solid
  BLACK instead of live video (a separate bug from the Viewshed-occlusion
  fix below, which only addressed the plane being COVERED by a colored
  block — this one is the plane's own texture never updating at all). Root
  cause, confirmed via a live browser diagnostic session: Cesium's
  `ImageMaterialProperty` rebuilds its GPU texture only when the bound
  `HTMLVideoElement`'s *identity* changes, not when the video's decoded
  `videoWidth`/`videoHeight` changes mid-stream. These unofficial,
  reverse-engineered feeds do not guarantee a constant decoded frame size
  across HLS segments (observed non-16:9 sizes on the Bandung sources, e.g.
  704×576 then 640×480) — once a segment decodes at a different size than
  the one the texture was originally built at, every subsequent
  `copyFrom` texture upload silently fails
  (`GL_INVALID_OPERATION: glCopySubTextureCHROMIUM: the destination level of
  the destination texture must be defined`), freezing the plane on its last
  successfully-uploaded frame or leaving it black if that never happened.
  The 2D panel's canvas mirror was unaffected (`drawImage` auto-scales any
  source size to the fixed canvas), which is why the 2D preview stayed live
  while the 3D plane went dark. Fix: `drawProjectionFrame()`
  (`src/data/cctv.js`) now calls `rebuildVideoPlaneMaterial()` every
  projection tick, which tracks the decoded size the plane's current
  material was built at and, on a change, hands the plane a fresh
  `ImageMaterialProperty` instance bound to the same video element — forcing
  Cesium to treat it as a new bind and rebuild the texture at the new size.
- Indonesia unofficial HLS cameras' 3D monitor plane no longer renders as a
  solid hue-colored block (e.g. red for Bandung "Buahbatu") instead of live
  video when Viewshed coverage mode is on. Root cause: Viewshed mode's
  translucent per-camera fill volume (`createFrustumVolumePrimitive`) is
  welded to the exact same far-cap corners as the monitor plane, and renders
  with `cull: { enabled: false }` (both faces visible) — for the active
  camera, that fill sat directly over the plane's live video texture and,
  viewed from most angles, read as fully opaque. Fix: `refreshCoverageStyles()`
  (`src/data/cctv.js`) now skips building a fill volume for the active
  camera specifically while its monitor plane is showing; the hue-tinted
  wireframe (which doesn't occlude anything) still renders, so Viewshed
  mode's per-camera coverage-color identity is preserved for every other
  camera and restored for this one the moment its plane is hidden again.
- Indonesia unofficial HLS cameras' status badge no longer reads DEGRADED
  while their live stream is actually healthy. Root cause: the server-side
  health record (`vite.config.js`) is a single map keyed by camera id, shared
  between `/api/cctv/media/:id` (the real video stream) and
  `/api/cctv/frame/:id` (a still-image thumbnail endpoint). Video/HLS
  cameras have no still-image candidate — their `url` is an HLS manifest,
  not a JPEG — so `/frame/:id` always fell through to a Street
  View/synthetic fallback, which unconditionally set `status: 'degraded'`.
  The CCTV panel's preview `<img>` polled `activeCamera.frameUrl` (built
  unconditionally for every camera) on every ~10s UI refresh, so the
  fallback kept re-firing and stomping the healthy `status: 'ok'` that
  `/media/:id` had just set. Fix: `getPublicCameraState()`
  (`src/data/cctv.js`) now omits `frameUrl` for video-type cameras
  (`mp4`/`hls`/`webm`) entirely — their live view is the `mediaUrl`-driven
  monitor plane instead, so the panel never polls the doomed endpoint for
  them. `fetchCardFrame()` gained the same guard as a defensive backstop for
  the protected active-camera ambient-card lane, which bypasses the normal
  video-camera filter in `selectCctvLod()`.
- CCTV camera catalog no longer drops every seed camera (Jakarta and the
  other 15 Indonesian seeds, plus the original 8 cities' 18 seeds) the
  moment any live source pack (Austin Open Data, Caltrans, TfL London)
  successfully loads. `cctvLayer.init()` previously picked EITHER the
  live-source catalog OR the seed catalog outright
  (`catalogFromSources.length ? catalogFromSources : seedCatalog()`); in a
  normally-networked deployment live sources are non-empty by default, so
  seeds silently never rendered — defeating the fictional-seed fallback's
  whole purpose. `mergeSeedAndSourceCatalogs()` (`src/data/cctv.js`) now
  unions both catalogs by camera id (live source wins on an id collision),
  so seed-only cities keep their coverage alongside successfully-loaded live
  cameras instead of being replaced by them.
- Indonesia unofficial HLS cameras (Jakarta especially) no longer freeze on
  a single stale frame after a few seconds of playback, and the CCTV panel's
  2D preview no longer goes solid black for these cameras. Root cause,
  confirmed by direct upstream timing measurements: the unofficial Jakarta
  source (`dki-jkt.balitower.co.id`) is itself capacity-constrained —
  measured segment download times ranged 1–14s against ~7.5s segment
  duration, both through our proxy and fetched directly from the upstream,
  so hls.js was starving for segments and freezing on the last decoded
  frame; on a fatal error it then destroyed the player outright instead of
  attempting recovery. The 2D panel went black separately as a side effect
  of the DEGRADED-badge fix above: video/HLS cameras have no `frameUrl` to
  poll, but the panel had no `<video>` element to show their live decoded
  frames either. Fix: `attachHlsJs()` (`src/data/cctv.js`) now runs a
  bounded network/media-error recovery loop (`hls.startLoad()` /
  `hls.recoverMediaError()`, reset on the next successful `FRAG_BUFFERED`)
  before falling back to a full `hls.destroy()`, and raises
  `liveSyncDurationCount` from hls.js's default of 3 to 5 segments of
  buffer headroom against the upstream's own inconsistent segment timing.
  The 2D panel gained a `<video>` element (`index.html`) that mirrors the
  3D monitor plane's already-decoded frames via
  `canvas.captureStream()` (`getProjectionMirrorStream()` in
  `src/data/cctv.js`, wired through `_syncCctvVideoMirror()` in
  `src/cctvPanelMixin.js`) rather than opening a second hls.js connection
  to the same rate-limited unofficial upstream.
- HUD summary's "NEAR &lt;landmark&gt;" locality tag no longer matches
  landmarks up to 150km away. `NEAR_POI_MAX_KM` (`src/hudLocality.js`)
  tightened 150km → 50km after a report of the HUD reading "NEAR PURA ULUN
  DANU BERATAN (DENPASAR) 102KM" while parked over Kawah Ijen, East Java — a
  real POI, but a 102km reading doesn't read as "near" anything. The wider
  Indonesian POI catalog spreads city landmarks farther apart than the
  original 8 cities (Denpasar's own POIs span up to ~50km), so the old bound
  started matching across regions instead of within one. 50km was chosen as
  the smallest bound that still keeps every one of the 16 catalogued cities'
  own in-view POI matches intact (worst case 39.1km, Dubai).
- Added fictional/synthetic seed CCTV cameras (`CAMERA_SEEDS` in
  `src/data/cctv.js`) for the 8 Indonesian cities (Jakarta, Surabaya, Bandung,
  Medan, Semarang, Yogyakarta, Makassar, Denpasar) — 2 per city, anchored to
  existing `CITY_POIS` landmarks, same pattern as the original 8 cities'
  seeds. No live open-data CCTV source exists for these cities yet (only
  Austin Open Data, Caltrans, and TfL London are wired), so without seeds
  their camera catalog was empty while the original 8 cities always showed
  coverage.

### Refactored

- Split `src/ui.js`'s `StyleManager` class (10,340 lines) by moving its
  Adaptive Panel Layout, CCTV panel, and Radio panel method groups into
  three new prototype-mixin files — `src/panelAdaptiveLayoutMixin.js`,
  `src/cctvPanelMixin.js`, `src/radioPanelMixin.js` — composed back in via
  `Object.assign(StyleManager.prototype, ...)`. No runtime behavior change;
  `ui.js` drops to 7,754 lines. Shared panel-position constants moved to a
  new `src/panelPositionConstants.js`. Global Context panel intentionally
  not split this round (no dedicated QA gate; deferred).

### Changed

- Location search (search box, voice fly-to, voice Radio location) now
  defaults to OpenStreetMap Nominatim and no longer requires a Google Maps
  API key. This is a temporary, reversible switch — set
  `GEOCODE_PROVIDER=google` (with `GOOGLE_MAPS_API_KEY` configured) to use
  Google Geocoding instead. New provider-abstraction module
  `src/geocodeProvider.js` (`forwardGeocode()`) normalizes both providers to
  the same result shape so downstream navigation-mode/viewport-framing logic
  in `src/locations.js` is unaffected either way. Requests to Nominatim are
  proxied server-side (`/api/nominatim/search` in `vite.config.js`, new
  `GEV_RATELIMIT_NOMINATIM_PER_MIN` opt-in throttle) to satisfy its required
  `User-Agent` header and request-spacing policy. Out of scope, unchanged:
  click-to-annotate geocoding, HUD/scene-context reverse geocoding, and
  Google Places-based view recovery all remain Google-only as before. The
  8 preset Indonesian/US/etc. cities (`CITY_POIS`) are static data and
  unaffected.
- Renamed the app's display name from "God's Eye View" to "EagleEye View"
  (title, README, docs, UI copy, code comments, Pinokio launcher, voice-tool
  descriptions sent to the Realtime API). Display-only: `godsEyeView.*`
  localStorage keys, `package.json` identity fields, `gevActions.js`/
  `gevRealtime.js` filenames, the GitHub repo URL, and references to Bilawal
  Sidhu's "God's Eye View" YouTube series are unchanged.
- Changed the app's default initial camera view from Austin, TX to Jakarta,
  Indonesia. Added a `jakarta` entry to `CAMERA_PRESETS` in `src/camera.js`;
  the `austin`/`sf`/`nyc` presets remain available. Cosmetic only — no layer
  or data-source logic changed.
- Added Jakarta to the Location dropdown menu (`CITY_POIS` in
  `src/locations.js`), with 5 landmark POIs (Monas, Istiqlal Mosque, Wisma 46,
  Selamat Datang Monument, Fatahillah Museum). This is a separate registry
  from `CAMERA_PRESETS` above — it drives the Location pills, voice
  `fly_to_location`, and CCTV seed placement. Also added `'jakarta'` to the
  `locationId` enum of the `fly_to_location`, `select_nearest_aircraft`, and
  `control_radio` voice tools in `vite.config.js` so voice commands can select
  it too.
- Documented 8 Indonesian metro cities (Jakarta, Surabaya, Bandung, Medan,
  Semarang, Yogyakarta, Makassar, Denpasar) in a new
  `MONITORED_CITIES_NO_FEED` list in `src/data/bikeshare.js`, matching the
  CCTV registry's Indonesia coverage. Verified (2026-09-09) that no
  Indonesian bikeshare operator currently publishes a GBFS feed — Jakarta's
  prior system ceased operating in late 2022 — so these cities are not added
  to the live `RAW_GBFS_CITY_REGISTRY` (which requires a real, working feed
  URL pair); this only stops them being silently absent from the codebase
  and gives a single place to wire a real feed in once one exists.
- Added the remaining 7 Indonesian metro cities (Surabaya, Bandung, Medan,
  Semarang, Yogyakarta, Makassar, Denpasar) to the Location dropdown menu
  (`CITY_POIS` in `src/locations.js`), completing the 8-city set started
  with Jakarta — 5 landmark POIs each (Denpasar has 6), coordinates verified
  via web search (2026-09-09). Three landmarks are geographic outliers from
  their city center — Candi Prambanan (~17 km from Yogyakarta) and Pura Ulun
  Danu Beratan (~50 km from Denpasar, in Bedugul) — included at the user's
  explicit request as well-known city-associated landmarks; one uses a
  coarser city-center approximation (Puputan Badung Square, Denpasar — no
  dedicated geocode found). Also added all 7 city ids to the `locationId`
  enum of the `fly_to_location`, `select_nearest_aircraft`, and
  `control_radio` voice tools in `vite.config.js`.

### Added

- Added a new Intensity slider (`#scope-intensity-slider`, 0–100%) for the
  Scope mask (the radial dark-corner vignette effect), separate from the
  existing on/off toggle and Feather slider. At 0% the mask disappears
  completely — a fully unobstructed view — while at 100% it looks exactly as
  it always has. This is a plain multiplier on the mask's painted outside
  opacity (`resolvePaintedAlpha()` in `src/scopeMask.js`), independent of the
  mask's existing 94–100% terminus/override band (`SCOPE_TERMINUS_MIN_PCT`/
  `MAX_PCT`), which is unchanged and still cannot be fully transparent by
  design. Persisted to share links via a new `sci` hash parameter
  (`src/sharelink.js`) and to saved scenes via `getVisualState()`/
  `applyVisualState()` (`src/ui.js`).

### Fixed

- Traffic dots (Street Traffic layer) no longer drift off the road into
  nearby buildings. `parseRoads()`/`parseRoadsTimed()` in
  `src/data/traffic.js` previously sampled terrain/building height once, at
  each road's first vertex, and applied that single height to every waypoint
  on the road — so on any road crossing varying terrain or building height,
  later waypoints rendered at the wrong elevation. Each waypoint's height is
  now read from its own cell in the shared ground-floor cache
  (`src/data/groundFloor.js` + `src/data/meshFloorSampler.js`), the same
  batch-warm-then-read infrastructure `flights.js` already relies on. A
  waypoint whose cell hasn't resolved yet falls back to the road's original
  first-vertex height, so behavior degrades gracefully rather than dropping
  to sea level.
- Intelligence HUD text (classification banner, mission ID, mode label,
  locality readout, coordinates, sensor metrics) is now legible over any
  basemap color instead of blending into bright satellite imagery. The HUD's
  text color was a low-opacity tint with only a soft glow for contrast, which
  read as transparent against sunlit rooftops. `#intel-hud *` in `style.css`
  now outlines every HUD glyph with a solid dark 4-direction shadow, and each
  shader mode's text color (`HUD_COLORS` in `src/hud.js`) is raised to near-
  full opacity — contrast now comes from the outline, not the hue, so it
  holds in NORMAL, NVG, FLIR, and CRT modes alike.

## [0.1.1] — 2026-09-01 — Installation and live-data fixes

### Changed

- Tightened the README opening around keyless setup, source freshness, modeled
  experiences, and the accessibility of the provider stack.

### Fixed

- Pinokio now recognizes its nested successful-install marker, so a completed
  one-click install exposes Start instead of returning to Install.
- The keyless `dev-fresh.sh` startup summary now names Esri World Imagery with
  keyless terrain and identifies OpenStreetMap as the fallback.
- All three VIIRS sources now reach the Active Fires layer. Merging a source's
  detections used argument spread, which exceeds the engine's argument limit on
  the two largest sources and dropped them entirely — leaving roughly a third of
  global detections while reporting each dropped source twice, once as
  successful with its real count and once as failed.
- `./scripts/dev-fresh.sh` no longer crashes on stock macOS bash 3.2 when no
  provider keys are exported: expanding the empty external-keys provenance
  array under `set -u` was fatal there. Launches with exported keys are
  unchanged.

### Security

- GBFS proxy body-size cap now measures the response in bytes
  (`Buffer.byteLength`) instead of JavaScript string length, so the
  `GBFS_MAX_BODY_BYTES` limit holds for multi-byte payloads and cannot be
  overrun by non-ASCII upstream responses.

## [0.1.0] — 2026-08-31 — One-click install, keyless boot, Provider Settings

### Added
- **One-click install** via Pinokio. Keyless boot lands on a live Esri World
  Imagery satellite globe with keyless terrain; OSM takes over automatically if
  Esri is unreachable, and the globe continues without terrain if its source is
  unavailable.
- **Provider Settings** (the POWER UP panel): add, replace, or remove API keys
  inside the app. Credential files are made owner-only before any secret is
  written — verified on macOS and Windows — and keys configured outside the
  panel are shown read-only, never rewritten.
- **Keyless capability responses**: the optional HUD summary and place-search
  endpoints return a deliberate "not configured" success instead of errors, and
  never consume rate-limit quota.
- `.gitattributes` normalizes line endings, so Windows clones pass the full
  test suite out of the box (#81 — thanks @ethanstoner).

### Changed
- README rewritten keyless-first around the provider ladder: zero keys → free
  Cesium ion (eligible personal, non-commercial use) → billing-enabled Google
  Maps.
- Browser-built data modules no longer import `node:fs`; a repo-wide boundary
  scan test keeps it that way (#83 — thanks @ethanstoner).
- Aircraft-identity voice answers explicitly cover operator, type, and route,
  and say so plainly when enrichment is unavailable instead of guessing.

### Security
- Provider Settings answers only local, unproxied requests and disables itself
  entirely whenever the server is shared. Public datacenter and dam datasets
  omit contact-oriented fields (see the dataset READMEs).

## Pre-release development history

The dated entries and internal milestone numbers below predate the first
tagged GitHub Release. They are retained as project history and do not
represent previously published GitHub Releases.

## [Unreleased] — 2026-08-24

### Added

- Added honest aircraft identity narration: callsign, operator, registration,
  type, and route come only from selected-contact context, and missing operator,
  route, or type enrichment is named explicitly.
- Added local, publication-compatible copies of the two README PNGs, with source
  records and third-party-license boundaries in `docs/media/README.md`.
- Added regression coverage for aircraft identity narration and optional-key
  loading feedback.

### Changed

- First-run presentation now opens with Detection `DENSE` at 75%, `ELASTIC`
  allocation, Fade 7%, Outside 1%, scope feather 11%, and aircraft 3D models in
  `PROXIMITY`. Stored state and share links still override these baselines.
- The 17 selected README GIFs remain unchanged and are documented separately
  from the two owner-published PNGs.
- Bundled datacenter and dam snapshots now omit contact-oriented fields and
  note values containing email or phone identifiers. Feature geometry, names,
  operator/capacity/river metadata, counts, and ODbL terms are unchanged.
- Public documentation and the L9 release matrix no longer reference non-public
  planning material or repository history.

### Fixed

- A missing optional FIRMS key no longer turns the complete Environmental
  mission into `LOAD FAILED`. The FIRMS row still reports `KEY REQUIRED`, while
  earthquakes continue to load. Real lifecycle and fetch failures retain
  failure priority.
- The mapped-installations layer retries after an unavailable request when it is
  enabled or the camera settles.
- Aircraft trails attach to the rendered aircraft transform and remain near the
  rear center across headings. Parked aircraft do not draw a moving head
  segment.
- Grounded aircraft keep validated floor evidence through temporary terrain
  outages and wait for measured photoreal-surface evidence before a 3D model
  takes over from its billboard.
- Cockpit altitude uses aviation MSL data rather than Cesium render height.

### Security

- Production transitive dependencies resolve to patched DOMPurify and
  protobufjs releases without changing the Cesium version or application APIs.
- Production dependency audit reports no known advisories; remaining audit
  findings are confined to development and QA tooling.

## [Unreleased] — 2026-08-23

### Added

- Added a first-run mission launcher for Contacts, Space Missions,
  Environmental, and manual exploration.
- Added terrain-validity gating and bounded last-known placement for grounded
  aircraft models.

### Changed

- Environmental consistently presents both earthquakes and NASA FIRMS fires,
  with honest optional-key degradation.
- The tracked aircraft trail acceptance bar is visual: roughly rear-center,
  stable across headings, with minor hull overlap allowed and no conspicuous
  top, bottom, or lateral projection.

## [Unreleased] — 2026-08-18 to 2026-08-22

### Added

- Added the four-source Map Source tray, share-link v2 state, cockpit/context
  voice parity, MSL altitude readouts, and close-range tracked aircraft models.
- Added the L9 release-candidate matrix, AIS feed watchdog, voice cost controls,
  satellite classes, and the shared world-overlay host.
- Added deterministic first-run, map-source, floor, overlay, tracking, and
  aircraft-model regression harnesses.

### Changed

- Consolidated world labels, cards, tracked readouts, CCTV thumbnails, cable
  labels, mission labels, and detection presentation under shared allocation and
  lifecycle rules.
- Reduced idle rendering through the render governor and explicit scope mask.
- Improved cockpit layout, context restoration, keyless feed honesty, and
  aircraft 2D/3D handoffs.

### Fixed

- Fixed degenerate depth picks, map-source restore states, route-camera motion,
  bright-ground label readability, grounded display flooring, and cross-layer
  tracking cleanup.
- Fixed stale overlay callbacks, parked-idle render leaks, cable-label sweep
  starvation, and several share-link state conflicts.

## [Unreleased] — 2026-08-02 to 2026-08-16

### Added

- Added Global Context modes, Cockpit briefing surfaces, Radio context,
  satellite mission replay, and real per-class aircraft models with adjacent
  provenance records.
- Added a shared screen-space overlay system with bounded allocation for labels,
  cards, callouts, detection brackets, and selected-object presentation.

### Changed

- Unified right-side product controls and responsive cockpit/map layouts.
- Migrated public-safe neighborhood geometry to DataSF and tightened safe local
  development defaults.
- Improved proxy resilience, annotation outline bounds, CCTV enable pacing,
  contact de-emphasis, and deterministic visual stacking.

## [Unreleased] — July 2026

### Added

- Added live NASA FIRMS fires, optional live TomTom traffic, Caltrans and TfL
  CCTV packs, CCTV viewsheds and direct-manipulation calibration, citywide CCTV
  cards, Natural Earth regions, analyst queries, and voice routing QA.
- Added the end-to-end vertical-datum system for aircraft, vessels, CCTV,
  annotations, trails, and terrain-aware rendering.
- Added aircraft class silhouettes, path-derived display heading, ADSBDB
  enrichment, cached CelesTrak TLE lookup, and next-ISS-pass prediction.

### Fixed

- Fixed elevated-airport aircraft placement, vessel sea-surface placement,
  close-zoom FIRMS anchors, antimeridian region framing, annotation resolution,
  cross-layer tracking ownership, and CCTV projection lifecycle issues.

## [Unreleased] — June 2026

### Added

- Added OpenAI Realtime voice control, scene-aware entity context, viewport image
  grounding, the AI HUD summary, live AIS vessels, infrastructure layers, map
  source switching, free-text navigation, and server-side data proxies.
- Added hybrid map annotations, 3D aircraft, panoptic detection, tracking
  harnesses, and public data attribution.
- Added MIT source licensing, security guidance, contribution guidance, data
  source notices, and third-party asset boundaries.

### Changed

- Removed the experimental AI video-edit style and retained seven deterministic
  visual styles.
- Moved Realtime text-history trimming to the server-side retention policy while
  keeping only the latest viewport image in conversation context.

## [0.7.0] — 2026-02-18

- Added the Bikeshare Pulse layer and panoptic label improvements.
- Improved tracked-item boxes, post-render alignment, and CCTV projection
  quality.
- Removed the experimental shift-drag CCTV calibration interaction.

## [0.6.0] — 2026-02-10

- Added the initial multi-layer 3D globe experience, visual styles, live
  aircraft, satellites, earthquakes, CCTV, traffic, FIRMS, infrastructure, and
  performance controls.
- Added entity inspection, tracking, scenes, keyboard controls, and shareable
  views.

## [0.1.0] — 2026-02-09

- Initial project version.
