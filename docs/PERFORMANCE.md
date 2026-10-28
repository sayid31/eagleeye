# Performance baseline

This page records one hardware-rendered Apple M5 comparison captured on 22
August 2026 in Chrome 150 at 1440 x 900. It is not a minimum hardware
specification and should not be used to predict performance on untested systems.
The original capture artifacts are not included here, so this page records
results rather than defining a runnable benchmark.

The 22 August 2026 capture below remains the record for that date and machine
and is not re-run or revised. One part of this page *is* now runnable: the
boot baseline in [Runnable boot baseline](#runnable-boot-baseline-28-october-2026)
comes from `npm run qa:boot-timing`, which anyone can repeat against their own
build. Everything above that section is still a recorded result only.

## Test context

The baseline was captured on 22 August 2026 with these conditions:

| Setting | Value |
| --- | --- |
| Renderer | Apple M5 Metal through the hardware ANGLE path |
| Browser | Chrome 150 in a fresh isolated profile |
| Viewport | 1440 x 900 at device pixel ratio 1 |
| Focus | Page foregrounded for controlled scenes |
| Scene sample | 5 seconds of scripted motion, then 5 seconds at rest |
| Startup | Browser cache disabled; three samples |

The capture covered three startup samples, 16 cold layer scenarios with 14
measurements, 23 controlled option and stress scenes, and five
hardware-rendered overlay scenes.

## Startup

| Sample | App ready | Initial settle | Load event | Motion / rest | Used JS heap |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 784.980 ms | 2,035.082 ms | 439.5 ms | 60 / 60 FPS | 102.9 MiB |
| 2 | 604.849 ms | 1,855.836 ms | 442.4 ms | 60 / 60 FPS | 111.6 MiB |
| 3 | 558.527 ms | 1,809.592 ms | 438.8 ms | 60 / 60 FPS | 105.1 MiB |
| Median | 604.849 ms | 1,855.836 ms | 439.5 ms | 60 / 60 FPS | 105.1 MiB |

The initial-settle measurement is the more useful launch reference because it
includes the first visual and data settling window. All three samples reached
the display ceiling during both motion and rest.

## Cold layer activation

Cold activation was measured separately from warm option switching. Live object
counts are included so that future runs can compare source populations before
attributing a difference to the client.

| Layer | Activation | Source count | Motion / rest | Used JS heap |
| --- | ---: | ---: | ---: | ---: |
| CCTV city | 19,608.240 ms | 48 | 60 / 60 FPS | 192.7 MiB |
| Space Missions (report label: Rocket missions) | 3,581.066 ms | 26 | 60 / 60 FPS | 131.3 MiB |
| Radio | 3,458.709 ms | 750 | 60 / 60 FPS | 124.8 MiB |
| Bikeshare | 2,069.498 ms | 633 | 60 / 60 FPS | 157.4 MiB |
| Datacenters | 817.693 ms | 4,362 | 59.6 / 60 FPS | 328.2 MiB |
| Flights | 667.671 ms | 247 | 60 / 60 FPS | 118.4 MiB |
| Submarine cables | 614.727 ms | 2,629 | 60 / 60 FPS | 412.0 MiB |
| Military Flights | 557.113 ms | 68 | 60 / 60 FPS | 118.4 MiB |

CCTV had the largest cold activation cost in this capture. Submarine cables
used the most heap, followed by datacenters. Completed single-layer samples
generally reached 60 FPS, so activation time and heap separate these cases more
clearly than steady-state frame rate.

## Aircraft, detection, and Cockpit

| Scene | Motion / rest |
| --- | ---: |
| Idle globe | 60 / 60 FPS |
| Flights, 2D | 60 / 60 FPS |
| Flights, 3D proximity | 60 / 60 FPS |
| Flights, all 3D models | 60 / 60 FPS |
| Military Flights, all 3D models | 60 / 60 FPS |
| Detection at 25% | 39.3 / 41.1 FPS |
| Detection at 50% | 37.4 / 39.8 FPS |
| Detection at 100% | 34.4 / 35.5 FPS |
| Cockpit | 49.6 / 49.2 FPS |

The clean detection scenes processed 8,169 to 8,170 observations. Selected
labels rose from 14 at 25% density to 28 at 50% and 56 at 100%. The aircraft
rows came from an earlier loaded, foreground-controlled pass because the clean
rerun received no live aircraft rows.

## Visual styles and combined stress

| Scene | Motion / rest |
| --- | ---: |
| Normal | 60 / 60 FPS |
| CRT (report label: Retro) | 60 / 60 FPS |
| NVG (report label: Surveillance) | 60 / 60 FPS |
| FLIR (report label: Thermal) | 49 / 60 FPS |
| Anime | 60 / 59.8 FPS |
| Noir | 47 / 56.6 FPS |
| Snow | 42.3 / 45.8 FPS |
| Combined static | 57.6 / 60 FPS |
| Combined operational | 39.9 / 43.1 FPS |

The combined static scene rendered 11,575 objects, used 872.2 MiB of JavaScript
heap, and issued 48,665 text draws during motion and 54,106 at rest. The combined
operational sample contained 3,909 observations and two selected labels, but its
live aircraft and traffic rows were empty, so it remains a limited stress case.

Snow, Noir, dense detection, and text-heavy combined layers are the clearest
controlled comparison points for later optimization work.

## Keyed live sources

NASA FIRMS, AISStream, and TomTom were captured in a separate hardware-rendered
pass. The page was visible but was not the focused window, so these frame rates
must not be compared directly with the foreground-controlled scenes above.

| Source | Point-in-time population | Activation or coverage | Motion / rest |
| --- | ---: | --- | ---: |
| NASA FIRMS | 100,430 detections in 3,557 cells | 30.0 s activation | 32.1 / 55.2 FPS |
| AISStream | 12,000 vessels | 6.4 s activation | 22.1 / 29.8 FPS |
| TomTom Traffic | 4,222 road dots | 70% coverage, 2 decoded tiles | 45.0 / 51.7 FPS |

These populations change continuously. A future comparison must record the
live counts again and match the focus conditions.

## Runnable boot baseline (28 October 2026)

Unlike every section above, this one is reproducible:

```bash
npm run build
npm run preview                                   # the BUILT app is the target
npm run qa:boot-timing -- --runs 5                # add --url if preview took another port
```

The app emits `performance.mark`/`measure` entries under a `boot:` prefix in
production, and the harness reads them from the browser. It reports numbers and
never passes or fails on a duration — a boot-time budget would turn a
deliberate hold into a regression. Captured on the same Apple M5 as the August
run, Chrome 145 via Puppeteer at 1280 x 800, browser cache disabled, a fresh
browser context per run, median of five.

Rows marked **deliberate** are recorded decisions, not defects: the photoreal
tileset await (`docs/DECISIONS.md` 2026-10-05) and the share-restore hold plus
camera flight (2026-10-08). The label travels with the number so a reader does
not re-litigate a landed decision from a table row.

### Cold first load, no hash

| Phase | Median | Range |
| --- | ---: | --- |
| eager-eval (timeOrigin → first line of our code) | 1,426.4 ms | 1,015.3 – 1,783.9 ms |
| bootstrap | 108.7 ms | 47.1 – 192.3 ms |
| viewer | 81.8 ms | 49.7 – 104.7 ms |
| photoreal **(deliberate — 2026-10-05)** | 1,453.2 ms | 1,013.2 – 1,828.3 ms |
| mapstack | 354.2 ms | 337.5 – 567.5 ms |
| ui | 34.0 ms | 32.1 – 55.9 ms |
| data-registration | 1.9 ms | 1.7 – 2.2 ms |
| **TOTAL to interactive** | **2,041.6 ms** | 1,655.7 – 2,550.0 ms |
| **TOTAL to splash lifted** | **2,377.6 ms** | 1,924.7 – 2,799.5 ms |

Phases overlap rather than summing to the total: `photoreal` and `mapstack` sit
inside the window `bootstrap` opens.

### Reload carrying a share hash

Per `docs/DECISIONS.md` 2026-10-08 every reload of the same tab is a share
restore, so this is the common case rather than the exotic one. The harness
replays the hash the app itself wrote, so the real serializer is exercised.

| Phase | Median | Range |
| --- | ---: | --- |
| eager-eval | 918.6 ms | 842.0 – 1,205.1 ms |
| bootstrap | 40.5 ms | 34.3 – 54.0 ms |
| viewer | 57.4 ms | 49.8 – 90.9 ms |
| photoreal **(deliberate — 2026-10-05)** | 1,644.9 ms | 1,094.9 – 2,815.9 ms |
| mapstack | 333.5 ms | 283.5 – 461.6 ms |
| ui | 35.0 ms | 31.1 – 37.3 ms |
| data-registration | 1.5 ms | 1.3 – 1.7 ms |
| share-wait **(deliberate — 2026-10-08)** | 1,501.9 ms | 1,500.4 – 1,551.8 ms |
| share-camera **(deliberate — 2026-10-08)** | 3,022.6 ms | 3,013.4 – 3,098.4 ms |
| layer-restore | 0.2 ms | 0.1 – 0.2 ms |
| **TOTAL to splash lifted** | **6,647.4 ms** | 6,213.6 – 7,844.8 ms |

**The two deliberate holds are 4,524.5 ms of the 6,647.4 ms reload — roughly
68%.** They are also the two tightest rows in the table, which is what a fixed
timer looks like when measured. Layer restore is 0.2 ms and every individual
layer row reads 0.0 ms, because enabling a saved layer only arms its own
loading path; the layer's own fetch finishes behind the lifted splash, by
design.

### Candidate evidence the app cannot self-report

| # | Candidate | Measured |
| --- | --- | --- |
| 1 | Parser-blocking Cesium bundle | `/cesium/Cesium.js` reports `renderBlockingStatus=blocking`, 5.46 MiB decoded, 311.3 ms — the browser's own classification, not a reading of the HTML |
| 2 | Lazy layers leaking into the eager chunk | entry chunk 1,239 KiB decoded, 115.6 ms |
| 3 | Preload hints | `link[rel=modulepreload]` count is 0 in the live document |
| 4 | The reload holds | the two `deliberate` rows above |
| 5 | Proxy cache headers | 4 `/api/*` responses in a whole boot: `no-cache` on `/api/setup/status`, no `cache-control` at all on `/api/realtime/debug-log`, `no-store` on `/api/google/nearby-places` |
| 6 | Offline caches | `serviceWorkers=0`, `cacheStorageKeys=0` — refuted by measurement, not by absence of a grep hit |

Navigation timing for the same run: `responseEnd` 6.0 ms, DOMContentLoaded
1,114.2 ms, `load` 1,325.6 ms.

Candidate 5 is narrower than expected. The near-universal `no-store` across
`src/data/*Proxy.mjs` is real in the source, but a boot only reaches four
`/api/*` routes, so those headers cost nothing at startup — they would matter
to a session that re-enables layers repeatedly, which this capture does not
cover.

## Controls for a future capture

Use the same controls before attributing a difference to the application. The
right-hand column marks which ones `scripts/qa-boot-timing.mjs` enforces on its
own; the rest still have to be arranged by whoever captures.

| # | Control | Enforced by the boot harness |
| --- | --- | --- |
| 1 | Record the exact GPU renderer and reject software-rendered or unavailable GPU strings. | No — record it alongside the run |
| 2 | Use a 1440 x 900 viewport at device pixel ratio 1 and keep the page focused. | Partly — it pins 1280 x 800; a headless page is never the focused window |
| 3 | Measure cache-disabled startup separately from cold layer activation and warm option switching. | Yes — `setCacheEnabled(false)` and a fresh browser context per run |
| 4 | Repeat startup three times and compare medians. | Yes — `--runs` defaults to repetition and reports medians |
| 5 | Sample each option for 5 seconds in scripted motion and 5 seconds at rest. | No — out of scope; this harness measures boot, not steady state |
| 6 | Record live object counts before attributing a difference to the client. | No — but per-layer phase marks attribute a slow restore to a layer |
| 7 | Treat a live-source outage as missing coverage, not as evidence of low client rendering cost. | Partly — a phase that never fired is named in `missing` rather than omitted, and a run with console errors is never published |

Two further controls the harness adds, both because a number from the wrong
target is worse than no number: it refuses to publish a baseline from a dev
server unless `--allow-dev` is passed (Vite serves Cesium as a module graph, so
the blocking-script cost measured above is invisible there), and it discards any
run that logged a console error.

## What is not established yet

- This report does not establish Windows performance.
- The report does not record machine memory capacity, so it cannot support a
  minimum-memory recommendation.
- The report does not cover other GPU renderers or viewport configurations.
- Military Installations is outside this comparison because it requires close
  camera context.
- The keyed pass has no controlled rerun suitable for comparison with the
  option scenes.

The boot baseline adds four limits of its own. It is captured against
`vite preview` on localhost, so it establishes none of:

- Real-network or CDN latency. Localhost has none, so upstream costs — the
  Overpass mirror queue of `docs/DECISIONS.md` 2026-10-27, where a first
  uncached road load can legitimately take tens of seconds — are measured as
  this machine's path rather than a user's.
- GPU tile streaming on other hardware. `PHOTOREAL_MAXIMUM_SCREEN_SPACE_ERROR`
  is a hardware-dependent trade, so the `photoreal` row is one machine's.
- HTTP/2 or HTTP/3 multiplexing, which `vite preview` does not do. A real
  deployment fetches the blocking Cesium bundle and the entry chunk under
  different connection behavior.
- A genuinely cold operating-system or browser disk cache. Disabling the HTTP
  cache is not the same as a first-ever visit on a cold machine.

Use this page as a regression baseline for one known hardware and browser
configuration, not as a compatibility guarantee.
