# Changelog

This changelog records public product changes. For the authoritative description
of current runtime behavior, see [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md).

## [Unreleased]

### Changed

- The console has a new look: a calm dark theme with one blue accent, no glowing text
  and no "TOP SECRET" banner. It has a top bar (search, source-health summary, UTC clock),
  a left icon rail and a bottom status bar with coordinates, MGRS and altitude.
  Imagery attribution stays visible in the status bar.
- The layer panel groups layers into Pergerakan, Lingkungan and Kota. Each layer shows an
  honest status: Live, Terganggu, Mati, Memuat, or Data statis for bundled datasets.
- The CCTV panel opens with a camera inspector: badges (including "Sumber tidak resmi" and
  "Lokasi perkiraan"), operator, direction, format, "Pusatkan di peta", "Kalibrasi posisi" and
  a list of the nearest cameras. The earlier controls are under "Kontrol lanjutan".
  While a camera's video shows, its 3D frustum stays hidden unless you are calibrating.

### Fixed

- A data layer whose code failed to download (for example CCTV, after a network
  change while the page was open) can now be turned on again without reloading the
  page. Before, one failed download stayed cached and every later toggle failed the same way.
- The empty green placeholder cards (for example "Malioboro North" beside live
  Yogyakarta cameras) no longer appear in cities that have live cameras. The 10
  synthetic seed cameras for Jakarta, Bandung, Denpasar, Surabaya and Yogyakarta
  were removed (Semarang's 2 followed once it gained live cameras); Medan and
  Makassar keep theirs because they have no live source yet. `cctvLive.md` lists every live camera by city.

### Added

- 36 more Bina Marga toll cameras (UNOFFICIAL SOURCE, demo only, `APPROX. LOCATION`) on six corridors that were skipped before: Terbanggi Besar-Kayu Agung 10, Cimanggis-Cibitung 14, Ngawi-Kertosono 4, Kertosono-Mojokerto 3, Manado-Bitung 3 and Semarang-Solo 2. Positions use the same piecewise KM calibration against OSM interchange refs (about 1 km residual). All 36 passed three playlist polls and the app proxy. The pack now holds 2584 cameras across 35 toll corridors; gates and ramps without a KM, Terpeka KM 326 and the corridors without a usable OSM chain stay out. Per-site detail in `cctvLive.md`.
- 57 more Bina Marga toll cameras (UNOFFICIAL SOURCE, demo only, `APPROX. LOCATION`) and 108 repaired toll URLs. The portal rotated the stream UUIDs of
  `jmlive.jasamarga.com`, so old toll rows no longer played; 108 of them now point at the current stream (matched by ruas, KM and A/B suffix, positions unchanged).
  New cameras: Pejagan-Pemalang 22, Ciawi-Sukabumi 6, Palimanan-Kanci 4 and Pemalang-Batang 3 (four new corridors), plus Pekanbaru-Dumai +11, Medan-Tebing Tinggi +8,
  MBZ, JORR South and Semarang-Batang +1 each. The four new corridors are positioned by a piecewise KM calibration against OSM interchange refs (matching the Wikipedia interchange KMs) rather than an assumed origin; residual error is about 1 km. All 165 changed or new rows passed three playlist polls and the app proxy. After that batch the pack held 2548 cameras across
  29 toll corridors. 149 older toll rows have no live replacement and are still listed. Banyuwangi stays excluded: its host answers with a Cloudflare challenge
  that is not bypassed. Per-site detail in `cctvLive.md`; the URL list in `urlcctv.md` and `urlcctv.csv`.
- New layer "Tsunami Shelters & Sirens (Sumbar)" (`local-sumbar-tsunami`): 58 shelter buildings and 86 tsunami sirens in West Sumatra, read live from two shared Google
  My Maps documents (UNOFFICIAL SOURCE, demo only). Each point's card shows the siren condition (AKTIF / TIDAK AKTIF / Tidak Berfungsi, where the map states it) or the shelter
  capacity and function. The data is fetched through an allowlisted proxy (`/api/mymaps/sumbar-tsunami`) and not bundled. The layer is on the voice layer list ("tsunami sirens",
  "tsunami shelters"). Not yet checked in a browser.

- 119 more live ATCS CCTV cameras from a full re-check of every camera that had been marked "not re-checked" (UNOFFICIAL SOURCE, demo only). A camera is
  added only when three playlist polls show an advancing media sequence and it then plays through the app proxy. Added: Surakarta 58 FLV (76 to 134), Banten 23,
  Semarang 13, Banyumas 5, Pekanbaru 3, Yogyakarta 2 and Magelang 1, plus a new Cipali toll corridor (`bmtol-unofficial-cipali-*`, 15 cameras, `APPROX. LOCATION`).
  The pack now holds 2491 cameras. Not added: cameras that are only recordings (ENDLIST), still answer 404, use the VP6 FLV codec, or (Surabaya, 4 cameras) sit on a
  plain-http host without coordinates. Per-site detail in `cctvLive.md`; the URL list in `urlcctv.md` and `urlcctv.csv`.

- 420 more live ATCS CCTV cameras from a sweep of all regencies and cities (UNOFFICIAL SOURCE, demo only, plain HLS, no login or cookie): Nganjuk 289,
  Banjarbaru 47, Jambi 19, Garut 15, Ciamis 14, Karo 12, Lebak 10 and Pemalang 12, plus 2 new Balangan cameras. Nganjuk, Banjarbaru, Jambi, Garut, Karo and Lebak
  carry source-published coordinates; Ciamis and Pemalang have none, so their markers are `APPROX. LOCATION` (Pemalang also 3 `CITY-LEVEL ONLY`). Karo is served over
  plain http. The CCTV catalog cap rises from 3000 to 4000 (`DEFAULT_CCTV_MAX_SOURCES`) so the 2372-camera pack fits (it now holds 2491). Not added: Wonosobo, Brebes, Kudus,
  Samarinda, Sukoharjo (per-viewer tokens, login or challenge pages). Per-site detail in `cctvLive.md`; the URL list is in `urlcctv.md` and `urlcctv.csv`.

- 189 live ATCS CCTV cameras (UNOFFICIAL SOURCE, demo only), all plain HTTPS HLS with no login or cookie.
  168 carry their source-published coordinates: Banda Aceh 47, Balangan 36, Banjarmasin 33,
  Kotawaringin Barat 22, Tanah Bumbu 11, Situbondo 19 (on-demand streams that can drop out). 21 more have no
  published coordinates, so their markers are labelled `APPROX. LOCATION` (Kediri 15, placed from the place
  named in each stream path; Pati 4, placed from the cctvnusantara.com listing) or `CITY-LEVEL ONLY` (Kediri 2).
  Only cameras that served live video in repeated probes and through the app's proxy are included. Not added:
  Kutai Timur, Jatim Pelayaran, Pontianak, Kaltim (streams need a challenge, YouTube support or credentials). Per-site detail in `cctvLive.md`; the full
  URL list is in `urlcctv.md`.

- 20 live Kota Serang ATCS CCTV cameras (UNOFFICIAL SOURCE, demo only, `serang-atcs-*`, source-published
  coordinates, plain HLS from `stream.serangkota.go.id`). The site's server omits its TLS intermediate, so the
  dev proxy now also trusts the public GlobalSign GCC R6 AlphaSSL CA 2025 intermediate (`config/ca/`, valid to
  2027-05-21); certificate verification stays on. 3 of the 23 listed cameras are down at the source.

- 71 more live ATCS CCTV cameras (UNOFFICIAL SOURCE, demo only) from two sites whose streams are not plain static
  HLS, all with source-published coordinates: Gresik 55 (`gresik-atcs-*`) and Jombang 16 (`jombang-atcs-*`).
  Gresik runs a camera only while someone watches, so the dev proxy now opens an anonymous viewer session per
  camera (start, 20 s heartbeat, stop after 60 s idle) and the CCTV panel plays it as normal HLS. Jombang serves
  ZoneMinder MJPEG behind a 2-hour token printed on its public page; the proxy reads that token at run time,
  keeps it in memory only, and serves one JPEG per poll, so the panel shows these as a refreshing image.
  Dead monitors that return a "Unable to stream" picture are rejected. 19 Gresik cameras and 9 Jombang monitors
  are left out because they are down at the source. Catalog rows gain optional `onDemand` / `pageToken` fields
  (same-origin only, never sent to the browser).

- 260 live Java and Banten ATCS CCTV cameras (UNOFFICIAL SOURCE, demo only), all plain
  HLS with no login or cookie: Magelang 74, Semarang 47, Cianjur 44, Tangerang
  Kabupaten 28, Banjar 20, Tasikmalaya 18, Banyumas 15, Banten province 14 (Lebak,
  Bapenda, KP3B). The sources publish each camera's coordinates, so rows carry
  `SOURCE-PUBLISHED LOCATION` (heading unknown). Only cameras that served a valid video
  segment in the final probe and again through the app's own proxy are included; many
  more are listed on those sites but answer 404 or time out. The old city-level Cianjur
  camera is replaced by its located twin. Kota Serang is added in
  the entry above. Not added: Ciamis and Kudus (no published
  coordinates), Medan, Kabupaten Bogor, Jawa Tengah Dishub and Grobogan (a login or
  client secret is needed, or no stream list is public). Per-site detail in `cctvLive.md`.

### Changed

- The CCTV catalog cap rises from 2000 to 3000 cameras (`DEFAULT_CCTV_MAX_SOURCES`);
  the merged catalog is now about 2330, and the extra health-map memory is small.

- 45 live Kabupaten Bandung Barat CCTV cameras (UNOFFICIAL SOURCE, demo only) from
  the Dishub KBB ATCS page, all plain HLS with no login or cookie. The source
  publishes each camera's coordinates, so they carry the `SOURCE-PUBLISHED LOCATION`
  label (heading unknown). 13 of its 58 cameras are left out because their streams
  answer 404. The two Padalarang Flyover cameras (Cimareme, KBP) flip between 404
  and live; they are included because they served in every probe just before
  they were added, and they may drop out again.
- 106 live West Sumatra city CCTV cameras (UNOFFICIAL SOURCE, demo only) from the
  Sumbar disaster dashboard's list of city portals: Bukittinggi 39, Padang 28,
  Solok 18, Padang Panjang 14, Pesisir Selatan 7. All plain HLS, no login or
  cookie. Only cameras that served a video segment in a probe are included.
  Bukittinggi, Padang Panjang and Pesisir Selatan publish the coordinates of each
  site, so those rows are labelled `SOURCE-PUBLISHED LOCATION` (the source's own
  position, not surveyed; heading unknown); Padang and Solok publish none
  (`APPROX. LOCATION` / `CITY-LEVEL ONLY`). Padang's Low-Latency HLS plays through
  the existing proxy. Padang Panjang's server sends an incomplete TLS chain, so
  the missing public Sectigo intermediate was added to `config/ca/`. Padang
  Pariaman (PLN session URLs, all 502) and Payakumbuh (YouTube only) are not
  included.
- 29 live Pekanbaru city CCTV cameras (UNOFFICIAL SOURCE, demo only) from the
  public city page `cctv.pekanbaru.go.id/cam` (plain HLS, no cookie or login, no
  new dependency or proxy change). The page lists 86 cameras but its origin is
  slow and unstable: 54 answer 404 and the rest time out now and then, so only
  the 29 that served a valid video segment in at least one of three probes are
  included; the others can be added later. The page publishes no coordinates:
  23 positions are guesses from the street names (a road crossing or place
  search in Kota Pekanbaru, `APPROX. LOCATION`), 6 sit on a ring around central
  Pekanbaru (`CITY-LEVEL ONLY`). Pekanbaru has no placeholder camera.
- 76 live Surakarta city CCTV cameras (UNOFFICIAL SOURCE, demo only) from the
  public ATCS Kota Surakarta streams (anonymous HTTP-FLV, no cookie or login).
  They play in the same CCTV panel and 3D monitor as the HLS cameras, using the
  new `mpegts.js` player (loaded only when an FLV camera is shown) with the same
  self-healing reconnect as HLS. The operator's 95 URLs held 76 that answer; 19
  never respond and were left out. Positions are guesses from the label: 56
  anchored on a place search (`APPROX. LOCATION`), 20 on a ring around central
  Surakarta (`CITY-LEVEL ONLY`). The proxy gained a path for endless streams
  (closes the upstream when you close the camera, cuts a silent upstream after
  15 s). Real-browser playback has not been exercised yet.
- 131 live Yogyakarta city CCTV cameras (UNOFFICIAL SOURCE, demo only) from the
  public JSS portal (`cctvjss.jogjakota.go.id`, plain HLS, no cookie or login).
  The operator's 137 URLs held 133 distinct streams; 2 failed a liveness probe
  and were left out. The pack uses each stream's stable `playlist.m3u8`, not the
  `chunklist_wNNN` URL the browser shows (that number is a per-session id and
  changes on every request). Positions are guesses from the label: 97 anchored
  on a place search (`APPROX. LOCATION`), 34 on a ring around central Yogyakarta
  (`CITY-LEVEL ONLY`). The default camera catalog cap rises from 1600 to 2000
  (the catalog is 1657 rows; at 1600 it truncated Yogyakarta to 74 cameras).
- 199 live Malang city CCTV cameras (UNOFFICIAL SOURCE, demo only) from the public
  Malang ATCS portal. The portal refuses its streams (403) unless the page was
  visited first, so the dev proxy now fetches that page anonymously, keeps the
  cookie it receives for up to 30 minutes and replays it with a `Referer` (no
  login, no credential; opt-in per source with `portalSession`). Positions are
  guesses from the street in the label: 167 are anchored on a place search
  (`APPROX. LOCATION`), 32 sit on a ring around central Malang
  (`CITY-LEVEL ONLY`). The operator's ~210 lines held 199 distinct URLs (10 URLs
  carried two different labels; the first is used). The default camera catalog
  cap rises from 1400 to 1600 (it truncated Malang to 73 cameras at 1526 rows).
- 31 live Pasuruan (Kabupaten) and 35 live Sumedang city CCTV cameras (UNOFFICIAL
  SOURCE, demo only) from the public Dishub ATCS streams. Positions are guesses
  from the label: 44 are anchored on a place search (`APPROX. LOCATION`), 22 sit
  on a ring around the regency centre (`CITY-LEVEL ONLY`). 2 Pasuruan URLs
  (Exit Tol Purwodadi, Exit Tol Gempol) return 404 and were left out.
- 12 live Mataram (Lombok) city CCTV cameras (UNOFFICIAL SOURCE, demo only) from the
  public Mataram ATCS portal. 6 are placed from the intersection name
  (`APPROX. LOCATION`), 6 sit on a small ring around central Mataram
  (`CITY-LEVEL ONLY`).
- 1 live Cianjur city CCTV camera (UNOFFICIAL SOURCE, demo only) from the public
  Cianjur ATCS page. The street could not be identified, so it sits at the centre of
  Cianjur town and is labelled `CITY-LEVEL ONLY`.
- 141 live Surabaya city CCTV cameras (UNOFFICIAL SOURCE, demo only) from the
  public Surabaya ATCS portal. 133 are placed from the street or intersection
  in their label (`APPROX. LOCATION`, roughly 1-3 km of error); 8 whose street
  could not be identified sit on a ring around central Surabaya
  (`CITY-LEVEL ONLY`). 16 of the 157 supplied URLs were left out (7 return 404,
  8 never advance, 1 is a duplicate), and the Cianjur URL was added separately once its server answered. The default camera catalog cap rises from
  1200 to 1400 to fit them.
- 436 live toll cameras from the Bina Marga CCTV Tol portal (24 corridors,
  including Jakarta-Cikampek, Serpong-Balaraja, Jalan Layang MBZ, JORR, Jagorawi,
  Cipularang, Semarang-Batang, Balikpapan-Samarinda, Pekanbaru-Dumai, Medan-Tebing
  Tinggi, Palembang-Indralaya, Sigli-Banda Aceh, Binjai-Langsa and Jakarta Dalam Kota) are
  now in the unofficial Indonesia pack. They are labelled UNOFFICIAL and
  APPROX. LOCATION: positions are placed by KM along the toll centerline, not
  surveyed. The default camera catalog cap rises from 900 to 1200 to fit them (later 1400, see below).

### Changed

- Internal: `cctvProxy.mjs` (458 lines, close to the 500-line limit) lost its health
  store, `/sources` + `/stream` payload shaping and Street View fallback to
  `cctvHealthStore`, `cctvProxyPayloads` and `cctvStreetView` (371 lines left). The
  Indonesia pack test (374 of 400 lines) moved its West Sumatra and toll-road
  checks into `cctvIndonesiaSumbarPack.test.mjs` and `cctvIndonesiaTollPack.test.mjs`
  (257 lines left). No behavior change; the extracted modules gained unit tests.
- Internal: `cctvProxy.mjs` (1445 lines) was split into `cctvSourceCatalog`,
  `cctvOpenDataSources` (itself one module per provider: Austin, Caltrans, TfL),
  `cctvAustinParse`, `cctvSourceNormalize`, `cctvFrameFetch`
  and `cctvSyntheticFrame` (446 lines left: the route handlers). No behavior
  change; the extracted parsers gained unit tests.
- Internal: `cctvProjectionRuntime.js` (489 lines) and `cctvHlsSelfHeal.js` (223
  lines) were split below the project size limits (`cctvProjectionVideo.js`,
  `cctvHlsStall.js`, `cctvHlsBackoff.js`). No behavior change.
- Every load and reload now lands on Esri Satellite. The URL hash no longer stores
  or restores the basemap (`map=`), so a tab that was last on Google 3D no longer
  loads Esri and then Google 3D on top of it. Google 3D and the other basemaps are
  still one click (or one voice command) away, but are no longer remembered across
  reloads, and an old link carrying `map=photoreal` opens on Esri.

### Fixed

- CCTV live HLS video no longer freezes a few seconds after it starts on
  current Chrome. The player was picked by `canPlayType()`, which Chrome now
  answers "maybe" even though its native HLS engine cannot parse these feeds, so
  hls.js (and its recovery) was never used. hls.js is now always tried first;
  the native engine is only the fallback when hls.js cannot run.
- Pasuruan streams (and any other host that sends an incomplete TLS certificate
  chain) no longer fail with "Media proxy failed" in the dev proxy. Browsers
  repair the missing intermediate certificate on their own; Node did not.
  Certificate verification stays on.
- CCTV HLS video no longer stays black until the camera is reselected. After hls.js
  exhausts its in-place recoveries the player is rebuilt with exponential backoff
  (2 s up to 30 s; up to 120 s for a source reported offline). A network error now
  restarts from the live edge (fresh playlist) instead of resuming from the stale
  playhead, and a feed whose playhead stops for 25 s is restarted automatically.
- CCTV cameras whose source answers 200 with an empty playlist (all 236 toll cameras on
  `jmlive.jasamarga.com` measured 2026-10-08) are no longer reported "Live stream
  connected". The proxy marks them `degraded` ("Source sent an empty playlist") and
  answers 502; the plane and badge say `SOURCE SENT EMPTY PLAYLIST` instead of waiting
  forever. A feed that buffers nothing for 20 s is reported `NO DATA FROM SOURCE ·
  RETRYING` and rebuilt with backoff, for hls.js and for natively played HLS alike.
- CCTV monitor plane and panel badge no longer claim "Live stream connected" over a
  dark plane. The plane reads `WAITING FOR VIDEO`, `STREAM INTERRUPTED · RECOVERING`
  or `STREAM STALLED · RETRYING (#n)`, and the panel badge follows (`STREAM ·
  CONNECTING`, `⚠ STREAM STALLED · RETRYING`). A frozen last frame is no longer shown
  as live while the player is retrying.

- CCTV: a camera whose provider has taken the feed down (the stream URL answers
  404/410, or the host no longer exists) is now labelled `⛔ CAMERA OFFLINE ·
  SOURCE DOWN` instead of a generic degraded/error state, so a dead source is no
  longer mistaken for a fault in the app.
- CCTV: working streams no longer show `UPSTREAM · DEGRADED … Unexpected media
  type application/x-mpegURL`. The media-type check was case-sensitive and
  rejected the mixed-case type that the Bandung (Pelindung) servers send, and it
  also rejected `.m3u8` feeds that omit Content-Type.
- The "Restoring shared view..." startup screen no longer waits for every saved
  layer to finish restoring. It lifts once the shared camera, visual settings and
  first rendered frame are ready; heavy layers such as CCTV keep loading behind the
  visible app with their existing loading chip.
- CCTV live video now restarts from the live edge when the tab comes back after being
  hidden for 10 s or more. A hidden tab throttles the player's timers, so on return it
  asked the stream for segments that had been deleted in the meantime (404 and a freeze).
  Only the selected camera's feed is reloaded.
- CCTV live video no longer sits so far behind the live edge on short-segment streams
  (Denpasar, Mataram and several toll feeds): the fixed 5-segment live-sync distance
  left only a few seconds before the segment being fetched rolled off the upstream
  playlist. This is not the fix for the stale-segment 404s seen after a tab sat in the
  background (see "reload on tab return" below).
- Mataram's low-latency HLS playlists no longer make the player hammer the stream
  with reloads: the CCTV proxy now serves them as plain live playlists.

### Changed

- With a CCTV camera selected, its live monitor frame is now shown clean: no
  frustum wireframe or viewshed fill from the selected camera or its neighbors
  is drawn across it, and other cameras show only their icon. ADJUST mode still
  shows the selected camera's frustum so it can be edited. Camera icons that
  would be drawn on top of the live frame are hidden as well, and reappear when
  they move outside it or the camera is deselected.

### Removed

- The 3 ATCS Bandung demo cameras (Samsat, Buahbatu, Pasteur) were removed from
  the unofficial Indonesia pack: their upstream streams return 404 and no
  longer play.

### Added

- **58 more live Denpasar CCTV cameras (UNOFFICIAL SOURCE, demo only)** from the
  public ATCS Denpasar page (95 ATCS Denpasar cameras in total). Positions are
  guesses, as before: 38 are placed from the street or intersection name
  (`APPROX. LOCATION`), and 20 whose street is unknown sit on a ring around
  central Denpasar (`CITY-LEVEL ONLY`).
- **37 more live Denpasar CCTV cameras (UNOFFICIAL SOURCE, demo only)** from the
  public ATCS Denpasar page. Their positions are guesses: 21 are placed from
  the street name (`APPROX. LOCATION`), and 16 whose street is unknown sit on
  a ring around central Denpasar (`CITY-LEVEL ONLY`) and do not show where the
  camera really is.
- **14 live Jakarta toll-road cameras (UNOFFICIAL SOURCE, demo only)** from the
  Bina Marga CCTV Tol page (Akses Tanjung Priok and Becakayu; four Becakayu ramp cameras are placed even more roughly). The source has
  no coordinates, so their positions are **approximate** (interpolated from
  the KM marker, off by about 2 km or more) and every name says
  `APPROX. LOCATION`.
- **60 more live Bandung CCTV cameras (UNOFFICIAL SOURCE, demo only)** from
  pelindung.bandung.go.id, spread across the city. They carry the same amber
  `⚠ UNOFFICIAL SOURCE` badge as the other Indonesian cameras and can be
  switched off with `CCTV_INDONESIA_UNOFFICIAL_ENABLED=0`. Camera heading is
  unknown, so their view cones are rough placeholders.

### Changed

- **Scenes dropdown is shorter and closes on scroll.** The popup is capped at
  about five rows (longer lists scroll inside it) so it no longer covers the
  shot list, and scrolling the panel or page closes it instead of leaving it
  floating.
- **Panel scrollbars now use the CCTV panel's cyan style** (Scenes panel and
  shot list, Context and Contacts panels, and the left/right panel stacks)
  instead of the native white bar.
- **Scope Intensity starts at 0%** on a fresh open (was 100%). Links that
  already carry an intensity value, and old links with none, restore as before.
- **New eagle logo** in the title bar, the loading screen and the browser tab
  icon, recolored cyan so it reads on the dark background. The old eye logo's
  pointer-following gaze effect no longer applies (the eagle is static).
- **Scene dropdown no longer clips long scene names.** The popup is at least
  as wide as the button and grows to fit the longest name.
- **A fresh start now opens on Esri Satellite instead of Google 3D.** Google
  3D is still available from the map-source row; its tiles stay hidden (and
  do not stream) until you pick it. Links without a `map=` choice also mean
  Esri.
- **Turning CCTV ON with no camera selected now lands on the live Denpasar
  camera instead of Austin.** If the catalog has no live Denpasar camera it
  uses a Denpasar seed, then the first camera.
- **The Scenes panel's scene dropdown now matches the CCTV camera dropdown**
  (dark, blurred, themed scrollbar) instead of the native white OS popup.

### Refactored

- **Sixteen oversized source files are now small modules with no behavior
  change.** `cctv`, `flights`, `militaryFlights`, `rocketLaunches`, `traffic`,
  `satellites`, `radio`, `aisLiveVessels`, `militaryAwareness`, `worldOverlay`,
  `gevRealtime`, `cockpitViewController`, `manager`, `ui`, `gevActions` and
  `annotationResolver` each become a thin parent (94–1,121 lines, e.g.
  `cctv.js` 5,453 → 446, `flights.js` 4,808 → 312, `ui.js` 4,426 → 809) plus
  sibling modules. Layer state moves into one `S` object per layer, classes
  use mixins, and every export and `*ForTest` hook stays on the parent.
  Source-text tests read the parent plus its modules through
  `readLayerSourceText`. The one-shot codemods used for the split are
  archived in `archive/split-codemods-2026/` and should not be rerun without
  review. See `docs/CURRENT-STATE.md` §Source layout.
- **`npm run test:track` no longer fails spuriously on a loaded machine.**
  Its frame-sampling windows and render-settle waits assumed a render rate
  that headless software GL does not reach at machine load above 8, which
  produced 2–9 false failures per run (ground-3d sampling windows, weld,
  display-floor). Windows now scale with real frame time; assertions are
  unchanged and three consecutive runs at load 9–11 passed 108/108.
- **`flights.js` and `militaryFlights.js` shared their dead-reckoning math as
  two near-duplicate private copies; it is now one shared module.** Extracted
  the ENU-frame extrapolation/interpolation engine (bracketing-fix
  interpolation, constant-rate-turn extrapolation, warm-up detection) into
  `src/data/deadReckoning.js` (`createDeadReckoning()`), using the same
  per-layer factory-closure pattern already established by
  `groundSnap.js`/`trailRenderer.js` — each layer creates its own instance
  with its own `renderDelaySec` and field-name readers (OpenSky's
  `velocity`/`true_track` vs. adsb.lol's `speedMps`/`track`), so the caches
  stay per-layer while the math is shared. No behavior change: the
  zero-allocation module-scratch discipline is preserved via a persistent
  `last` object callers read immediately after calling `deadReckon()`, and
  `flights.js`'s dev-only focus-evidence QA override becomes an optional
  constructor param the military layer omits. Also moved `approxDistanceKm`
  into the new module — it turned out to only ever exist in `flights.js`,
  not duplicated in `militaryFlights.js` as originally scoped, so this makes
  it available to both rather than de-duplicating it. `flights.js` drops
  from 5,338 to 5,172 lines, `militaryFlights.js` from 3,876 to 3,744 lines.
- **`flights.js` and `militaryFlights.js` shared their billboard/model
  presentation logic as two near-duplicate private copies; it is now one
  shared module.** Extracted the fleet-billboard visual contract (normal
  vs. Cockpit-far-dot rendering, rotation reset, TR-3B sprite-kind
  resolution, IR-boost model reload batching, TR-3B re-render on
  conversion/style change) into `src/data/aircraftPresentation.js`
  (`createAircraftPresentation()`), using the same per-layer factory-closure
  pattern as `deadReckoning.js`/`groundSnap.js`/`trailRenderer.js`: each
  layer creates its own instance, passing accessor closures for
  reassignable per-layer state (billboards/flight-data/tracked-icao maps
  get replaced wholesale by test-reset/destroy paths, so a captured
  reference would go stale) plus required callback params for genuine
  behavioral divergence (`resolveFleetColor`, `resolveFleetScale`,
  `cockpitFarColor`, `getModelSpec`). `militaryFlights.js` passes the same
  function for both `resolveFleetColor` and `cockpitFarColor` — its
  cockpit-far dot has no separate civilian-color branch, unlike
  `flights.js`. Deliberately **not** moved: `_modelSpec`/`_modelColor`/
  `_modelMatrix`/`_ensureModel`/`_updateTrackedModel` stay fully per-layer —
  their branch structures and asset catalogs genuinely differ, so unifying
  them would trade duplication for a leaky abstraction. As part of this
  extraction, two pre-existing inline-duplicate call sites in
  `militaryFlights.js` (the tracked-restore block in `_clearTracking`, and
  the poll-path billboard-add block) were routed through the new shared
  callbacks instead of being left as separately-flagged debt — this also
  resolves a pre-existing inconsistency between those sites and the
  layer's own fleet-tick presentation logic. `flights.js` drops from 5,338
  to 5,263 lines, `militaryFlights.js` from 3,876 to 3,824 lines. New
  `aircraftPresentation.js`: 294 lines.
- **`flights.js` and `militaryFlights.js` shared their model-ground-handoff
  logic as two near-duplicate private copies; it is now one shared
  module.** Extracted the world-transform builder, the ground-sample
  exclusion list, the grounded display-position resolver, the gap-proof
  billboard→model handoff, the model-ownership predicate pair, and the
  stale-grounded-contact re-floor sweep into `src/data/modelGroundHandoff.js`
  (`createModelGroundHandoff()`), using the same per-layer factory-closure
  pattern as `deadReckoning.js`/`groundSnap.js`: each layer creates its own
  instance via accessor closures for reassignable per-layer state
  (billboards/flight-data/tracked-icao maps get replaced wholesale by
  test-reset/destroy paths) plus required params for genuine divergence
  (`headingOffsetDeg`, `getModelSpec`). `militaryFlights.js`'s fleet handoff
  keeps a thin per-layer wrapper around the shared `driveFleetModelHandoff`
  so it can still apply its own per-class heading override, which the
  shared engine's default does not cover. The two files' stale-re-floor
  sweeps had one discovered behavioral discrepancy —
  `militaryFlights.js`'s inline "Round 6" loop skipped a contact a model
  already owns, `flights.js`'s did not — preserved verbatim via a required
  `gateStaleRefloorOnModelOwnsVisual` option rather than silently
  reconciled; which behavior is correct is left as an open follow-up, not
  decided by this extraction. Deliberately **not** moved: `flights.js`'s
  held-floor/corridor-warming system, which has zero `militaryFlights.js`
  counterpart and stays there, unshared, by design. As part of this
  extraction, a dead `GROUND_FLOOR_LIFT_M` import in `militaryFlights.js`
  (only used by the now-removed inline Round 6 loop) was trimmed.
  `flights.js` drops from 5,338 to 5,210 lines, `militaryFlights.js` from
  3,876 to 3,833 lines. New `modelGroundHandoff.js`: 265 lines.

### Fixed

- **Traffic/aircraft/vessel detection labels (e.g. `VEH-XXXX` vehicle IDs)
  drew through the 3D CCTV monitor plane instead of being hidden behind
  it.** Root cause: the Universal Detection Overlay (`src/data/detection.js`)
  paints on a 2D canvas layered above the WebGL scene and only tested
  horizon/ellipsoid occlusion (`EllipsoidalOccluder.isPointVisible`) — it had
  no awareness of any 3D scene geometry, so an object's on-screen bracket/
  label always composited above whatever 3D geometry happened to be in front
  of it, including an active CCTV monitor plane. First fix attempt added a
  per-frame, per-object 3D line-of-sight test against the plane's real
  geometry (ray-vs-finite-rectangle intersection) — this correctly hid
  objects strictly behind the plane, but CCTV planes sit at the real-world
  coordinates of the road they're monitoring, so most nearby vehicle dots
  are naturally at similar-or-nearer camera depth than the plane and stayed
  unmasked, even while visibly overlapping it on screen (field report: the
  contamination was still visible after the depth-based fix shipped).
  Superseded with **screen-space masking**: the plane's four corners are
  projected into 2D screen space once per frame
  (`src/data/detectionPlaneOcclusion.js`, `projectPlaneScreenQuad`/
  `computeOcclusionPlaneScreenQuads`), and any object whose own on-screen
  position falls inside that projected rectangle (`isPointMaskedByPlanesOnScreen`)
  is masked — regardless of its 3D depth relative to the plane. Still zero
  scene raycasts (plane corners projected through the same per-frame
  view-projection matrix `detection.js` already uses for every object's own
  screen position), preserving the CCTV subsystem's existing "one raycast
  per activation, never per frame" invariant. Scoped to this one check only;
  every other layer's intentional "see contacts through terrain" behavior
  (`disableDepthTestDistance`) is unaffected. At most one CCTV plane can
  ever be showing at a time, so the check is a no-op whenever no CCTV plane
  is active.
- **Traffic/aircraft/vessel label CARDS (the text callout, not the bracket)
  still rendered inside the CCTV monitor plane after the screen-space-quad
  fix above shipped.** Field report: on the Jakarta "CCTV-DISKOMINFOTIK
  #JagaJakarta" (Gatot Subroto) camera, `VEH-XXXX` label cards still drew
  inside the plane's rectangle — reproducible on any camera/city, not
  specific to that one feed. Root cause: the screen-space-quad fix only
  ever tested a detectable object's raw bracket-anchor POINT against the
  plane's quad; it never tested the bracket's own drawn rectangle, nor the
  label card's own placed rectangle. A card is offset from its anchor by
  the bracket's half-extent plus an 8-12px gap plus the card's own width/
  height — routinely 40-100+ px away — so an anchor correctly outside the
  plane left the card free to still land on top of it. Fixed by adding
  `isRectMaskedByPlanesOnScreen()` (`src/data/detectionPlaneOcclusion.js`),
  a proper Separating Axis Theorem convex-polygon overlap test (an
  off-angle CCTV plane's screen quad is not necessarily axis-aligned, so a
  plain AABB check would be wrong), applied at both levels that were
  missing it: the bracket's own drawn rectangle (`detection.js`'s per-object
  loop) and every candidate corner placement's card rectangle inside
  `buildLabelPlacements()` (`src/data/detectionLabelGeometry.js`) — the
  latter is the actual fix for the reported bug. A label whose every corner
  is blocked by the plane is dropped for that frame rather than forced onto
  a corner that still overlaps it.
- **CCTV live-video monitor plane still flickered during playback after the
  decoded-frame dedup fix below.** Root cause: even deduped, every genuinely
  new video frame still swapped the plane's canvas-backed double-buffer
  texture, and Cesium fully destroys and recreates the GPU texture on every
  such reference reassignment (confirmed against Cesium's own `Material.js`
  source) — a real flash opportunity regardless of swap frequency. Fixed by
  binding the plane's material ONCE, at creation, to a hidden proxy `<video>`
  fed by `canvas.captureStream(12)` (`createProjectionProxyVideo()`) instead
  of the canvas directly — Cesium's native `HTMLVideoElement` texture path
  updates in place (`copyFrom`, no destroy/recreate) rather than swapping
  references, matching the 2D panel's `<video>` preview, which never
  flickered. The proxy's own source is the fixed-size projection canvas, so
  it's structurally immune to the two failure modes that ruled out binding
  the plane directly to the live upstream video (the 2026-09-22 fix below):
  a mid-stream decoded-size change, or an hls.js `recoverMediaError()`
  MediaSource reset. Falls back to the unchanged double-buffer swap if
  `canvas.captureStream` is unavailable. See `docs/DECISIONS.md` (2026-09-28
  entry) for the full root-cause history and the rejected higher-risk
  alternative (a manual `Cesium.Texture` + `copyFrom`).
- **CCTV live-video monitor plane flickered/flashed during playback, in every
  map regime.** Root cause: `drawProjectionFrame()`'s video branch bumped
  `canvasStamp` on every RAF tick whenever `video.readyState>=2`, with no
  check that the video had actually decoded a new frame since the last
  tick — unlike the image-feed path, which only redraws when
  `projectionFrameSignature()` detects genuinely different pixels. Every
  `canvasStamp` bump forces a double-buffer swap and a `planeMaterial.image`
  reassignment, and every such reassignment is a documented flash
  opportunity while Cesium rebinds the texture (same root cause already
  identified for image feeds' 2026-07 white-flash fix) — so a stalled/
  buffering HLS segment (when nothing new had actually decoded) still
  triggered a flash every single frame. Fixed by skipping the redraw/rebind
  when `video.getVideoPlaybackQuality().totalVideoFrames` hasn't advanced
  since the last tick — the same dedup philosophy as the image path, sized
  for video's ~12fps swap cadence (a per-tick pixel hash, as image mode
  uses, would be too costly at that rate). Falls back to the pre-fix
  always-redraw behavior when `getVideoPlaybackQuality` is unavailable, so
  nothing regresses on an environment without it.
- **Investigated and ruled out: CCTV monitor plane appearing "half-filled" in
  Google Photorealistic 3D Tiles mode (not reproducible in Esri satellite
  mode).** Hypothesized root cause was 3D-tile depth-test occlusion of the
  plane (it has no `disableDepthTestDistance` override, unlike the camera
  billboard). Built and ran an empirical raycast probe against the exact
  reported camera (Jakarta "JPO Gatot Subroto") sampling a 5×5 grid across
  the live plane geometry in both map regimes: 0/25 points occluded in
  `google-3d`, 0/25 in `esri-imagery` — identical, falsifying the occlusion
  hypothesis. No fix applied for this symptom; root cause remains open.
- **Splash screen ("Initializing photorealistic world...") stayed up for a
  flat, unconditional 1000ms on every ordinary boot**, even though the scene
  was already rendering well before that. Root cause: the loading-screen
  hide gate waited on `Promise.all([initialRestorePromise, timeout(1000)])`
  — a hardcoded timer with no relationship to actual render readiness.
  Replaced with a real first-painted-frame signal (`viewer.scene.postRender`,
  one-shot, with a bounded 5s fallback for WebGL context loss/headless
  environments) plus a much smaller 250ms minimum-visible floor purely to
  avoid a flash on unusually fast boots (`src/splashGate.js`, new). Removes
  ~750ms of pure artificial latency from a typical boot. The share-link
  recipient path's own separate ~1500ms "Restoring shared view..." delay is
  a deliberate, unrelated UX choice and is unchanged.
- **The app/tab could crash after load when several previously-enabled
  layers restored at once** (returning users, share-link recipients,
  Context-mode session restore, and Contacts/Global Context entry). Root
  cause: no cross-layer concurrency gate existed anywhere — bulk restore
  fanned out ALL saved-enabled layers' full `init/enable/update` lifecycles
  simultaneously via unthrottled `Promise.allSettled`, and CCTV alone can
  internally fan out up to 14 concurrent viewshed frustums on its own first
  update (~19.6s / ~193MB heap cold). Several such lifecycles running at
  once could exhaust GPU/memory and crash the tab. Fixed with one shared
  `p-queue`-backed concurrency gate (`RESTORE_CONCURRENCY = 4`) owned by
  `DataLayerManager`, applied at every bulk fan-out site: page-load restore,
  Context-mode session restore, Context-mode exit's layer teardown, and
  Contacts' own dependency auto-enable (previously self-bounded locally at
  4, now sharing the same global bound so it can't stack with a concurrent
  page-load restore). A single explicit user toggle is never delayed by
  this gate even while it's saturated by an in-flight bulk restore of other
  layers. Restoring many saved-enabled layers is now intentionally slower
  wall-clock (throttled, not parallel) — the correct tradeoff, not a
  regression.
- **CCTV coverage wireframe green flicker, reported on a laptop GPU (not
  reproducible on this project's own hardware).** Root cause: the frustum
  wireframe's corner rays and mount point could sit near-coincident with
  terrain/3D-tile depth (the ground-clamp only lifts the far-cap center, not
  the bottom corner pair — see the existing "true pyramid" clamp behavior),
  compounded by the wireframe's `depthFailMaterial` depending on the
  `EXT_frag_depth` WebGL extension, which Cesium's own docs warn can produce
  artifacts where unsupported/inconsistently supported — more likely on
  integrated laptop GPUs. Fix: lift the wireframe's corner/mount vertices
  (and, by design, the viewshed fill volume that shares them) a small
  constant distance off the surface along the local ellipsoid normal before
  they become entity positions (`WIREFRAME_ZFIGHT_LIFT_M`, `src/data/cctv.js`
  — same technique as `VESSEL_LIFT_M`/`GROUND_FLOOR_LIFT_M` elsewhere in the
  codebase). The monitor plane's `capCenter` is left unlifted, preserving
  the existing corner/plane coincidence invariant. This addresses a
  well-evidenced root-cause hypothesis via static analysis; it has not been
  visually confirmed against the actual laptop that reported the flicker.
- **`glCopySubTextureCHROMIUM` GL error still occurring on the 3D CCTV
  monitor plane despite two prior size-guard fixes** (rebuild-on-decoded-
  size-change, then a two-tick debounce, then an immediate park-on-mismatch
  guard — all now removed as dead code). Root cause: the plane's material
  was bound directly to the live `<video>` element, and Cesium's
  `Material.js` copies the video's current frame into that texture every
  render tick with **no size check at all** — while hls.js's
  `recoverMediaError()` (hit periodically on these unofficial feeds) resets
  the `MediaSource` with **no corresponding `videoWidth`/`videoHeight`
  change**, a window no JS-side size guard could ever detect. Fix: the
  monitor plane's material is now bound to the same fixed-size offscreen
  canvas used for image feeds from creation, and **never rebinds to the raw
  `<video>` element at any point** — video frames reach the plane only via
  `drawImage` (auto-scales any decoded size, eliminating the GL error class
  by construction) at a faster ~12fps double-buffer swap rate
  (`PROJECTION_VIDEO_SWAP_MS`) instead of image feeds' 1Hz. This entry
  supersedes and folds in the two prior "half frame" and repeat-GL-error
  changelog entries for the same root cause.
- **Street Traffic could freeze the tab ("Page Unresponsive") when zoomed
  into a dense city block.** The detailed road fetch (triggered close to the
  ground, including residential streets) could return thousands of OSM ways;
  the parser's cold-cell fallback height called a real, expensive raycast
  (`scene.sampleHeight()`) synchronously once per road with no cap, unlike
  every other scene query in the app. That fallback is now capped at 40 calls
  per fetch (`MAX_HEIGHT_FALLBACK_SAMPLES` in `src/data/traffic.js`); roads
  past the cap still get correct height moments later from the same batched
  ground-floor resolution every other road already relies on. See
  `docs/CURRENT-STATE.md` for details.
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
- **Follow-up: the new camera picker popup rendered as a large mispositioned
  dark rectangle over the panel.** The listbox's `position: fixed`
  coordinates were computed relative to the viewport, but
  `.cctv-panel-inner`'s `backdrop-filter` makes it the CSS containing block
  for `position: fixed` descendants — so the coordinates resolved against
  the panel instead of the screen. Fixed by reparenting the popup onto
  `document.body` at init (`src/cctvPanelMixin.js`), clear of any
  `backdrop-filter` ancestor.
- **Follow-up: the camera picker popup was too narrow, truncating every
  camera label.** The popup was sized to the trigger button's own width,
  but the trigger is only ~1/3 of the panel's width (it sits between PREV
  and NEXT). The popup now matches the CCTV panel's full content width
  instead (`src/cctvPanelMixin.js`).

### Refactored

- **Extracted `worldOverlay.js`'s source/domain registry and entry-normalizing
  validators into their own module, `src/overlays/worldOverlaySourceRegistry.js`.**
  File-split program, Wave 3 item #32. Moved verbatim: the `_sources`/
  `_domains` Maps and their append-only iteration-order lists (now exported
  named bindings `registrySources`/`registrySourceList`/`registryDomains`/
  `registryDomainList` — a stable `const` direct reference, not a per-layer
  factory closure like items #28-#31, since `worldOverlay.js` is a true
  module-level singleton and these bindings are never reassigned), every
  pure entry-normalizing/validating helper (`normalizeOverlayEntry`,
  `paintLaneForOverlayEntry`, `selectBoundedOverlayCohort`, `isProtected`,
  `normalizeDistanceScale`, `normalizeAltitudeScale`, `normalizeSourceOptions`,
  `snapshotCullPosition`, `assertSourceId`, `entryKey`, `compareStableKeys`),
  and the registry's own CRUD (`getOrCreateSource`, `getOrCreateDomain`,
  `rebuildSourceCohorts`). `normalizeOverlayEntry` is Cesium-agnostic in the
  registry (the host's `Cesium` namespace is threaded through as an explicit
  first argument rather than imported a second time); `worldOverlay.js` keeps
  its existing public `normalizeOverlayEntry(sourceId, entry)` export and
  signature as a one-line wrapper. `WORLD_OVERLAY_PAINT_LANES` moved to the
  existing shared-tokens module, `src/overlays/worldOverlayTokens.js` (both
  `worldOverlay.js`'s per-frame paint pipeline and the new registry need it,
  and `worldOverlay.js` imports from the registry, so defining it in either
  of those two would create an import cycle); `worldOverlay.js` re-exports it
  unchanged for `worldOverlay.test.mjs` and any other existing consumer.
  Host-owned state stays entirely in `worldOverlay.js` by design (see that
  module's own "Scope note" and the registry's docstring): the per-frame
  projection/solve/paint pipeline, `_records` (pooled paint-rect cache),
  `_customPaintLanes`/`_customPaintLaneList` (source-owned painters in fixed
  lanes), `invalidateHost`/`updateEntryDiagnostics`/`_diagnostics`, and the
  five public entry-mutation exports (`setOverlayEntries`, `upsertOverlayEntry`,
  `removeOverlayEntry`, `clearOverlaySource`, `setOverlaySourceVisible`), which
  now call into the registry's primitives and then do their own host-owned
  cleanup. No change to any of this module's ~8 existing public export names
  used by its 13 other importers. `worldOverlay.js`: 2393 → 1986 lines. New
  `worldOverlaySourceRegistry.js`: 467 lines. A sibling branch,
  `refactor/worldoverlay-ui-occluder-tracking-split` (item #24, splitting
  this same file's UI-occluder tracking into `worldOverlayOccluder.js`),
  forked from the same `main` commit and independently touched the same
  import block and constant-declaration region of `worldOverlay.js`; merging
  both into `main` produced a genuine two-location merge conflict, resolved
  by combining both sides' additions (both sets of imports/exports/the
  `normalizeOverlayEntry` wrapper are needed simultaneously) and dropping
  this branch's stale reintroduction of `OCCLUDER_PADDING_PX`/
  `OCCLUDER_REFRESH_MS`, which item #24 had already relocated to
  `worldOverlayOccluder.js`.
- **Extracted `flights.js`'s adsbdb type/route enrichment queue into its own
  module, `src/data/enrichmentQueue.js`.** File-split program, Wave 3 item
  #31 — the plan's own wording called this the "OpenSky enrichment
  queue/throttle," but the actual subsystem enriches via the community
  **adsbdb** API (type/registration/route lookups), a distinct upstream from
  OpenSky (which only supplies live position); the module and this entry are
  named for what the code actually does. Unlike Wave 3 items #28-#30, this is
  a `flights.js`-only relocation, not a two-file reconciliation:
  `militaryFlights.js` carries no adsbdb enrichment code at all (its aircraft
  are pre-classified from the military registry), confirmed via exhaustive
  grep before starting. Moved verbatim: the bounded fan-out queue (max 4
  concurrent, ≤5/s dispatch drip, priority lane for tracked/model-eligible
  planes, per-session dedup), the rolling token-bucket ambient-sweep budget,
  and the nearest-on-screen-first ambient fleet type-classification sweep.
  Same per-layer factory-closure pattern as `groundSnap.js`/
  `modelGroundHandoff.js`: `flights.js` instantiates its own
  `createEnrichmentQueue()` via accessor closures for its reassignable state
  (flight-data/billboard maps, tracked icao/entity, viewer, billboard
  collection) plus its own `applyFleetBillboardPresentation`/
  `syncModelToClass`/`updateTrackedLabelModel` callbacks. The
  `window.__GEV_ENRICH_AMBIENT_QA` seam `scripts/qa-enrich-ambient.mjs` drives
  is preserved unchanged. `flights.js`: 5338 → 5179 lines. New
  `enrichmentQueue.js`: 273 lines.

### Changed

- **All 13 data layers are now lazy-loaded.** Previously every layer module
  (flights, military, satellites, traffic, CCTV, radio, bikeshare, AIS
  vessels, rocket launches, military installations, military awareness/
  Contacts, earthquakes) was statically imported and registered eagerly at
  boot, regardless of whether the user ever enabled it. Each now registers
  via `DataLayerManager.registerLazy()` with a dynamic `import()` loader
  that only resolves the first time the layer is actually enabled (by UI
  toggle, voice command, or restored state). `ui.js` and
  `voice/gevActions.js` no longer reach directly into layer-module
  internals (`dataManager.layers.get(id).module...`) — both now go through
  a `DataLayerManager` facade (`callLayerMethod`, `getTrackedInfo`,
  `getContextSnapshot`, `subscribeLayer`, etc.), per this project's own
  stated layer/UI separation rule. `earthquakes`, `bikeshare`, `traffic`,
  `radio`, `rocket-launches`, and `cctv` achieve real separate-chunk code
  splitting; `flights`, `militaryFlights`, `satellites`, `aisLiveVessels`,
  `militaryInstallations`, and `militaryAwareness` stay bundled together
  because `militaryAwareness.js` and a few `gevActions.js` call sites read
  live, non-pure module state from them internally — an accepted, explicit
  tradeoff (`src/data/layerMetadata.js`, `docs/CURRENT-STATE.md`) rather
  than a risky internal extraction. `localLayers.js`'s bundled static
  datasets (dams, datacenters, submarine cables) stay eager by design —
  already lightweight, out of scope.
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
- **Reduced token cost of working in this repo — doc restructuring + two
  small module extractions, no runtime behavior change.**
  - `docs/CURRENT-STATE.md` is now a present-tense reference only; the
    dated rationale/history it used to carry (performance-wave notes,
    threshold-change history, milestone asides) moved to the new
    `docs/DECISIONS.md`, added to the Canonical Docs Order in both
    `docs/CURRENT-STATE.md` and `CLAUDE.md`.
  - `CockpitViewController` moved out of `src/ui.js` into its own
    `src/cockpitViewController.js` (mechanical relocation, `ui.js` now
    imports it — no behavior change).
  - Global Context mode (the Contacts / Space Missions exclusive-layer
    session capture/restore, mode state machine, layer-change reaction
    handler, and panel button sync) moved out of `src/ui.js`'s
    `StyleManager` into a fourth prototype mixin,
    `src/contextModeMixin.js`, composed back in via `Object.assign` the
    same way as the three existing mixins (`panelAdaptiveLayoutMixin.js`,
    `cctvPanelMixin.js`, `radioPanelMixin.js`) — no behavior change.
    `ui.js` drops from 6,118 to 5,402 lines.
  - Navigation Authority (the camera-ownership generation/handoff system)
    and the Location Bar (city pill / POI / world-jump-transition /
    mini-status UI) moved out of `src/ui.js`'s `StyleManager` into a fifth
    prototype mixin, `src/navigationLocationMixin.js`, composed back in the
    same way as the four existing mixins — no behavior change. Orbit mode
    and `setOrbit()` stay in `ui.js` (same rationale as `setContextMode()`
    staying behind for the Context mixin: it's a distinct concern that only
    reads the navigation/location fields, not a part of navigation/location
    itself). `ui.js` drops from 5,402 to 4,916 lines.
  - `regionalBriefProxy()`/`weatherEffectsProxy()` and their fetch/cache
    helpers moved out of `vite.config.js` into
    `src/data/regionalProxyHandlers.mjs`; `vite.config.js` re-exports the
    two symbols `src/data/regionalProxy.test.mjs` imports directly, and
    imports back the shared Nominatim request queue so
    `nominatimSearchProxy()` (which stays in `vite.config.js`) keeps
    sharing one throttle with the moved reverse-geocode path, matching
    prior behavior exactly.
  - `.gitattributes` now routes new `docs/media/**/*.gif`/`*.png` through
    Git LFS (existing history is untouched — this only stops the repo
    growing further on new media); see `CONTRIBUTING.md` for the
    one-time `git lfs install` contributors need before adding new media.

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

- **New keyless basemap: Esri Dark Gray Canvas.** A muted, dark-styled ArcGIS
  Online basemap alongside the existing Esri Satellite/Bing/OSM/Google 3D map
  stacks — no API key required, pairs well with the app's HUD visual styles.
  Available as a chip in the bottom MAP SOURCE tray, via voice ("dark gray" /
  "dark mode" / "esri dark gray"), and via `set_map_stack`'s `esri-dark-gray`
  value. Falls back to OSM automatically if Esri is unreachable, same as the
  existing Esri Satellite stack.
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
- Moved `src/cameraVerbs.js`'s `fly_route` cinematic dolly state machine
  (`createRouteFlight`/`advanceRouteFlight`, and every route-only tuning
  constant, scratch Cesium object, and helper they alone use — `arcPoint`,
  `horizontalChord`, `signedTurnRad`, `routeCorridorCells`,
  `warmRouteCorridor`, `routeColdSeedFloorM`, `acquireCorridorFloor`,
  `probeMeshFloorM`) to a new sibling module, `src/cameraVerbsRouteFlight.js`.
  A pure relocation, not a refactor: the state machine already took an
  explicit `state` object as its first argument before the split, so no new
  closure/factory pattern was introduced. `cameraVerbs.js` re-exports every
  moved symbol `routeCinematics.test.mjs` imports from it, so no test or
  external import changed. `ROUTE_M_S` (the speed-word lookup) is exported
  from the new module and re-imported into `cameraVerbs.js`, since `flyRoute`
  there still validates the speed word against the same table — single
  source of truth, same pattern used for `DEFAULT_MOVING_SOLVE_MS` in the
  `worldOverlay.js` split below. `cameraVerbs.js`'s tick loop, `_active`
  motion slot, orbit/pan/tilt/rotate verbs, and `flyRoute` itself stay put.
  `cameraVerbs.js`: 1007 → 426 lines. New `cameraVerbsRouteFlight.js`: 632
  lines.

### Changed

- **Tuned the Google Photorealistic 3D Tileset's level-of-detail settings**
  for better GPU headroom when many data layers are active at once
  (`maximumScreenSpaceError: 24` instead of Cesium's untuned default of 16,
  `dynamicScreenSpaceError: true` pinned explicitly). Trades a small amount
  of distant-tile crispness for lower GPU load under combined fleet-3D-model
  + detection-overlay + post-process-style usage — see
  `docs/CURRENT-STATE.md`'s new "Photoreal tileset LOD tuning" note. Esri/
  OSM/Bing basemaps are unaffected.
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
- **Returning sessions and rich share links now restore layers through a
  concurrency-limited, light-layers-first queue instead of loading
  everything at once.** Previously, a returning user (or a share-link
  recipient) with most/all data layers enabled had every one of them start
  its full init/enable sequence simultaneously — CCTV cold activation,
  satellite TLE fetches, and the bundled local datasets all firing in the
  same tick. Light layers (flights, military, earthquakes, traffic,
  military-installations, military-awareness) now restore first, with a cap
  of 4 concurrent in-flight restores; heavier layers (CCTV, satellites,
  radio, the bundled local-* datasets, submarine cables) fill in behind the
  cap. Sessions with 4 or fewer enabled layers see no change in behavior.

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
