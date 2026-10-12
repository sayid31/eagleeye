# Design Decisions & Rationale Log

This file is the historical WHY behind non-obvious thresholds, algorithms,
and behaviors in EagleEye View — read it when you need to know why a value
or design is what it is. For what the system currently does, read
`docs/CURRENT-STATE.md` instead; that file is present-tense only and does
not carry this kind of dated narrative.

## 2026-10-08 — CCTV: self-healing HLS player and honest playback status

**Decision.** `attachHlsJs` delegates to `createHlsSelfHeal`
(`src/data/cctvHlsSelfHeal.js`): in-place recovery first, then destroy and rebuild
the player with exponential backoff instead of giving up for good. Network
recovery calls `loadSource(url)` instead of `startLoad()`. The runtime records
the player state and the plane/badge show it instead of the health message.

**Why.** Reports of "status ok but live not shown" on active cameras. `ok` is set
from the playlist fetch only, so it says nothing about decoded video; the plane
then painted "Live stream connected" over black. Separately the old handler
destroyed the player after the recovery budget with no re-attach, so one bad
minute meant black until reselection.

**Why `loadSource` over `startLoad`.** `startLoad()` resumes from the last
playhead; on these 7-30 s live windows that position has usually left the
playlist, giving a segment 404 hls.js will not retry. `loadSource` is the same
clean restart the tab-return reload already uses (`cctvHlsVisibility.js`).
Suspected from hls.js source and one Denpasar 404 (`seg3537` vs live edge ~3650);
not reproduced in a browser, so treat the restart choice as unproven mitigation.

**Why the backoff is slower for `offline` sources.** A provider-removed feed will
not come back in seconds; probing it every 2-30 s only adds proxy load.

**Follow-up (same day): empty playlists.** The owner saw `WAITING FOR VIDEO` for a
long time on `bmtol-unofficial-jakcik-km-67-000`. Cause: `jmlive.jasamarga.com`
answers every playlist request with 200 and 0 bytes (or 502); the proxy still wrote
`ok`, and neither hls.js nor a native `<video>` raised a fatal error, so `connecting`
never ended. Fixes: the proxy validates `#EXTM3U` before writing `ok`; the player
treats `HLS_CONNECT_TIMEOUT_MS` (20 s, above the slowest measured segment fetch of
14 s) without a buffered fragment as "no data" and rebuilds. Why the source is
empty is unknown (server down vs. blocking outside clients); headers (Referer,
Origin, User-Agent, Accept) made no difference. These cameras are not marked
`offline`: the cause is not proven permanent. Whether Chrome 150 plays HLS natively
(which would bypass hls.js) was not verified; the native watcher covers both.

**Not done.** Remaining proxy hardening (timeouts on `/media/:id` and `/rel`, retry on a
refused connection, zero-byte segment to 502, `/rel` failures into health) is a
separate change. Whether zero-byte segments stall hls.js is still unproven.

## 2026-10-08 — CCTV: a dead source is `offline`, not `degraded`

**Decision.** `/api/cctv/media/:id` writes health status `offline` (not
`degraded`) when the provider answers 404/410 or the host is unresolvable
(`ENOTFOUND`/`ECONNREFUSED`); the panel badge says `CAMERA OFFLINE · SOURCE DOWN`.

**Why.** Dead Bandung feeds (HTTP 404) and "playing but mislabelled" feeds both
showed the same `UPSTREAM · DEGRADED`, so the owner read provider outages as app
bugs. A separate status lets the UI say whose fault it is.

**Why only 404/410 and DNS/refused.** 5xx, 401/403/429 and timeouts are
indistinguishable from a transient or throttled upstream; calling those "offline"
would hide recoverable problems and mislead. Unproven cases stay `degraded`.

**Also fixed.** The media-type check was `contentType.includes('mpegurl')`,
case-sensitive, so the Pelindung type `application/x-mpegURL` was flagged
"Unexpected media type" even though the manifest branch (case-insensitive)
played it. Both now share `isManifestContentType`.

**Not done (unproven).** Zero-byte / in-place-overwritten ring-buffer segments
on the Pelindung servers may stall hls.js; not reproduced in a browser, so the
proxy is unchanged for them.

## 2026-10-01 — Large files split into small modules; track-regression timing made frame-adaptive

Sixteen files of 1,700–5,400 lines (`cctv`, `flights`, `militaryFlights`,
`rocketLaunches`, `traffic`, `satellites`, `radio`, `aisLiveVessels`,
`militaryAwareness`, `worldOverlay`, `gevRealtime`, `cockpitViewController`,
`manager`, `ui`, `gevActions`, `annotationResolver`) were split with no
behavior change. The goal was that a future change reads one small module,
not a whole file. Moving pure helpers out was tried first and rejected:
`cctv.js` only fell to ~4,150 lines because 58 module-level `let` variables
were shared across every cluster.

- **State into `S`.** Layers are object-literal singletons without `this`, so
  mixins do not apply. Module-level `let` state moved into one exported
  object (`<layer>State.js`) and `_x` became `S._x`, mechanically and scope
  aware; after that, functions move to any module that imports `S`. Cost is
  one property lookup on a monomorphic object in hot paths such as the 12 Hz
  fleet tick, which is not measurable. Classes keep the repo's existing
  mixin pattern instead.
- **What stays whole.** `DataLayerManager`'s toggle/lifecycle state machine
  stays in `manager.js` (1,121 lines) because the race-guard ordering is the
  documented bug class. The `StyleManager` constructor stays in `ui.js`
  (809 lines): splitting it into ordered `_initXxx()` methods would change
  the constructor's shape, and its order carries invariants ("before style
  stages", "before panel chrome"), for a gain judged not worth that risk.
- **Equivalence proof.** Each split was checked by moving code verbatim
  (position slices, not rewrites), a free-variable scan of every module, a
  standalone `import()` of each module, and an esbuild bundle comparison,
  then `npm test` and `npm run build`. The one-shot codemods are kept in
  `archive/split-codemods-2026/` for traceability; their paths and `--write`
  behavior make them unsafe to rerun without manual review.
- **Why `test:track` showed 2–9 failures at machine load above 8, on the
  unsplit build as well.** The harness assumed a render rate the headless
  SwiftShader browser does not have. Frame windows allowed 1.5 s per frame
  and `__dfSettle(900)` waited 900 ms of wall clock, but a frame takes
  0.5–5 s under load (measured median 1.3–2.1 s) and only 1 frame rendered in
  900 ms, so windows timed out (`frames=18/30`) and `display-floor`
  assertions read a stale, not-yet-recomputed value. Windows now allow 10 s
  per frame and settle waits for 4 real frames; assertions are unchanged.
  Three consecutive runs at load 9–11 passed 108/108.

## 2026-08-23 — First-run mission launcher

`src/firstRunExperience.js` (`#first-run-launcher`, styles at the tail of
`style.css`). After startup
settles, a fresh session gets one card offering **Live Contacts · Space
Missions · Environmental · Explore manually**. No layer and no optional API
call happens until a tile is clicked. The right-hand DISPLAY rail
(`pp-toggles`) now starts **collapsed** on a first run rather than expanded —
a stored collapse state still wins, as before.

**The ENVIRONMENTAL tile is quakes AND fires** — live USGS earthquakes plus
NASA FIRMS active fires (`layerIds: ['earthquakes', 'local-firms']`), with the
tile subcopy naming both. **The launcher optimizes for the fully configured
experience:** it does not trim what it offers down
to the lowest-configured install. The mission does not branch on whether a key
is present — everyone gets the same tile.

Keyless, the honest surface is the **layer row**, which reads
`UNAVAILABLE · NASA FIRMS · LIVE · KEY REQUIRED`, and the earthquakes half
still delivers in full. The shared loading reducer now treats an explicitly
declared missing optional key as a configured terminal state rather than a
failed multi-layer mission, so the global chip completes without showing
`LOAD FAILED`. A genuine lifecycle or fetch failure still retains failure
priority.

**Acceptance changed with that ruling (2026-08-23).** `qa-firstrun` no longer
asserts "a keyless Environmental never shows a failure chip" — that stopped
being a launch requirement when the tile went back to promising both feeds.
The Environmental section now **branches on the observed key state** and says
which branch it took: KEYED asserts both datasets actually arrive and that no
LOAD FAILED banner appears while the mission runs; KEYLESS asserts the
layer-row honesty (`KEY REQUIRED`), the quakes half loading, and that the
deliberate missing-key state never becomes a global failure.

**An INFRASTRUCTURE tile is deliberately absent.** It was built, playtested,
and cut: one click enabling `local-datacenters` + `local-dams` +
`telegeography-submarine-cables` puts ~5,700 entities on a full-earth view and
the frame rate goes with them. The layers are unchanged and still reachable by
hand and by voice ("infrastructure mode" is still mapped). Do not re-add the
tile before the bundled-infra globe-LOD declutter lands — that is the real
fix, and it is post-launch work.

**Show policy — it is NOT one-shot.** Precedence, highest first: a share link
never sees it → `?welcome=0` suppresses → `?welcome=1` replays (past both
suppressions, for demos/support) → the durable
`localStorage['gev:first-run-mission:v1'] === 'suppressed'`, written **only**
by the "Don't show this again" checkbox → the per-session
`sessionStorage['gev:first-run-mission-session:v1'] === 'dismissed'`, written
by **every** close path (mission, Explore, ESC). So it returns each fresh
browser session until the visitor ticks the box; clearing storage un-ticks it,
which is accepted. Both stores fail open — an unreadable store still shows the
launcher rather than silently swallowing first launch.

**What a mission may persist (do not "simplify" this).** Layer enablement is
durable in this app (`gev:layer-state:v2`, written by
`LayerStateCoordinator._commitExplicit` only for origin `user`/`voice`/`tool`).
A mission enables **its own** layers at `origin: 'user'` — durable, exactly as
clicking those rows is, because picking the mission *is* that choice. The two
Context missions also expand the Context panel, as the visible tabs do; the
globe missions open no panel. Everything else is off limits: detection
mode/density, `gev:detection-allocation:v1`, 3D models, feather, and above all
`_detectionUserOverridden` — setting that flag means "the operator hand-edited
detection" and would silently disable the CRT/NVG/FLIR auto-preset contract for
the session. The full table is a comment block in the module and is pinned by
`src/firstRunExperience.test.mjs`.

**Voice is instruction-only.** Both globe missions are expressible with
shipped tools (`set_layer_visibility`'s enum already carries
`local-datacenters`, `local-dams`, `telegeography-submarine-cables`,
`local-firms`, `earthquakes`; `zoom_to_globe` supplies the camera), so
`GEV_REALTIME_TOOLS` is **byte-identical to `main`** and pinned by sha256 in
the unit suite. One instruction paragraph in `vite.config.js` teaches the
phrase mapping; deleting it is the complete rollback.

**ESC arbitration — three rules, do not collapse them into one.** (1) The
launcher **yields**: a MutationObserver watches `body` for the surfaces that
take the screen (`cockpit-mode`, `scene-playback-mode`, `recording-mode`,
`ui-clean-view` — `EXCLUSIVE_SURFACE_CLASSES`, kept in step with the CSS hide
rule by a unit pin), and session-dismisses rather than contesting the key; if
one is already up at init it **waits** instead of appearing over it. (2) A
surface can take the screen with **no class to watch** — the Cesium attribution
lightbox is full-screen at `z-index: 200` against the card's `175`, which left
the launcher measurable (`getClientRects()` non-empty) and buried, so ESC
dismissed a card nobody could see and burned the session flag. `isTopmost()`
therefore also **hit-tests the card's own centre** with `elementFromPoint`; any
overlay, classed or not, disarms the handler. Every inconclusive answer counts
as uncovered, so the guard can never be why ESC stops working. (3) A small
control that claims only the **key** (a disclosure, a popover) is not something
to yield to: whoever handles ESC first calls `preventDefault()` **and**
`stopImmediatePropagation()`, and the launcher skips `defaultPrevented` events.
`stopPropagation()` alone does **not** stop later listeners on the same
`document` — that is exactly how the compact Radio disclosure made one key
close the disclosure *and* dismiss the launcher.

**Accepted:** a surface class that never clears means no launcher for that page
load, with no timeout. None of the four classes is restored at startup, so an
already-blocked init is an error path, while a long recording or clean-view
session is ordinary — a "reveal anyway" timer would trade a benign no-show for
the card punching through a recording in progress. The no-show is benign: the
handler is inert, no session flag is written, the observer still reveals the
card if the class clears, and it returns next session either way.

**Blocked storage un-ticks the box.** "Don't show this again" is a claim about
the future, so a refused `setItem` reverts the checkbox and says so in the
status line instead of showing a saved preference that was never saved.

Gates: `node scripts/qa-firstrun.mjs --url <app>` (in-app checks across eight
independent sections) plus its `--teeth` negative control, which removes
the launcher and requires EVERY launcher-dependent section to go red — it
always exits non-zero, `1` meaning the control is healthy and `2` meaning it
is not. Plus the unit pins above.

## 2026-08-08 — Performance waves 1+2 — render governor and scope mask

The app idles via an explicit render
governor (`src/renderGovernor.js` — hold/release from every per-frame
animator; discrete mutators call `governorRequestRender`). Any NEW
per-frame visual animation MUST register a hold; any new discrete scene
mutation MUST request a frame — `scripts/qa-perf.mjs` is the gate. The
circular scope is an explicit canvas (`src/scopeMask.js`, DISPLAY-rail
SCOPE toggle + FEATHER slider, hash keys `sc`/`scf`) — it is NOT the
six zero-intensity style stages anymore (those are disabled; see the
history note in `_initStages`). Hidden tabs stop the render loop.
The scope's OUTSIDE terminus is **altitude-adaptive** (2026-08-17): 0.94
at/above **10 Mm**, so
faint stars survive in the corners of a TRUE full-globe view, fading quickly
(smoothstep) to fully opaque by **7 Mm** — every working altitude below that
is solid black, because there the same 6% bleed reads as smeared geometry.
FEATHER is unaffected by the terminus ramp and there is NO new slider (its own
default later moved 35 → 0 on 2026-08-22, 0 → 8 on 2026-08-23, and 8 → 11 at
the 2026-08-24 final lock; see Current
Global Post Defaults); hash key
`sce` pins the terminus and is **clamped to 94..100 on BOTH parse and write**
(out-of-range clamps into the band; absent or non-numeric = the adaptive
default), so a shared link can neither freeze the ramp by accident nor carry
an unsupported sub-94 terminus. Repaints are gated on a quantized 0.005 alpha
step, so a full 20 Mm→ground descent costs 12 canvas repaints (the alpha span
sets that, not the altitude span) and a parked camera costs zero. That
quantization also means the PAINTED value plateaus at each end of the band:
measured, the painted terminus stays 0.94 from the top of the band down to
~9.63 Mm (first step), and is solid black from ~7.37 Mm (last step) rather
than exactly at the 10 Mm / 7 Mm clamp heights. SCOPE OFF costs less still:
no height sampling and no canvas work after the single clear on the disable
transition. The hard-crop (FEATHER 0) path honors the same terminus.

## 2026-09-17 — Performance wave 3 — conditional render holds on ais-live-vessels, traffic, satellites, rocket-launches replay

Conditional holds landed on `ais-live-vessels`,
`traffic`, `satellites`, and the `rocket-launches` mission-replay mode.
Waves 1+2 stopped a handful of animators from holding continuous render
forever; this wave applies the same "hold only while genuinely needed"
discipline to four more layers that had been holding unconditionally for
their entire enabled lifetime — the same class of cost `renderGovernor.js`'s
own header quantifies (~60% GPU / ~54% of a CPU core with ZERO layers
enabled and a parked camera, before the governor existed). Each follows the
`militaryAwareness.js` shape: a pure predicate evaluated on an existing
cadence (no new polling loop), feeding a `sync<Layer>RenderHold()` that
acquires/releases the hold; `enable()`/`init()` call it once immediately so
a layer enabled with something already visible does not wait a tick to
hold; `disable()`/`destroy()` keep their unconditional release as a hard
backstop.
- **`aisLiveVessels.js`** — AIS billboards don't dead-reckon between polls
  (positions are written directly from the latest fix and held static), so
  the only genuine per-frame need is the existing focus/de-emphasis
  transition. `syncAisRenderHold()` reuses the file's own
  `focusPassIsNeeded(focusTarget, activeFocusCount)` predicate (already
  imported from `focusDeemphasis.js`) and runs at the top of
  `updateVisibility()`. A poll landing while idle still requests a frame
  explicitly (`governorRequestRender('ais-vessels-poll')`) so a background
  update is never invisible until an unrelated camera nudge repaints it.
- **`traffic.js`** — `trafficNeedsContinuousRender({ dotCount })` — dots only
  exist for the loaded/bounds-clamped viewport, so existence is already a
  reasonable on-screen proxy; `syncTrafficRenderHold()` runs at the end of
  `animate()` every tick. Checked and accepted as harmless: `dot.t`'s
  capped-`dt` motion resumes seamlessly (no teleport) if `animate()` stalls;
  `dot.stoppedUntil`/`dot.creep.until` are absolute wall-clock timestamps
  that keep expiring in real time regardless, so a dot may resume from a
  stop a few seconds early — cosmetic only, on a dot that was off-screen the
  whole time it wasn't ticking.
- **`satellites.js`** — `satellitesNeedContinuousRender({ showPoints,
  anyPointOnScreen })`. The on-screen scan piggybacks on the EXISTING
  `_propagateAll()` 1 Hz cadence (200 ms while tracking) rather than adding
  a second one; `_preRenderTick()` reads the cached boolean every frame at
  near-zero cost. Known, deliberately-uncollapsed overlap: while a specific
  satellite is tracked, `main.js`'s independent `'tracked-entity'` hold
  already keeps the scene continuous, making this layer's own hold
  redundant during tracking — commented in source so it isn't "fixed" into
  a bug later.
- **`rocketLaunches.js` (carve-out only)** — mission **replay** is a
  discrete, explicit opt-in mode (same shape as `cctv.js`'s `cctv-adjust`
  calibration hold), so it got its OWN hold, `'rocket-replay'`, acquired in
  `startMissionReplay()` and released in `stopMissionReplay()` — every one
  of that function's 11 call sites funnels through it, so no other call
  site needed a direct edit. The layer-wide `'rocket-launches'` hold in
  `enable()`/`disable()`/`destroy()` is unchanged by this carve-out.
  `updateMissionFrame()`'s own unconditional per-frame horizon-occlusion
  sweep is explicitly OUT OF SCOPE for this wave — deferred to its own pass
  with dedicated pan/zoom/rotate visual QA, since it shares the
  `percentageChanged` camera knob `traffic.js` already flags as a
  cross-layer footgun.
- **Explicitly NOT touched this wave: `flights.js` / `militaryFlights.js`.**
  Both still hold unconditionally. `detectionRenderDemand.test.mjs` pins a
  regression, *"aircraft brackets stay prompt because the aircraft layers
  hold the render loop"*: detection paints its HUD AIR brackets from live
  aircraft positions every frame and takes no part in detection's own
  change-notification system, so the only reason a bracket doesn't go stale
  on a parked scene is that the aircraft layers force continuous repaint for
  unrelated reasons. A parked aircraft at a gate still needs its bracket
  kept fresh, so a "genuine on-screen motion" predicate does not coincide
  with detection's actual need — fixing this properly means giving
  detection its own per-object delta signal (real, separate design work),
  not just gating the existing hold. Left alone on purpose, given this
  territory's own documented history of four prior tracked-camera
  regressions (`track-regression.mjs`'s own comment) and its harder,
  tolerance-based `npm run test:track` gate.
- Verification for the four changed layers: new predicate/governor-wiring
  tests per layer (`aisLiveVessels.test.mjs`, `traffic.test.mjs`,
  `satellitesRenderHold.test.mjs` + `satellitesVisibility.test.mjs`,
  `rocketLaunchesRenderHold.test.mjs`); full `npm test` and `npm run build`
  green; `npm run test:track` run twice post-change, 107/108 passing both
  times with the one failure landing on a DIFFERENT assertion each run,
  both inside the unrelated flights/military ground-floor height-sampling
  section (`display-floor/corridor`, `display-floor/regime`) — consistent
  with pre-existing headless-SwiftShader timing flakiness the harness's own
  comments already document, not a regression from this wave's layers.

## 2026-08-23 — "Never answered yet" is a third state, distinct from empty

`sourceState` in `src/data/militaryAwareness.js` treats a dependency that is
  busy AND has never produced an answer (`loading === true && !lastUpdate`) as
  unavailable, so the Contacts panel prints `?` and voice says "unknown". This
  is deliberately NOT "busy": a source that has answered once keeps its real
  count through every later refresh poll. It is a CONTRACT over the whole
  dependency list rather than a fix for one layer, and the dependencies reach
  it by different routes:
  - **AIS vessels is its reachable producer.** `enable()`/`update()` both
    resolve as soon as the first `/api/ais-live` poll answers, so the manager's
    lifecycle settles to `enabled` — but until the server-side socket delivers
    a position, `firstConnectPhase` stays `'loading'` and `getStats()` reports
    `loading: true`, `lastUpdate: null`, count 0, and an UNDEFINED status.
    Without the predicate that window prints an all-clear `0`.
  - **Mapped installations never reaches that window.**
    `militaryInstallations.enable()` is synchronous and the manager awaits
    `update()`, which owns the first Overpass fetch, so the lifecycle stays
    `enabling` for the whole fetch and the pre-existing `enabling` branch
    covers it. Confirmed live on :4272 across a held 17 s first fetch (34
    samples, `enabling` throughout, panel non-numeric) and across a failing
    one. Its `status: 'idle'` is not what saves it — the lifecycle is; the
    module has no `loading` status at all.

  Any new dependency that can be slow must report `loading` and `lastUpdate`
  honestly for the contract to hold, and must be pinned against the shape its
  own module really returns — a fixture that invents a status the module cannot
  emit guards nothing (that is exactly how a hole here survived a green suite).

## 2026-08-23 — A held ground snap is dropped when measured ground contradicts it

the WARM hold described below answers on DISTANCE travelled,
  which is only a proxy for whether the value still describes the ground. A
  contact can taxi ~200 m onto a different surface INSIDE the 250 m bound, and
  since a miss preserves the hold, nothing would ever correct the burial. So
  `heldSnapM` (`src/data/groundSnap.js`) also consults `cachedMeshFloor` at the
  contact's CURRENT position: a measured floor more than
  `HELD_SNAP_CONTRADICTION_M` (5 m) ABOVE the held value drops the hold and the
  contact is COLD again, back to the floored 2D billboard. The rule is
  ONE-SIDED on purpose — it targets BURIAL. A cell reading BELOW a real sample
  is the floor chain's expected under-read (one-shot latch over ~111 m,
  neighbours lean lowest, `displayFloorHeightM` only ever raises), not evidence
  of anything, and a two-sided cut was disproved on the track rig by a planted
  cell 66.7 m below a real sample at the same spot. Accepted residual, stated
  with its condition: a DOWNHILL taxi floats, and the only correction on this
  path is a SUCCESSFUL resample — nothing guarantees one. On the OSM fallback
  `sampleHeight` misses forever, so the float persists for as long as the
  contact stays inside the 250 m bound, with no timer beside it and no vertical
  cap of its own beyond whatever the ground drops within that radius. It is
  accepted because it errs UPWARD and stays visible. Three boundaries are
  load-bearing — that one direction, MESH cells only
  (`cachedGroundFloor`'s DEM fallback is a DIFFERENT surface; the skin/DEM
  spread is what `MESH_FLOOR_BELOW/ABOVE_PRIOR_M` budget 15 m / 80 m for) and
  the contact's OWN cell only (a neighbour ~111 m away may be a terminal roof —
  `neighborFloorM` leans lowest for that reason — and must never be borrowed to
  DISCARD a real measurement). Do not widen either without re-arguing both.

## 2026-08-23 — The trail's acceptance bar is visual

the trail terminates roughly BACK-CENTRE on the aircraft; MINOR hull overlap
  is acceptable; there is no conspicuous top, bottom or lateral protrusion; it
  is stable across headings; and a parked aircraft draws no moving head
  segment. That is the bar a future change is judged against — NOT sub-metre
  precision. The pins below are tighter than the bar on purpose, because a
  measurable property is what a test can hold, but a pin's tolerance is not the
  product requirement and tightening one is not an improvement to the picture.
  Measured on live traffic at the shipped transform, the airliner anchor sits
  24.09 m aft (70 % of the model's rendered envelope, so inside it), 2.22 m
  below centre (6 %), and 2e-9 m off the centreline.

## 2026-08-23 — The tracked trail attaches to REAL HULL, aft and below

`MODEL_TRAIL_ANCHOR_NATIVE` (`src/data/modelVisualAnchor.js`) holds, per GLB
  and in RAW glTF coordinates (see the transform-chain entry below), the point
  of the hull's CENTRELINE PROFILE (its y = 0 slice) closest to the aft-belly
  AABB corner. It is NOT the corner: a bounding-box corner is empty
  space, 4.80 m off the nearest triangle on `airplane.glb` and 6.14 m on
  `jet.glb`, so the trail ended in mid air beside the aircraft. The head segment
  is drawn from a point behind the aircraft to this anchor, so the anchor must
  stay aft (83–96 % of each aft extreme) or the segment enters at the tail and
  stops inside the fuselage. `modelScale.test.mjs` reads the POSITION BUFFERS —
  real vertices and triangles, because accessor min/max cannot tell a corner
  from a surface — and re-derives on-hull, aft, lowest-at-its-station,
  on-centreline, and the construction itself. Re-measure, never re-guess.

## 2026-08-23 — The trail anchor rides CESIUM'S transform chain, not a hand-rolled one

`MODEL_TRAIL_ANCHOR_NATIVE` stores RAW
  glTF coordinates and `modelAnchorWorld()` assembles
  `modelMatrix × components.transform × axisCorrection` — the same chain
  `ModelSceneGraph` renders with, built from Cesium's own exported
  `Axis.Y_UP_TO_Z_UP` / `Axis.Z_UP_TO_X_UP` and the model instance's own root
  transform. The anchors were previously PRE-CONVERTED by a single glTF
  Y-up → Z-up step (`[x,y,z]` → `[x,−z,y]`) and multiplied straight by
  `modelMatrix`; that is half the correction (the defaults also apply
  `Z_UP_TO_X_UP`, the complete mapping being raw `[x,y,z]` → `[z,x,y]`), and an
  aircraft's longitudinal axis is raw glTF X, so the aft offset landed on the
  RENDERED model's LATERAL axis. `modelMatrix` carries the heading, so both
  frames rotated together and the trail terminated a fuselage-length to one
  SIDE, swapping sides with the course. Measured live in each aircraft's own
  (aft, cross, up) frame: civil airliner (0.00, −81.47, −7.50) before,
  (81.47, 0.00, −7.50) after; rotorcraft (0.00, −73.67, −16.33) →
  (73.67, 0.00, −16.33). **Never pre-convert an anchor** — one transform,
  Cesium's, or a second hand-maintained convention drifts again. The pin sweeps
  headings 0/45/90/180/270/315 across every shipped asset plus a hovering
  rotorcraft and asserts NO lateral component, and it derives its reference axes
  from the ENU frame and the heading rather than through the function under
  test: the first version routed them through `modelAnchorWorld` and passed
  against the very bug it was written for, because a wrong transform rotates the
  anchor and its reference frame together.

## 2026-08-23 — A stationary contact draws no trail head, and the head end NEVER gives

grounded tracking starts a trail unconditionally, and on a
  contact that has not moved the last body point sits where the aircraft is — so
  the head segment became a line from inside the model out to its own anchor,
  through half the fuselage. `trailHeadStart()` decides where that segment
  starts being drawn: nothing while the last body point is no further from the
  model centre than the ANCHOR'S OWN STATION (every millimetre would be drawn
  forward of the attachment point, into the fuselage — a parked contact sits at
  exactly zero), the whole segment once it has cleared the model's rendered
  ENVELOPE, and between them the drawn start slides along the segment so the
  visible length grows CONTINUOUSLY from zero. Three earlier cuts are recorded
  because their shape matters: testing segment LENGTH against the radius HID
  real trail (58 m aft of `airplane.glb`'s 34.41 m envelope gives a 33.98 m
  segment, suppressed, though ~23.6 m of it is open air); CLIPPING at the
  envelope and keeping only what lay outside stopped a moving trail visibly
  SHORT of the aircraft, since a bounding sphere encloses a lot of empty space
  around a slender airframe; and a BOOLEAN containment test flashed 10.33 m of
  trail on and off across 2 cm of travel at the boundary, and again on any fix
  that fell back inside. The END is never cut — that end is the whole point.
  `radiusM` carries `computedScale`, so the verdict is the same at every camera
  distance, and any contact that has moved more than its own size (every
  airborne one: 30 s of flight is kilometres) gets bit-identical geometry to the
  containment rule this replaces.

## 2026-08-23 — The AIR bracket alpha floor SCALES with the OUTSIDE slider

`aircraftBracketAlphaFloor` (`src/data/detectionPolicy.js`) is piecewise
  linear through 0 → 0, **the default → 0.35**, and 100 % → 1.0. The default
  value reproduces the previously shipped flat 0.35 exactly at every keyhole
  alpha, so the approved bracket look is unchanged; a flat floor made every
  reachable stop below 35 % paint identically. `AIRCRAFT_BRACKET_FLOOR_ANCHOR`
  mirrors `KEYHOLE_OUTSIDE_OPACITY_DEFAULT` (kept Cesium-free on purpose), the
  two are pinned together, and **the anchor MOVES WITH THE DEFAULT** — both are
  `0.01` since the 2026-08-24 final lock (`0.03` on 08-23, `0.05` before). That pin is the
  tripwire for a default move: the mapping is pinned to bracket BRIGHTNESS,
  not slider position. The `detection-opacity-slider` `step` is **1** so low values are
  reachable — the mapping was always continuous from 0, but at the
  previous step of 5 the entire sub-default range was one stop wide. Both the
  markup and the ordering of 1–5 % are pinned in `detectionPolicy.test.mjs`.

## 2026-08-21 — A grounded contact HOLDS its floor through a terrain outage

when the Re:Earth proxy fails, the floor cells a grounded contact stands on
  never warm, and the un-clamped render height for a contact reporting no
  altitude at all is the GEOID — ~150 m below the ground at an inland field.
  Both steps now hold instead. At POLL time `geoidSurfaceLastResortM()`
  (`src/data/renderAltitude.js`) withholds the geoid guess from any contact
  that already has a `renderAltitudeM`, so the sentinel path holds that height;
  the guess is reserved for a genuine first sighting. At DISPLAY time
  `_heldDisplayFloorM()` (`src/data/flights.js`) answers with the contact's own
  last resolved floor — valid within `HELD_FLOOR_MAX_DRIFT_KM` (1 km, one
  rollout's worth of travel) of the cell that supplied it — and otherwise with
  a resolved ADJACENT cell via `neighborFloorM()`, which takes the LOWEST of
  at least `NEIGHBOR_FLOOR_MIN_SAMPLES` (2) resolved neighbours and otherwise
  refuses. An earlier cut leaned HIGH, reasoning from "never below the visible
  surface"; that principle is about a contact's OWN measured ground and it
  inverts for a BORROWED cell, as playtesting confirmed — planes
  floating at terminal gates. The errors are not symmetric: too LOW is inert
  (`displayFloorHeightM` only ever raises, so an under-reading floor simply
  does not lift, bounded by one cell of grade), while too HIGH invents a
  position bounded by BUILDING height and a parked contact holds it — measured
  at 29.5 m of permanent float from a lone roof neighbour. A plane at a gate is
  on the apron, never on the roof. The honest residual is the mirror image: on
  a genuine slope the lowest neighbour under-reads, so the clamp lifts a little
  less than it could, which shows up as no lift rather than a wrong one and is
  corrected as soon as the contact's own cell warms. Both tiers are validated
  measurements out of the shared floor cache; with neither available the
  position passes through untouched, exactly as before. Adjacent-cell probes
  are throttled per contact (500 ms) and rationed no further: a probe is eight
  synchronous `Map` reads with no I/O — every DEM request is driven by
  `warmGroundFloor` from the poll loop, bounded there — and 200 synchronised
  all-cold contacts probing on the same tick measure 1.0 ms median / 1.2 ms worst on the all-cold workload (a noisier ad-hoc run of the same workload peaked at 2.1 ms), 1.4% of one 80 ms
  fleet tick (`scripts/qa-floorhold-probe-cost.mjs`). A global per-tick budget
  with a fairness queue was built over that and DELETED: it protected single-
  digit milliseconds and produced two starvation defects. Nothing can starve
  because there is no shared resource to be starved of.
  A floor that moves DOWN under a contact standing on a BORROWED one is
  APPROACHED exponentially (`FLOOR_EASE_TAU_MS`, 360 ms — ~20% of the
  remaining gap per fleet tick, hard-capped at `FLOOR_EASE_MAX_STEP` so a
  delayed or stalled tick cannot close more) from the value currently displayed, rather than
  interpolated from a fixed anchor over a fixed duration. The target moves: a
  second, lower neighbour can warm mid-approach, and re-evaluating a fixed
  anchor against a moved target jumps by the eased fraction of the change
  (measured at 100 m in one tick). Approaching from the displayed value has no
  such seam. Rises are always taken whole, including mid-approach, since an
  eased rise is time spent under the mesh; a change between two resolved floors
  keeps its existing timing. The hold state is retired the moment a contact
  stops being a grounded billboard (airborne or model-owned), but the floor
  itself is PARKED as a rehydration seed rather than destroyed: deleting it
  outright let an `on_ground` flap through a rotation cold-start the contact
  under the runway (observed with VIR138M at JFK). **A seed is a memory, not
  a reading**, and three bounds keep it honest. `HELD_FLOOR_MAX_DRIFT_KM`
  refuses it more than a kilometre from where it was measured.
  `FLOOR_SEED_GRACE_MS` (90 s, three polls) expires it on wall-clock age,
  judged BOTH while the contact is away and AGAIN at the moment it re-grounds —
  a contact that makes no calls in between (off the poll on a cruise, outside
  the corridor radius, tab hidden) never reaches the first check, and an
  earlier cut that only had that one reused a floor parked 198 s earlier. And
  the seed ranks BELOW the neighbour tier: two freshly resolved adjacent cells
  overrule it, which is what stops a contact re-grounding half a kilometre
  away from floating on the field it left (measured before that rule: a 200 m
  seed held over a 100 m/105 m neighbourhood, 100 m in the air). So a short hop
  back onto the same apron inside the grace window and the drift bound DOES
  reuse its floor — deliberately, and only while nothing fresh contradicts it.
  What starts clean is a genuine departure. A model→billboard handoff retires
  and rehydrates by exactly the same rules. What none of this fixes is the flap
  tick ITSELF: the display clamp passes airborne positions through by design
  (an airborne height is the fix-time clamp's job), and at a sea-level field
  the airborne fix IS baro + geoid N, ~4 m under the runway. That is an
  accepted one-tick transition residual, and
  `scripts/qa-floorhold-staircase.mjs` §F1 counts every tick so it stays
  visible: 1 of 23 ticks below the runway, all of it that airborne tick, 0 of
  22 grounded ticks — against 12 of 22 grounded and not recovering before the
  seed existed. **A third tier that read the rendered mesh
  where no DEM existed to validate it was built and REMOVED** — measured
  against a real GPU with the proxy down, it recorded a coarse-LOD 20.6 m for
  ground that is really ~122 m; `tilesLoaded` goes true while coarse tiles are
  what is loaded, so without a DEM prior there is nothing to tell a surface
  from a mis-hit. Gates: `scripts/qa-floorhold-mutations.mjs` (22 named
  defects, each reverted individually and required to go red) and
  `scripts/qa-floor-hold.mjs` (live, real GPU — the proxy is failed mid-run and
  the contact is measured against `scene.sampleHeight`). This floor-hold path
  currently applies to `flights.js`; `militaryFlights.js` does not use it.

## 2026-08-21 — Screen picks are validated before conversion

anything that
  comes back from `scene.pickPosition()` must clear
  `isPickedWorldPosition()` (`src/data/scenePick.js`) before it is converted
  to a Cartographic. The guard is a magnitude BAND — 6,000,000 m to
  1,000,000,000 m, plus finite components — not a null check, because a depth
  read over empty sky can return a Cartesian that Cesium mishandles three
  different ways: non-finite throws `DeveloperError: normalized result is not
  a number`, exactly `(0,0,0)` returns undefined, and a near-center value such
  as `(500,0,0)` converts SILENTLY into a point 6,378 km underground that
  reverse-geocodes as 0°, 0°. The floor sits ~346 km below the smallest real
  surface magnitude (WGS84 polar radius 6,356,752 m); the ceiling is ~24×
  geostationary, so no real contact is rejected. **A degenerate pick is a
  MISSED pick:** the cascade in `getViewTargetCartesian()` and
  `pickWorldFromScreen()` falls through to `pickEllipsoid` and then the globe
  ray, and callers receive the same `null` they already handle for a miss —
  there is no new sentinel. Two consumers had no owner for a throw and were
  hardened to match: the moveEnd view-target prewarm runs inside
  `requestIdleCallback` (now catches and reports once per viewer at
  `console.debug`), and `IntelHUD._updateSummary()` awaits its context INSIDE
  a guard, because every caller invokes it as `void this._updateSummary(...)`
  and a rejection there is ownerless. Gate:
  `scripts/qa-view-target-prewarm.mjs`.

## 2026-08-20 — Scene playback ownership + reconcile

five corrections to
  `src/scenes/director.js`, with the pure decisions in `src/scenes/scenePolicy.js`.
  (1) A shot reconciles ONLY the layers it declares. The old walk forced every
  undeclared layer off, so a recipe authored against the original four layers
  tore down CCTV, vessels and fires with no restore pass. Operator captures
  snapshot the whole registry, so those still reconcile in full.
  (2) Playback claims the camera through `runImmediateNavigation('scene', …)`
  instead of a bare `camera.flyTo`, so it releases the follow camera, respects
  the navigation policy and lets Cockpit refuse before anything mutates.
  (3) **Playback NEVER re-establishes tracking.** `SCENE_TRACKING_PARAM_KEYS`
  (`selectedFlightsTrackingId`, `selectedMilitaryTrackingId`,
  `selectedSatTrackingId`) are stripped on the way to the layer — a shot
  captured while following a contact would otherwise hand the camera straight
  back to the follow loop it was just taken from, recreating the two-writer
  jitter. The keys stay in the STORED capture; only the apply path drops them.
  A unit pin sweeps every layer's `getParams()` for the whole selection naming
  family (`SCENE_SELECTION_PARAM_PATTERN` — `selected…`/`tracked…`, `…TrackingId`,
  `…Mmsi`/`…Norad`/`…Icao`), and each match must be on the strip list or on
  `SCENE_KEPT_SELECTION_PARAM_KEYS`; a name like `trackedVesselMmsi` therefore
  cannot slip through by not matching the older spelling. CCTV's
  `selectedCameraId` is the one recorded keep: it raises a monitor plane and
  never writes `viewer.trackedEntity` or the camera.
  (4) An **isolating Context mode is exited before a shot's layers apply**.
  Space Missions refuses every enable outside its replay bundle, so with it
  left dirty all five recipes were refused (or, for Orbital Watch, composed
  over a replay they never declared). The verdict is read off the shared guard
  (`contextLayerEnableBlockReason`), not a mode name, so a future isolating
  mode is covered — the probe id `SCENE_EXCLUSIVITY_PROBE_LAYER_ID` is
  reserved by a test against the real layer registry. The exit itself is the
  ordinary `setContextMode('off')` exact-restore path and is deliberately NOT
  abortable: leaving the mode IS the restore to the operator's pre-mode state,
  and tearing that transaction in half would strand Context. A refused
  `setEnabled` is surfaced in the status line and a `shot_layers_refused`
  telemetry event instead of being reported as success. **Mixed accepted /
  refused layers are reported honestly, not rolled back** — a shot whose
  enables partly failed leaves the layers that did move in place.
  (5) **Cancellation cancels the work, not just the next step.** Checking a
  flag after an `await` only stops what has not started, so both awaited
  operations are now themselves cancellable. Layers: the run/LOAD owns an
  `AbortController` whose signal is passed to every `setEnabled`, and STOP,
  supersession, and run teardown abort it — the data manager rolls an aborted
  enable back through the module's own `disable()`, so no layer is left on
  carrying stale params. Visuals: `styleManager.applyVisualState(state, {
  isCurrent })` gates BOTH halves of the map-stack switch, which is its only
  suspension point. The switch is a *mutation*, not just a wait, and
  `mapStackController` invalidates a switch only when another `setStack()`
  arrives — a winning state that omits `mapStack` (every normalized shot does)
  never issues one, so a stale switch would otherwise stand on the globe.
  So: an already-superseded caller never starts the switch, and one superseded
  *during* it puts the globe back to the stack the winner inherited — but only
  while `getSwitchGeneration()` shows no newer switch has claimed it, because
  a newer switch is a live intent that must not be stomped. The shader-uniform
  commit after the await keeps its own gate. Precisely: a stale LOAD's
  *synchronous* prelude (style/bloom/HUD) can still have landed before it was
  superseded, and is then overwritten by the newer state; what cannot survive
  is its map stack, its uniform commit, its layers, or its camera flight.
  Post-`await` flag checks remain as a backstop. Known remainder: run cleanup
  still waits on a suspended
  visual/map operation, because `setRecordingMode(false)` is not idempotent
  (a second call restores HUD `auto` rather than the operator's saved mode) —
  worst case is recording chrome staying up until the promise settles, which
  then restores correctly.

## 2026-08-20 — Ambient contact labels

detection callsign callouts paint
  on the shared normal-blend world-overlay canvas as their own host lane
  (`detection-callouts`) — NOT on the screen-blended sensor surface. `screen`
  can only lighten, so a dark backing plate drawn there is a no-op over sunlit
  ground and the text dissolves into the imagery. Brackets, the scanline wash
  and the mode banner stay on the sensor surface; the callout lane registers
  in the same `detection` slot, so callouts keep their z-position beneath every
  ordinary overlay card and beneath the tracked readout. Plate fills come from
  per-theme `calloutPlate` / `calloutPlateSpace` tokens (~63% / ~73% of the
  tracked card's `CARD_PLATE_ALPHA`), resolved once per style change; space-tier
  contacts take the heavier one. Rows are pooled, and an empty field must clear
  the replay buffer or the final callsigns strand on the canvas. **Do not move
  callouts back onto the sensor surface, and do not merge the plate tokens into
  `labelBg`** — that token is the scanline wash and shifting it retunes the
  sensor texture. Plates are additionally **backdrop-selective (2026-08-21)**:
  `skyBackdropFactor()` (`src/data/iconOrientation.js`, exact scaled-space
  ellipsoid silhouette) feathers the plate FILL ALPHA to `SKY_PLATE_SCALE`
  (0.18×) for labels above the horizon — sky backdrops read as near-bare text,
  terrain backdrops keep the full plate — across a smoothstep band of
  `HORIZON_FEATHER_RAD` (~1.09°/side). Only the plate alpha feathers; text,
  tier accents, leaders, brackets, and the tracked readout card are untouched.
  **The test is TWO-REGIME, and only the first regime is a ray test
  (2026-08-22).** Above the ellipsoid, `1` means the view ray genuinely misses
  the planet and the function is the exact complement of the occluder. **At and
  below the ellipsoid the horizon is EYE LEVEL** — the local geodetic
  horizontal plane through the camera — and that is NOT a ray-miss test: from a
  −18 m camera the ray to a contact 900 m up crosses the ellipsoid and still
  reads sky, deliberately, because the ellipsoid it crosses is not a surface
  anyone can see. It is reached by clamping the tangent cone's half-angle at
  90°, the continuous limit of the same formula (the horizon dip goes to zero
  at the surface), and is the convention Cesium's `EllipsoidalOccluder` already
  uses there, so the two stay sign-consistent. This is not an edge case:
  coastal airports sit at NEGATIVE ellipsoid height (JFK ramp ≈ −30 m, geoid
  ≈ −34 m), so a ground-level cockpit is genuinely inside the ellipsoid and
  **must not** be treated as degenerate — doing so put a full plate behind
  every label on an empty sky. Fail-closed now covers only unanswerable input
  (null, zero-length ray, non-finite camera, camera at the planet's centre).
  Note the pairing: from such a camera the occluder culls every contact BELOW
  eye level before detection sees it, so ground-backed labels only reappear
  once the camera clears the ellipsoid. Rendered proof:
  `scripts/qa-cockpit-plates.mjs`.

## 2026-08-20 — Required attribution has two named keep-out rules

the
  Google/Cesium credit line must stay visible in every state, and below 900px
  two surfaces used to paint over it — the command dock's popover tray (any
  width ≤900px) and the right context rail, which goes edge-to-edge below
  720px and covered the credit with every dock panel closed. Both now yield;
  the credit itself never moves, shrinks, or hides. **The clearance is not a
  single constant:** `#command-dock` is anchored at `2vh` down to 721px and
  re-anchors to a flat `8px` at 720px while `#cesium-credits` keeps its `2vh`
  base, so anything reasoning "the 2vh terms cancel" is only true in the
  721–900px band. `src/creditAttribution.test.mjs` is a **fail-closed** cascade
  model: it flattens `style.css`, resolves each anchor by importance →
  specificity → source order, evaluates a 14×11 viewport grid, and fails
  loudly on any construct it cannot resolve (`!important`, `inset`/`margin`
  shorthands, unvetted custom properties, unparsable or nested media queries,
  or an unrecognized selector positioning one of these elements). Extend the
  model rather than working around it — a silent skip here ships a ToS
  violation.

## 2026-08-20 — Dock tray stacking is decided by ID count

the pinned-tray
  selectors `#command-dock.dock-has-two-pinned-trays …` carry one ID against
  five classes, so any narrow-width override written with two IDs outranks
  them and the upper tray silently loses `var(--dock-lower-pinned-height)`,
  landing on its pinned sibling. The ≤900px and ≤720px overrides therefore
  name the panel (`#location-bar` / `#control-panel`) to reach (2,5,0). Adding
  a new tray rule means checking it against the pinned variants, not just
  against the base rule.

## 2026-08-20 — LOCATION mini-status is data-only today

the collapsed
  readout now follows a free-text geocode search as well as preset pills
  (`src/locationStatus.js` owns the copy for both), and every other camera
  destination invalidates the searched label — `_stampNavigation` covers
  voice/reset/takeover/selection, and scene playback calls the public
  `clearSearchedLocation()` per shot. `#command-dock` still hides
  `.location-mini-status` with `display: none !important`, so none of this is
  on screen; a `display:none` subtree is also out of the accessibility tree,
  so nothing is announced. Unhiding it is a separate product decision.

## 2026-08-20 — The Street Traffic sync chip shows one percentage

the
  settled confirmation flash carries the layer's coverage figure and NO
  progress number. `reduceTrafficSyncFeedback` returns an empty
  `progressText` once the sync lands and `#traffic-sync-progress:empty`
  collapses the slot; the renderer writes the empty value rather than
  guarding on truthiness, or the busy `...` strands beside the settled label.

## 2026-08-20 — `#active-style-name` has exactly one writer

the style-name
  mapping in `setStyle`. Location, search, and scene paths report where the
  camera is through the LOCATION surfaces, never the style slot.

## 2026-08-20 — Share-link selected-subject Follow

a copied v2 link adds
  an ephemeral `at` epoch-seconds field; ordinary live hash updates omit it.
  A shared Flights, Military Flights, or Satellites selection restores only
  after the base destination camera, ordinary layer restoration, and a new
  destination-scoped source refresh settle. The source module—not lifecycle
  success or the UI—owns the final presence decision: Flights and Military
  use the exact accepted snapshot, while Satellites waits for the applicable
  dense catalog and treats a partial CelesTrak catalog as unable to prove
  absence. A found subject starts the normal moving Follow at its current
  position regardless of link age. An authoritatively missing subject is
  `expired` only when copy age is strictly greater than 90 seconds for Flights,
  45 seconds for Military, or 5 minutes for Satellites; equality, missing or
  malformed time, and other non-found cases are unavailable. Feed/catalog
  failure has its own feed-unavailable message. These warnings use the
  universal top-center status banner and its standard failure dwell, beginning
  only after the shared-view startup cover clears. If
  teardown or disable invalidates an in-flight refresh, any selected-subject
  restore waiting behind it settles as cancelled instead of remaining pending.
  Terminal non-found cleanup compare-clears only the exact passive ID in memory and the live URL, never
  recipient local storage. A newer explicit selection, visibility request,
  destination, pointer gesture, wheel gesture, destroy, or source cancellation
  wins and suppresses late Follow/status work without cancelling unrelated
  shared layer visibility or options. Radio station selection remains outside
  the share payload; Radio restores only its allowlisted filter and volume.

## 2026-08-18 — AIS feed watchdog

feed liveness is judged by DATA, not
  socket state — AISStream can complete the handshake and then deliver
  nothing forever. `/api/ais-live` reports `live | stale | reconnecting |
  down | auth-failed` (plus the unchanged `missing-key`/`unsupported`) with
  `silentForMs`, `reconnectAttempt` and `nextAttemptAt`. Silence is REPORTED
  at 120s and ACTED ON at 300s; recovery walks a 5s/15s/60s/300s ladder and
  then stops at a terminal `down` with a slow 15-min retry running behind it
  (a retry never flips the chip back to "connecting" — only real data clears
  `down`). Liveness credit requires a frame that arrived on a still-owned
  socket AND decoded into a real AIS record: handshakes, malformed frames and
  error envelopes are never liveness, and orphan frames are dropped entirely.
  Failures are CLASSIFIED — auth rejections (error envelope, HTTP 401/403)
  are terminal with an hourly probe and an actionable chip, 429 honours
  `Retry-After` and otherwise enters at the slowest rung, and only genuine
  transport faults use the ladder; worst case is single-digit connection
  attempts per hour in every class. Degraded states stay visible in the chip
  even while cached vessels are still drawn.
  **Locked invariants — do not "fix" these:** teardown is `ws.terminate()`,
  never `close()` (the built-in WebSocket has no hard-abort and its `close()`
  never completes against a black-holed peer, leaking the single per-key
  connection); socket generations are monotonic for the module lifetime and
  never reused across a dispose, and every socket-map mutation is
  identity-checked (otherwise a pre-disposal close event orphans a
  post-disposal socket and two connections race for the one slot); durations
  use a monotonic clock, wall time only for display. Policy is a pure state
  machine (`src/data/aisWatchdog.js`) returning actions; the socket lifecycle
  is `src/data/aisStreamAdapter.js`, tested directly with mock sockets; the
  transport assumption is pinned in `src/data/aisWatchdogTransport.test.mjs`.

## 2026-08-18 — Honest live AIS health

the vessel layer treats socket connection,
  first message receipt, raw payload rows, and accepted vessel positions as
  separate stages. Each enabled session owns one 30-second first-connect
  grace: an open or connecting socket with no accepted position reads
  `LOADING`, and polls do not restart that deadline. The first accepted
  position ends the grace and establishes freshness; expiry, missing
  credentials, rejected transport, or another definitive failure reads
  `UNAVAILABLE`. Disable/re-enable starts a new isolated session. A socket
  with no received message or no usable positions does not advance
  `lastUpdate` or replace warm accepted vessels;
  warm selection and trail state remain visible as stale/degraded. Late
  responses from disabled, destroyed, or replaced layer requests cannot
  mutate or finalize the current lifecycle. Layer stats expose transport
  status, message time, and raw/accepted row counts for diagnosis.

## 2026-08-18 — Vessel/fire camera transfer

clicking an actionable AIS vessel sprite
  or painted card selects that MMSI and requests one close oblique camera
  transfer; re-clicking the selected vessel refocuses it. FIRMS detection
  sprites and actionable detection cards do the same using a refetch-stable
  identity that includes position, acquisition time, and source satellite.
  Aggregate fire cells remain non-actionable. Painted actionable cards are
  also mirrored into a named, focusable assistive-control list that exposes
  selected state and announces focus only after the backing record accepts
  activation. Global FIRMS cards reject far-side cells before
  filling the bounded overlay cohort; the shared overlay still owns final
  horizon culling. The UI validates world-focus
  requests before releasing tracking, refuses Cockpit-owned moves before any
  camera mutation, and releases follow owners before accepted flights.
  Sibling-owned picks win without clearing the vessel/fire selection or
  issuing a competing camera command. Deferred geocoding stamps intent but
  retains the current owner until a valid destination resolves; immediately
  before flight it rechecks shared navigation authority. Newer destinations,
  voice `move_camera`, `fly_route`, overhead framing, strongest-fire focus,
  vessel/aircraft/satellite tracking, reset, Cockpit entry, or teardown
  make older work and its UI completion inert. Teardown removes immediate
  camera-entry listeners before its first asynchronous restoration step and
  refuses any new immediate or deferred navigation after disposal begins.

## 2026-08-18 — Loading, reset, and Display completion

every registered layer exposes
  one normalized manager loading contract. Enable and disable feedback remains
  lifecycle-authoritative, while manager-owned periodic updates publish
  refreshing, failure, and recovery without replacing a producer's more
  specific error or availability state. The shared presentation is delayed to
  avoid flashes, visible outside the rails, and retained in
  Cockpit. One continuous overlapping load interval retains the strongest
  terminal outcome (`failed`, then `cancelled`, then `complete`) until every
  participant settles, so a later success cannot mask an earlier failure.
  A participating producer's terminal error, unavailable status, or
  key-required state also outranks generic completion without requiring a
  separate manager failure event; AIS first-connect expiry therefore ends as
  `LOAD FAILED`, not `LOAD COMPLETE`.
  Slow disable work is labeled as turning live data off rather than
  as a completed load. Street Traffic's dedicated sync chip shows genuine
  work and one bounded completion; steady TomTom coverage, including 0%, does
  not keep it open. Mapped Installations reports its bounded camera-driven
  requests to the same shared surface, but full-globe `zoom-in` guidance is
  not presented as loading. Terminal completion, cancellation, and failure
  labels are centered in that surface without an empty detail slot. The circular `RESET GLOBE` action sits beside the top-center share
  control in map view; Cockpit hides the complete action group and provides a
  cockpit-styled `RESET` beside `EXIT COCKPIT`. Both resets share one route
  with the voice action, release continuous/POI/Cockpit/entity and
  Space Mission camera ownership, and returns to the 18,000 km globe frame.
  Reset preserves the selected Contact while invalidating delayed automatic
  refocus work; the normal Context `FOCUS` action is the explicit route back
  to that same flight or vessel after the globe view settles. Location
  navigation uses the same selection-preserving camera
  handoff once a city, landmark, coordinates, or search destination resolves;
  failed searches leave the current camera owner untouched, and Context Focus
  can return to the preserved Contact. Focus also restores the selected
  aircraft's canonical follow frame after a manual zoom-away.
  Visual presets retain the order Normal, CRT, NVG, FLIR, Anime, Noir, Snow.
  Configurable preset selection—including same-style reselection—opens the
  shared Parameters surface directly below Detection and scrolls it into
  view; share-link restoration
  does not force that disclosure. Presets remain in the map Display. The
  shared Parameters surface moves into Cockpit Display for the session and
  returns on exit, with slider values contained by the panel at its supported widths;
  the bottom Visual Presets tray owns the MAP SOURCE label, centered status,
  and five-tile source row. Its compact wing is a keyboard disclosure:
  Enter/Space opens and focuses Map Source, Escape closes and returns focus,
  and unavailable sources remain tabbable with their reason exposed. Expanded left-panel
  headers use the same container-owned background treatment without changing
  their collapsed launchers; a soft 28% cyan divider identifies expanded
  titles on both side rails.
  Cockpit portals HUD, Detection, the single shared Parameters surface, and
  3D controls, but not the visual-preset grid. Parameters follow the active
  Cockpit vision treatment and remain directly below Detection. Changing the
  top vision style does not close an open Display or Radio utility; explicitly
  opening Display still collapses Live Signals. Its left-side
  Data Layers and Contact interactions do not collapse an expanded
  Display or Radio utility. Presentation-only adaptive collapse is reconsidered after HUD
  and viewport changes, while explicit collapse remains the only persisted
  user intent.
  Display orders 3D immediately above Celestial and Clean UI immediately
  below it. The top-center action group places Clear Layers to the left of
  Share and Reset Globe to the right. Clear Layers turns off the currently
  selected manager-owned data layers, including an active Context choice,
  while retaining visual, HUD, map, and panel settings. A disabled layer may
  still release camera work that it owns through its normal teardown.
  Direct Data Layers entry into Space Missions excludes the new mission ON
  intent from its pre-entry snapshot. Its OFF control therefore leaves Space
  Missions off and restores Satellites to their exact pre-entry visibility
  and parameter state.
  The title and loading logos use a blue 10 px outer-eye stroke with a
  translucent slate fill, while the globe-and-cage gaze travels up to 34 SVG
  units toward the pointer for clearer feedback at the compact title size.

## 2026-08-18 — Context, Cockpit, and Radio interaction contract

explicit Contacts,
  Space Missions, and successful Cockpit actions reveal the Context panel, while
  restoration and replay preserve its prior collapsed state. Contacts uses the
  dedicated right-side chooser; the underlying Global Context coordinator is
  registered for lifecycle and restoration but is not duplicated in Data Layers.
  Inside Cockpit, the focused summary card is titled Contact in both visible
  copy and its accessible control labels.
  The top-center Cockpit vision cycle shows the inherited map preset name
  (for example, `NOIR`) followed by CRT, NVG, FLIR, and NOIR. That inherited entry
  leaves the selected map preset unchanged inside Cockpit. NONE is not offered
  in the cycle; CRT, NVG, FLIR, and NOIR temporarily override that preset, while returning to it or exiting
  Cockpit restores the captured map style and its exact shader intensities.
  Selecting a Cockpit vision treatment with configurable parameters opens
  Cockpit Display and reveals those parameters through the existing right-side
  accordion; an inherited parameterless Normal preset does not force it open.
  Expanded Cockpit Display uses a container-integrated header and soft 28% cyan divider
  matching the expanded left-side panel treatment; its collapsed launcher
  keeps the standalone glass surface and muted divider. Cockpit Display and
  Radio use right-rail chevrons: left to expand and right to collapse.
  Cockpit side surfaces use one expanded body per side: Display or Radio
  collapses Live Signals and vice versa. When both utilities close, Live
  Signals reopens unless the user explicitly collapsed it. Expansion notifications
  fire only on a real collapsed-to-expanded transition, preventing repeated close
  synchronization from re-entering the disclosure coordinator. Data Layers collapses
  Contact, while expanding Contact returns that panel to its visible
  launchers. Live viewport-height changes remeasure both utility lanes and
  keep their collapsed launchers inside the obstacle-free corridor above
  Contact and Live Signals. An expanded Data Layers panel is solved against the
  viewport rather than the Cockpit cards: the CONTACT card and the peripheral
  Intel HUD corners stop shortening its corridor while it is open, so it
  unfurls downward from its collapsed launcher position and renders over them
  (`#left-panel-stack` is z-index 147, above the Intel HUD readouts at 146 and
  the Cockpit HUD at 145), scrolling internally when the layer list is longer than
  the corridor. Cesium's credit line is never passable and still bounds the
  corridor. Layer toggles stay live from there, and collapsing returns the
  plain launcher. The map-only Clear, Share, and Reset Globe actions are hidden
  for the duration of Cockpit, both as a group and as individual controls.
  It uses the `radar` symbol and provides roving keyboard tab navigation. Its action row
  places the single Cockpit entry before Search Nearby Sites. Cockpit removes
  the duplicate floating map entry and topline exit; the bottom-center
  `EXIT COCKPIT` control (offset downward by a `-95px` bottom margin) plus `Escape`/`C` own exit, with entry/exit focus
  transfer and failure-safe shortcut routing. The exit control sits at the
  bottom-center compass position. A Cockpit-only control strip sits
  directly above Live Signals, anchored 12px under the REC readout it shares
  the right margin with and clamped to keep 8px above the briefing card,
  never rising past `max(96px, 12vh)`; Cockpit owns that anchor and
  republishes it every layout tick (the left accordion no longer donates its
  corridor). Its minimal Display popover exposes Intel HUD,
  Detection, Parameters, and 3D aircraft. During Cockpit, those existing
  standard Display controls move into the Cockpit popover and retain their normal
  nested interaction: HUD plus Tactical/Operator/Minimal layout, Detection plus
  Density/Allocation/Fade/Outside tuning, and 3D plus Proximity/All mode. The
  same nodes and state return to the map Display on exit, so Cockpit does not
  maintain a second control state. **Detection is owned by the CONTACTS
  session, not by Cockpit** (validated 2026-08-18): activating Contacts
  forces detection on at the shared military preset (`MILITARY_DETECTION_PRESET`
  — Dense @ 75%, the same frozen object the CRT/NVG/FLIR styles apply), and it
  then stays on for the whole session — cockpit enter, cockpit exit and
  third-person tracking are moves WITHIN Contacts and do not touch detection at
  all. A manual DETECT change during the session holds for the rest of it.
  Deactivating Contacts restores the pre-Contacts state, except that a map
  style chosen during the session keeps its own auto-enable preset (that rule
  is younger than the entry snapshot). The trigger lives on
  `_syncContactsDetection()`, called from `_syncContextModeButtons()` and gated
  on `!_contextModeChanging` so it fires at transaction settle, never at click
  — a failed activation cannot strand detection on. Policy in
  `src/contactsDetectionPolicy.js`. Detection continues to show surrounding
  aircraft in Cockpit while omitting only the active first-person subject's bracket;
  handoffs move that suppression to the new subject and exit restores the
  selected aircraft's map-view bracket. Remaining Cockpit bracket strokes render
  at 45% of their normal presentation opacity to reduce visor clutter; callouts,
  density, allocation, fade, and Outside tuning are unchanged and normal bracket
  opacity returns on exit. AIR presentation follows the same retained 3D mode:
  Proximity uses 150/185 km and All uses 400/450 km. With 3D off, in-range
  contacts remain rotating 2D silhouettes; with 3D on, ready admitted models
  take over under the Cockpit cap of 60. Loading/capped contacts remain 2D,
  out-of-range contacts use rotation-free dots, and exit restores map treatment.
  Its Radio popover exposes compact power,
  transport, station, and volume controls. Cockpit Previous/Next preserves
  selection, autoplay, and broadcaster fallback audio without starting the
  map-view station flights that compete with the first-person camera. These
  are a Cockpit-only accordion:
  each static header uses the left accordion's label and divider with a dedicated
  directional-chevron disclosure button and no full-row hover treatment. Only one
  utility body expands at a time. On desktop, its collapsed sibling remains
  visible whenever both controls fit above Live Signals; a constrained
  corridor gives the expanded utility the full height and temporarily hides
  that sibling, restoring it as soon as room returns. Collapsed Display
  matches the collapsed Data Layers launcher width. Expanded Display uses the
  standard map Display panel's 272 px width, glass shell, header surface, and
  internal spacing. Radio retains its independent compact and expanded widths.
  Display no longer follows the Data Layers corridor: that corridor is solved
  against left-lane obstacles and has nothing to say about the right margin,
  which dropped the strip into Live Signals below roughly 830 px of browser
  height. Cockpit owns the strip's anchor and republishes it on every layout
  tick — including the settling pass after HUD transitions and asynchronous
  map-provider swaps — hanging it 12 px under the REC readout, clamping it up
  to keep 8 px above Live Signals, and never letting it rise past
  `max(96 px, 12vh)`. The utility height is measured from that resolved top
  and floors on a launcher height rather than a fixed minimum, so expansion is
  bounded to the real corridor below the Cockpit topline and above Live
  Signals, including when a tall panel takes over the corridor. A hidden
  sibling is also removed from the accessibility tree, and focus transfers to
  the expanded utility if a layout transition hides the focused launcher. The
  shared map Display, Radio detail,
  ordinary Global Context, and Scenes surfaces stay hidden in Cockpit. Data
  Layers remains available. Its Cockpit-only stack paints
  above the curved speed and altitude rulers, matching the existing Context,
  Signals, Display, and Radio surface ordering without changing map-view
  stacking. Narrow mobile Cockpit
  viewports suppress the legacy layer stack, peripheral HUD, and secondary
  Context/briefing panes so the flight instruments and primary controls remain
  unobstructed. Outside Cockpit, Radio starts collapsed while off. When Context
  is collapsed, its Radio header icon opens compact controls whose explicit
  Enable/Disable action owns power; stable close and full-panel buttons own
  compact dismissal and one-way detailed expansion independently. When Context
  is already expanded, that same icon skips the floating compact card, expands
  the embedded Radio section, scrolls it into view, and moves keyboard focus to
  its disclosure control. The detailed panel's normal accordion control owns
  its collapse. Compact/detailed state and playback continuity remain shared.
  Radio volume in the full, compact, and Cockpit surfaces, plus Space Mission
  replay speed, use Display / Sharpen's muted 3px rail, circular cyan thumb,
  glow, and mono value treatment. Their larger transparent hit areas, keyboard
  focus indication, ranges, disabled states, and mission speed scale remain
  control-specific.
  Outside Cockpit, panel collapse state is independent. Multiple expanded
  panels in either desktop lane share the measured viewport-safe corridor.
  If a later panel would receive less than half its intrinsic height, the
  layout presents it as a collapsed, accessible launcher without overwriting
  the user's saved preference; the panel most recently opened by the user
  keeps the lane, so an older expanded sibling yields when necessary. In a
  constrained Tactical lane, later competing panels collapse to their
  launchers even when they would narrowly exceed that threshold. While the
  left lane remains constrained, every collapsed sibling launcher is hidden
  and the primary panel uses the complete safe corridor; the launchers return
  when that panel closes or the stack fits again. An expanded
  Tactical Display claims the right lane and hides every collapsed CCTV and
  Context sibling, including a layout-collapsed Context; those launchers
  return when Display releases the lane. Display itself remains the single
  scroll surface when a visual preset adds Parameters: those rows do not form
  a nested scroll surface. The bottom Visual Presets MAP SOURCE row keeps the
  `3D` status and four source tiles inside its padded tray; the row wraps
  from one row to two at 620 px, and live viewport changes keep the complete
  tray inside the screen.
  Adaptive remeasurement preserves the user's
  scroll position across Tactical, Minimal, and HUD Off layouts.
  During an active Scene run, Clear Selected Layers and Reset Globe remain
  hidden until playback stops or completes because the Scene transport owns
  layer and camera sequencing for that interval.
  The Cockpit Contact summary exposes Previous and Next contact navigation
  plus its collapse control; it does not offer a Focus action because the
  first-person Cockpit camera remains owned by the tracked aircraft.
  A voice Cockpit request that retargets to a filtered civilian or military
  contact carries voice selection authority through navigation, so the
  aircraft entered is also the durable target used by Copy Link and reload.
  Missing context values render as `—` with an accessible “Unavailable” name.
  Because the panel hosts its own Previous/Next controls, the ONLY condition
  that hides it is the absence of a context snapshot. Contact identity never
  gates visibility — hiding on a non-aircraft subject stranded the operator
  the moment Next landed on a vessel or an installation.

## 2026-08-18 — Contact readout: foreign subjects and CONTACT LOST

When the selected
  contact is not the tracked aircraft (a vessel, an installation, another
  aircraft), the panel stays up and keeps its label, cohort counts, nearest
  contact, distance and evaluated time live. Only the nose-relative direction
  arrow and BRG readout are dashed: those two are measured in the tracked
  aircraft's own frame while the rest of that row is measured from the
  selected contact, and rendering both live presents one mixed-frame reading
  as a single measurement.
  A contact that leaves its feed holds the panel in a `CONTACT LOST` state
  (`data-state="lost"`, the same panel-level cue mechanism as `uncertain`,
  in the amber the app already spends on unknown/stale inputs): the last
  rendered values stay on screen rather than being recomputed against a
  position that stopped updating, and Previous/Next stay operable so the
  operator can step off. It fires on two paths, and both retain the snapshot:
  an eviction-origin selection clear (`reason: 'evicted'` — the aged-out
  branches in `flights.js` / `militaryFlights.js`, AIS pin exhaustion, and a
  viewport refresh that drops a selected record), and a refresh whose
  presence check comes back absent. A DELIBERATE clear (click-away, Escape,
  voice stop, layer disable) still clears the subject and takes the panel
  down; an untagged clear defaults to deliberate.

## 2026-08-18 — Presence contract (`hasContact`)

`flights`, `militaryFlights` and
  `aisLiveVessels` each expose `hasContact(id)`: `true`/`false` in O(1) from
  the layer's own keyed map, or `null` when the layer holds no data and
  therefore cannot answer (disabled, or not yet loaded). Presence consumers
  MUST use it and must never infer absence from `getAllPositions`, which
  stops at its cap — the live flights layer routinely carries ~11k contacts
  against a 1,000-row cap, so "not in the returned rows" is not "gone".
  `null` leaves the previous verdict untouched, so a silent layer can never
  fabricate a CONTACT LOST cue.

## 2026-08-18 — Compact data-attribution panel

the complete Cesium credit inventory
  remains available without taking over the viewport. Its expanded desktop
  panel is capped at 70dvh/36rem, the wrapped 12px credit list scrolls inside
  it, and narrow screens retain Cesium's full-screen surface with an internal
  scroller. The title, close control, links, and persistent Google/Cesium line
  remain unchanged and visible.

## 2026-08-18 — Distant-aircraft recession

both civilian and military billboard fleets
  retain their locked class/ground scale and `NearFarScalar`, then multiply a
  limb-relative taper in the existing ~12 Hz tick. The taper is 1 below 0.5×
  geometric limb distance and smoothsteps to 0.45 scale plus a 0.35 alpha-haze
  factor at the limb. That treatment eases continuously back to identity from
  3,500–4,500 km camera height, avoiding a globe-view threshold pop. These
  values, the start ratio, blend band, composed floor, and write epsilon remain
  runtime tunings. No aircraft is count-culled or made fully transparent.
  Focus emphasis and limb haze multiply at one deadband-gated write site, and
  their product is clamped to 0.20 before freshness alpha is applied. Ambient
  fleet models receive that same composed alpha; class/ground/cockpit repaints
  preserve the current limb scale instead of dropping it for a tick.

## 2026-08-18 — Focus-aware contact de-emphasis

civilian/military aircraft and
  satellites publish the selected target's padded screen bounds and camera
  distance from the same per-frame position cache already consumed by their
  tracked entity. Ambient flight sprites, AIS chevrons, CCTV icons, and
  satellite points then ease their own alpha where they compete with that
  target; no draw-order assumption participates. The always-visible rule is
  narrowly amended rather than removed: emphasis never falls below 0.25,
  contacts never blink or disappear, entry/exit use 6 px hysteresis, and
  writes use a 0.005 alpha deadband. Defaults are 18 px padding, 300 ms attack,
  600 ms release, an 8%-of-target-distance range hysteresis band, and
  `nearerBehavior: 'allow'`; `dim` and `partial` remain runtime/evidence
  tunings. Ambient overlap includes each sprite's own rendered extent. The
  gated AIS, CCTV, and satellite passes retain an active-emphasis count so a
  settled dim contact always completes its release after tracking ends.

## 2026-08-18 — Terrain-height resilience

`/api/terrain/heights` caches canonical
  5-decimal points individually, reconstructs reordered/overlapping batches
  in exact request order, and refreshes only missing or stale points. Network,
  429, and 5xx failures receive bounded jittered retries with `Retry-After`;
  stale real heights remain usable per point, while an uncached absent height
  still returns 502 rather than becoming a fabricated ground value. Client
  geoid fallbacks wait 60 seconds before retrying and self-heal to Re:Earth on
  the first later successful fetch.

## 2026-08-18 — Overpass cache admission

`/api/overpass` parses and sanitizes requests,
  then checks fresh memory, identical in-flight work, and fresh disk entries
  before invoking its local 90/min limiter. Cache and single-flight responses
  therefore do not spend quota; upstream-bound misses retain the existing
  limiter, mirror, stale, and sanitization behavior.

## 2026-08-18 — CCTV world-click focus

clicking an in-world CCTV icon or ambient card
  activates it and routes the camera flight through the panel FOCUS policy.
  Aircraft/satellite tracking releases outside cockpit; cockpit retains the
  view, keeps the CCTV activation, and surfaces the existing refusal toast.
  Auto-hop and programmatic camera activation remain activation-only. CCTV
  world clicks must stay within 6 px and 400 ms; drag-like or long gestures
  are inert, and re-clicking the already active camera emits no focus request.
  A clean empty-space click clears the active CCTV camera in place without
  moving the view or disabling the layer. Sibling-layer picks and ADJUST-mode
  interactions never trigger that clear. The resulting null selection remains
  stable across rendering and updates; configured auto-hop is held until a
  later explicit activation or AUTO HOP toggle-on.

## 2026-08-18 — Tracked-flight close-range feel

the existing 150 m camera floor is
  unchanged, while the selected-only civilian and military model cap is now
  200 px so minimum range reads as close. Pointer travel over 6 px suppresses
  selection and empty-space untracking; duration over 400 ms suppresses only
  untracking, so a stationary slow press on a plane still selects it. Escape
  still releases tracking in place. The 200 px feel needs close-range field
  verification; fleet model sizing remains unchanged.

## 2026-08-18 — Deterministic sprite stacking

contact collections reassert the stable
  bottom-to-top order CCTV, FIRMS, bikeshare, AIS, military, then civilian
  flights after every relevant layer init/enable and immediately after FIRMS
  lazily registers its detection sprites. Always-visible contact
  depth settings are unchanged. Cesium OIT weighted blending may soften strict
  alpha layering on some GPUs, so the ordering remains a real-browser check.

## 2026-08-18 — Deterministic card stacking

CCTV, FIRMS, vessel, and tracked-target
  cards use the shared world-overlay canvas. Detection paints through the
  same host/frame contract onto one host-owned blend surface beneath that
  canvas — parented into `#cesiumContainer` so its `screen` blend still
  reaches the WebGL scene. The exact detection, ambient-label, ambient-track,
  ambient-card, thumbnail, selected, and tracked lane sequence is binding;
  the detection callback runs first and z-index preserves its shipped z5
  position below the z6 cards.

## 2026-08-18 — Cross-layer vessel ownership

clicking a sibling-layer contact leaves
  the active vessel card, HUD, context, and trail unchanged while the sibling
  handles the pick, preventing two camera commands from one click. Starting entity tracking still clears vessel
  inspection; AIS itself never sets `viewer.trackedEntity`. Own unkeyed or
  evicted vessel-record picks and `gev-trail:*` remain no-ops. CCTV choices
  made from the panel dropdown do not currently emit a cross-layer event and
  therefore do not clear vessel inspection.

## 2026-08-18 — World-overlay host and Phase 2–6 source migrations

`src/overlays/worldOverlay.js` owns one shared DPR-aware text/card canvas,
  one detection blend surface, and one world-overlay post-render
  scheduler. Both surfaces share the same sizing, clear, projection,
  and teardown paths. The host includes bounded per-source/per-collision-domain
  arbitration, horizon/viewport culling, shared keyhole fading, cached UI
  exclusions, cockpit source gating, pooled hit
  rectangles, and development diagnostics. **UI exclusion is a per-rectangle
  PLACEMENT PREFERENCE over currently visible chrome — it clips no canvas and
  vetoes no entry.** Rectangles are never coalesced into bounding unions
  (that requirement existed only for even-odd canvas holes, and the host
  punches none). Exclusion strength is decided per element by its EFFECTIVE
  stacking level (the outermost positioned ancestor carrying a z-index, i.e.
  the stacking context that competes with `#world-overlay-root`): chrome ABOVE
  the host — map panels z90-1000, the dock, the cockpit windows inside
  `#cockpit-hud` z145 — is a soft preference, so an entry with no
  collision-free placement keeps its full placement set and simply renders
  beneath that chrome. Chrome at or BELOW the host keeps an absolute veto:
  `#intel-hud` is z2, under both host surfaces (detection z5, cards z6), so a
  kept placement there would paint over HUD text. Placement runs two passes —
  prefer variants clear of all chrome, else variants clear of the below-host
  chrome, else drop the entry. Cockpit line art (rims, arcs, rails, toplines, readouts) is not
  in the inventory at all: the AR-HUD model puts world-space content beneath
  the cockpit's screen-space HUD by z-order. Its empty-host path performs no
  post-setup layout reads or canvas work under resize/mutation noise; removed
  entry records are pruned, and text measurement uses a host-lifetime,
  1,024-entry LRU. Steady-state rendering reuses arbiter output, placement,
  paint-item, and paint-rectangle storage; track display text is rebuilt only
  when its title or detail changes. DOM mutations only flag exclusions dirty,
  with selector/layout scans deferred until there is overlay paint work, and
  host teardown severs pooled record/entry references before releasing every
  pool. A custom paint-lane contract gives source-owned batched painters the
  same DPR-sized context, per-frame view-projection matrix, ellipsoid
  occluder, keyhole geometry, and cached UI rectangles without transferring
  their selection policy into the host. Datacenters and Dams now publish card
  entries into that host on their
  existing 450 ms screen-grid cadence. Each source retains two deterministic
  contenders per grid cell and publishes at most 160 entries. The legacy
  700/900 winner ceilings are no longer the effective shipped caps; active
  `ambient-card` source budgets sum to a bounded 1,150-card shared lane: two
  96-card infrastructure budgets, FIRMS' shipped 18-card cohort, AIS's
  existing configured 900-row absolute ceiling, and CCTV's shipped 40-card
  ambient maximum. Runtime AIS demand still
  derives from its shipped 118 px grid: 112 candidates at the 1600×900
  allocation viewport and 170 at full HD; its existing 150 px greedy
  separation usually admits fewer. The host owns final cross-source declutter
  without letting source count grow beyond the pre-migration source bounds.
  Cards use the infrastructure name plus available operator/capacity for
  datacenters or river for dams. Their native Cesium points, stems, polygons,
  selection/picking, terrain sampling, and enable/disable lifecycle remain in
  `localGeojson.js`; it creates no native label graphics.
  The bundled public-release snapshots omit contact-oriented fields and note
  values containing email or phone identifiers. Runtime cards and entity
  context do not depend on those fields; geometry, identity, name,
  operator/capacity/river metadata, and ODbL attribution remain intact.
  Stem position and
  polyline properties are constant between initialization, camera `moveEnd`,
  and successful near-surface ground samples rather than per-frame callbacks
  or every 450 ms visibility pass. Unchanged or sub-0.5 m tips do not call
  `setValue`, and each record alternates between two preallocated two-position
  stem arrays so real tip changes notify Cesium without steady-state allocation.
  Shared placement records retain the raw anchor plus one signed integer
  leader offset; painters apply that offset without materializing four pairs
  of computed doubles per entry. The arbiter's spread distances and compact
  placement-availability masks live in pooled numeric buffers. Because solve
  occupancy only grows, few-placement identities whose complete set is
  blocked are dismissed once instead of being returned and re-spread; the
  authoritative collision lookup remains the final semantic check. Protected
  entries that cannot separate completely choose the placement with the least
  total protected-rectangle overlap rather than stacking on the first option.
  Cards use the host's shared keyhole fade and global detection fade/opacity
  controls with no source-local edge constants; cached keyhole geometry is
  invalidated by live tuning as well as canvas size, so Fade changes reach the
  next frame. Outside opacity defaults to the shipped floor (5 % when this
  landed; 1 % since the 2026-08-24 final lock, 3 % on 08-23). The
  `KEYHOLE_OUTSIDE_OPACITY_DEFAULT` change from 0 to 0.05 also affects
  detection: callouts and brackets previously hard-culled outside the keyhole
  now paint at the OUTSIDE default (1% since the 2026-08-24 final lock;
  aircraft brackets hold the 0.35 readable floor) and consume ambient budget
  viewport-wide under the same
  fade-don't-cull principle; this remains pending visual review. Cards
  also reproduce the former
  `scaleByDistance` curve (1.0× at 250 km to 0.62× at 9,000 km).
  Mapped Military Installations create no empty native labels; selected names
  remain in the tracked readout. Submarine-cable labels moved into the shared
  host on 2026-08-18 (Option 2, superseding the Phase-5 Option-1 native
  exception): the same nearest-160 bounded cohort now publishes
  `ambient-label` entries on a dirty sweep with exactly two dirty
  conditions — camera `moveEnd` / layer enable / load completion, plus a
  motion fallback that samples the camera at most once per 2 s and only
  re-arms past 250 m of travel since the last swept position, so tracked
  and orbit cameras (which never emit `moveEnd`) cannot starve the sweep
  while a parked camera still costs zero. The former 500 ms timer path was
  removed in the same-day perf round — timer-driven stem re-sizes rebuilt
  the 2,629-instance batched stem primitive mid-motion. The 2,629 reference
  stems are staticized constants (no per-frame `CallbackProperty`), and an
  unchanged cohort is never republished so a parked camera stays
  governor-idle at the source level.
  The 2026-08-18
  host fix extends that to the HOST level: chrome mutation observation is
  scoped (body childList filtered to inventory-chrome add/remove;
  per-occluder attribute observation element-only, no subtree) and the
  right-rail allocator writes `--right-panel-allocated-height` only on real
  change, so parked idle with ANY live overlay source measures 0 postRender
  fires / 5 s — empty-scene control parity (pre-fix ~56-61; dams
  cross-checked at 0). Genuine chrome changes (occluder add/remove,
  own-attribute flips, resizes) still invalidate;
  `qa-cables-overlay.mjs` gates idle at ≤6 / 5 s.

## 2026-08-18 — Phase 6 detection consolidation

`src/data/detection.js` retains its own
  `LabelArbiter` instance and existing 125 ms solve cadence, density/altitude
  budgets, layer quotas, Elastic/Weighted allocation, manual scalar matrix
  projection, tier palette, batched bracket paths, callout painter,
  acquire/keyhole fades, sparse focus ring, banner, scanlines, suspension, and
  diagnostic object. It no longer creates or sizes a canvas, clears pixels,
  builds a camera matrix or UI inventory, observes layout, or attaches a
  render listener. The host creates and lifecycle-manages
  `#world-overlay-detection-surface`, DPR-sizes it through the same frame path
  as `#world-overlay-canvas`, and invokes detection against its
  plain source-over context. Detection writes the exact shipped theme
  `mixBlendMode` and `filter + drop-shadow(...)` strings to that provided
  element, preserving scene-level CRT/NVG/FLIR glow and once-per-layer
  filtering. The surface is host-owned but **parented into `#cesiumContainer`
  at `z-index:5`**, not into `#world-overlay-root`: the root is a stacking
  context (`z-index:6`), i.e. an isolated blending group, and a surface inside
  it has its `mix-blend-mode: screen` silently discarded by the browser
  instead of compositing against the WebGL scene. z-index (5 under the root's
  6) keeps it beneath ambient-through-tracked host paint.
  The >22 ms odd-frame relief valve is restored: the host does not clear the
  detection surface on a held frame, while unrelated shared lanes repaint,
  and `throttleSkipCount` remains a live diagnostic. Detection `data-*` fields
  now live on `#world-overlay-canvas`, while the StyleManager diagnostic API
  remains unchanged. Disable and suspension deactivate only the detection
  lane, leaving unrelated host entries intact; teardown unregisters the lane
  before the host is destroyed. The production-shaped allocation gate covers
  5,000 visible Dense observations at 2,500 km under the unchanged 154
  B/observation/frame ceiling. The host owns one world-overlay `postRender`
  listener; the repository has five `postRender` listeners total (host,
  celestial ring, annotations SVG, missions frame tick, and traffic).

## 2026-08-18 — World-label accounting

All intended label/card migrations use the
  shared host. The former native `LabelGraphics` exception for cable reference
  labels was retired on 2026-08-18; cable text may render over tile geometry,
  so **zero native world-label creation sites remain**. The mission replay DOM vehicle, awareness
  compass, annotation SVG callouts, and host-owned detection isolation target
  are explicit exceptions; the awareness ring and cockpit contact pips are
  non-text out-of-scope surfaces. Annotation callout text, geometry, leaders,
  and behavior retain their tested presentation; a future annotation style
  system is outside this phase. `src/overlays/worldOverlayTokens.js` is the single home for
  shared world-overlay, CCTV-thumbnail, and detection-theme presentation
  constants. Former source renderers own no canvas, DPR, or world-overlay
  listener path; the duplicate detection rounded-rectangle helper and dead
  tactical compatibility helpers are gone. No temporary dual-renderer flag
  existed to remove. `activeCameraCardEnabled` remains a product
  presentation control, and `_detectionUserOverridden` remains the documented
  style-switch persistence state. Browser/GPU performance comparison remains
  operator-side; the final accounting records only comparable population
  reductions and deterministic Node allocation/solve measurements. Those
  allocation gates are calibrated on Node.js 24.14.x; `package.json` permits
  supported product runtimes on Node 24 or 26, while the allocation runner
  separately enforces Node 24 for these two calibrated probes. Each probe
  compiles synchronously and discards explicit-GC
  transition chunks before applying the unchanged byte ceilings. The unit
  runner executes ordinary test files with Node's default parallelism, then
  runs only the two explicit-GC allocation microbenchmark files sequentially
  and one at a time with `--expose-gc`, so unrelated tests cannot perturb their
  calibrated budgets and each isolated test process has the same GC contract
  as its measurement worker.
  A worker spawn, exit, output, or availability failure is a failing gate, not
  a passing skip.

## 2026-08-18 — Phase 5 earthquake labels

Earthquake disc ellipses and pickable
  entities remain Cesium-native, but their magnitude text is now an
  `ambient-label` source in the shared world-overlay host. The source formats
  `M#.#` text and depth-band accent colors, publishes only the 96 largest
  current events with stable id tie-breaking, and declares a 48-winner
  ambient-label budget. Host keyhole fading, horizon culling, UI exclusion,
  and final collision apply. Disable/destroy clear and hide the source; real
  earthquake entities carry no native label graphic.

## 2026-08-18 — Phase 5 bikeshare selection

The selected station keeps its native cyan
  point highlight, while its station name, availability counts, capacity, and
  operational warnings now publish as one protected selected-lane host card.
  The card reads the point's authoritative Cartesian directly, declares zero
  ambient quota, and therefore cannot be evicted by ambient budgets. Shared
  keyhole fading, horizon culling, UI exclusion, and selected-card paint
  order apply. Clear, disable, and destroy remove the host entry; the selected
  Cesium entity carries no label graphic.

## 2026-08-18 — Phase 5 ISS and tracked-satellite labels

The ISS path and large red
  point remain native, while persistent `ISS` text is a one-entry moving
  ambient-label host source. Its getter reads the already-propagated point
  cache, preserving the 1 Hz fleet epoch and eliminating the former second ISS
  propagation. Satellite tracking continues to publish exactly one protected
  tracked-lane card through `gevLabelModel` and `_trackedDisplayCached`; the
  tracked entity is point-only. Tracking ISS suppresses the ambient entry and
  untracking restores it, preventing duplicate ISS text. Disable, orbit-text
  preference changes, catalog rebuild, and destroy clear/hide the source.

## 2026-08-18 — Phase 5 active CCTV projection label

The active camera's monitor plane
  remains native Cesium geometry, while its camera-name label is one protected
  selected-lane host entry. The entry closes over the same cached
  `positions.label` Cartesian updated whenever the plane geometry moves, so
  label and plane retain a single placement authority. Only the active,
  projection-visible camera publishes; hide, disable, runtime destruction,
  and state clear remove the source. Monitor-plane entities carry no native
  label graphic.

## 2026-08-18 — Phase 5 tracked civil aircraft label

A tracked flight's Cesium entity
  is a billboard-only camera target with no native label. The flight source
  retains callsign/registration fallback, flight-level/altitude, speed, stale
  state, airline/type, and plausible-route formatting in `gevLabelModel`; the
  one protected tracked-lane host card renders that complete model. Its
  position getter reads only `_trackedDisplayCached`, the same authoritative
  Cartesian already consumed by the tracked visual and camera, and never
  advances dead reckoning from the host frame.

## 2026-08-18 — Aircraft label convention

every civil
  and military label surface resolves **callsign → registration → icao24**
  (`_contactLabel()` in `flights.js`; the same chain inline in
  `militaryFlights.js`) — tracked readout, detection card, `getNearby`,
  `getDetectableObjects`, `getAllPositions().label`, `getTrackedSubject`, the
  analyst record, the Context subject/nearest list, the Cockpit signal list,
  and the `track_entity` voice narration. Registration is aircraft IDENTITY,
  not route, so unlike origin/destination it is **not** routePlausible-gated.
  Identity stays `icao24` on every keyed surface (`getNearby().icao24`, the
  detection `sourceId` declutter hashes, and the `id` that `trackById` and the
  Context cohorts resolve) — only the displayed string follows the chain.
  Because adsbdb enrichment can answer *after* selection, the Context subject
  re-resolves its label each refresh (`resolveSubjectLabel()`) instead of
  freezing the selection-time snapshot.

## 2026-08-02–2026-08-18 (undated in source; bounded by surrounding entries) — Phase 5 tracked military aircraft label

The military tracking entity
  is likewise billboard-only and label-free. Its source-owned model retains
  callsign/registration fallback, stale cue, aircraft type, registration,
  operator, altitude, and speed, rendered as the sole protected tracked-lane
  card with the amber military accent. Its getter reads only the military
  `_trackedDisplayCached` publisher, keeping the host, visual, and camera on
  one dead-reckoned frame sample.

## 2026-08-02–2026-08-18 (undated in source; bounded by surrounding entries) — Phase 5b Space Mission labels

Launch markers publish through a bounded
  48-candidate / 24-winner ambient-label source. Selecting a mission clears
  that overview and publishes its launch-site, stage re-entry, payload
  position, and orbit annotations as protected selected-lane entries; every
  source-formatted line and accent remains intact. Static entries reuse the
  mission geometry Cartesians, the payload getter reads its per-frame live
  cache, and catalog-backed orbit text reads the cache updated with the ring
  matrix. Refresh, deselect, disable, and destroy replace or clear the real
  sources. Mission Cesium entities carry no label graphics, and the shared
  host replaces the former quadratic label overlap pass.

## 2026-08-02 — Phase 5 cable depth-testing decision

the 2026-08-02 ruling kept submarine-cable reference labels
  native (`disableDepthTestDistance: 0`) as the sole approved world-label
  exception so photorealistic tiles could occlude label text. On 2026-08-18
  that exception was retired after performance measurement: the native
  path evaluated 5,258 `CallbackProperty` channels per frame across 2,629
  reference entities and re-batched a 160-label `LabelCollection` per sweep,
  costing the layer ~9.5 ms/frame during camera motion (≈42 → ≈59 fps
  measured headless at a mid-Atlantic orbit). Cable text is now a bounded
  nearest-160 `ambient-label` host cohort (`telegeographySubmarineCables.js`
  publishes on the dirty sweep — `moveEnd`/enable plus the 2 s/250 m motion
  fallback for tracked and orbit cameras — skipping identical
  cohorts); stems/points stay Cesium-native, depth-tested, and pickable, so
  only TEXT lost tile occlusion — the same trade every other host label
  already shipped: labels may render on top of tiles. The dedicated
  `submarine-cables` allocation row gates
  the new source at 17,015 B/frame median (106.3 B/candidate, Node 24)
  under a 19,000 budget, and the all-live aggregate row was recalibrated
  with the cable cohort folded in (164,711 B/frame median, 190.6
  B/candidate, 182,000 budget); the intermediate phase rows keep their
  historical pre-cable composition. `load()` carries a load-generation
  ownership token (the militaryAwareness activationId pattern): a stale
  aborted load bails after every await and never clears a successor's
  lifecycle, so rapid toggle/destroy sequences cannot double-add data
  sources.
  The 639-candidate Phase-5b row (353 painted, 133,769 B/frame, 209.3
  B/candidate) remains as an intermediate historical gate; as of the
  2026-08-18 recalibration the all-live aggregate — every shared-host
  source including Radio and the migrated cable cohort — is 864 candidates
  / 398 painted at 164,711 B/frame (190.6 B/candidate) under a 182,000
  budget. The image-inclusive ceiling remains attributable to CCTV, while
  the isolated mission row measures 108.2 B/candidate/frame under the
  shared 154 ceiling.
  FIRMS severity/source formatting, its pre-existing 150 px greedy selector,
  selected-fire semantics, and LOD distance limits stay in `firmsHeatmap.js`;
  `firmsLabels.js` is formatting-only. FIRMS entries use the host's tactical
  card painter, vertical above/below placement, severity top rule, shared UI
  exclusion/clip, horizon culling, distance-alpha channel, and always-on
  `edgeFade: 'keyhole'` policy. Selected fires are protected in the selected
  lane and bypass both the 18-card ambient cohort and distance fade while
  excluding ambient cards from their footprint. Disable and destroy clear
  the source rather than leaving a stale host entry. This is not a
  pixel-for-pixel port: global collision/UI avoidance can choose fewer cards,
  host horizon culling is explicit, and ordinary map mode now retains the
  shared Outside floor instead of bypassing edge fade through the former
  cockpit/celestial gate.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Vessel card ownership

`aisLiveVessels.js` retains the 800 ms visibility
  pass, 118 px one-winner grid, priority ranking, 150 px greedy separation,
  type/detail formatting, and the AIS positions produced by its unchanged sea
  datum path. It publishes ambient tactical cards and one protected selected
  card into the host. `vesselLabels.js` is formatting/policy-only: no vessel
  canvas, projection, paint loop, or post-render listener remains. Ambient
  vessels share `ambient-card`; the selected entry paints in the selected lane,
  bypasses the ambient cohort/distance fade, and its protected rectangle
  excludes sibling ambient cards. Tracked readout still excludes AIS, avoiding
  a duplicate card for the same selection. Disable and destroy clear the host
  source. This is not a pixel-for-pixel port: shared cross-source collision,
  UI exclusion, and horizon culling can admit fewer cards than the isolated
  canvas, and the shared always-on keyhole policy now applies the shipped
  Outside floor in ordinary map mode instead of using the interim active-mask
  gate.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Tracked-readout ownership

`trackedReadout.js` is now a presentation-model
  bridge only; it owns no canvas, projection, post-render listener, layout,
  keyhole fade, or paint path. Civilian flights, military flights, satellites,
  and mapped installations write explicit `gevLabelModel` objects and expose
  `gevDisplayPosition` getters backed by their layer-owned frame/display cache.
  Selected AIS vessels continue using the vessel source's protected selected
  card, so they do not create a duplicate tracked readout. The host registers
  the active readout in the protected tracked lane with a zero ambient quota;
  protected semantics bypass that quota and reserve the painted footprint
  against ambient cards. Moving sources never fall back to a fresh
  `entity.position.getValue()` in post-render. Annotation fade queries the
  host's actual `getOverlayPaintRect('tracked', trackedId)` after layout and
  unions it with the tracked billboard extent. Untrack, context clear, and UI
  destroy clear/hide the source. This is not a pixel-for-pixel port: placement
  is host-rounded, cross-source/UI exclusion and horizon culling now apply,
  accents are source-stable rather than detection-theme-derived, and the old
  screen-coordinate deadband was removed in favor of the authoritative layer
  frame cache.
  Civilian and military poll reconciliation refreshes this model after fresh
  kinematics and again when a missed poll enters the `STALE` grace period.
  Satellite pre-render propagation refreshes its altitude line from the same
  per-frame SGP4 sample used by the tracked dot and camera.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — CCTV thumbnail ownership

`cctv.js` retains the 20/28/40 zoom selection,
  40-card shipped maximum, 112 px source declutter, eviction grace, frame
  fetching/cadence/retry, stable slot cache, last-success persistence, hover
  pinning, and activation. `cctvCards.js` is now source policy plus pure
  lifecycle helpers only; it owns no canvas, post-render subscription,
  Cesium projection, layout solve, paint pass, or hit store. The shared host
  paints its exact 96×54 thumbnail inside the 104×77 shipped chrome, applies
  the same 1.0→0.45→0.35 altitude scale and 7,500→9,500 m fade, shared
  keyhole fade, full UI exclusions, and tracked/protected footprint
  exclusion. Ambient entries paint nothing before their first successful
  frame; a user-pinned entry retains the documented immediate empty-chrome
  exception, and later failures never clear the last successful frame. The
  active camera is excluded from the 40-card ambient quota and has no host
  card by default: its monitor plane is the active representation. The
  product option `cctvLayer.setCardPresentationOptions({
  activeCameraCardEnabled: true })` may publish it through the retained
  protected path. CCTV leaders use the source cyan, remain vertical at the
  camera anchor except for the off-card edge clamp, and counter-scale to one
  CSS pixel through the altitude transform. Card hits come from
  `hitTestWorldOverlay` after a
  scene pick miss with no canonical scene-object ID. CCTV billboard ownership
  is proven by the owning collection/object rather than a bare upstream ID,
  so an independent sibling with a colliding ID still wins. As a completed,
  narrowly extended ownership hardening step, property-bearing Entity picks
  must also be the exact stored CCTV coverage/projection object; copying the
  `cctvCameraId` property cannot impersonate a camera. Card hits pass through the
  6 px / 400 ms gesture guard
  before activation and the existing click-to-fly event. CCTV cards are not
  sprite-focus-dimmed. Disable/destroy clear and hide the host source, stop
  pacing, detach in-flight image handlers, and empty source caches.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Cockpit left-panel chrome

opening any left-stack panel fades the
  overlapping left pitch-rail glyphs out. The separately right-anchored pitch
  rail remains visible, and panel/context-card stacking is unchanged.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Cockpit context stacking

the context card renders above visor glass,
  pitch/heading instruments, altitude/speed tapes, and the signal window.
  Topline vision and exit controls retain the highest in-cockpit layer.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Space Missions dependency shutdown

disabling a mission dependency or
  leaving the mode closes mission context and restores the exact pre-entry
  Satellite enabled state and presentation parameters. Restored parameters
  never re-show primitives while the Satellite layer is disabled.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Flights 3D/cockpit hardening

the destination-direction cue is an
  inline SVG rather than a remotely loaded Material Icons ligature, so a
  blocked or late font can no longer expand the literal word `navigation`
  across the cockpit. The grounded `airplane.glb` belly offset is calibrated
  to the current asset's measured Y-up bounds (`0.063` native units).
  Contact Previous/Next and Live Signals aircraft handoffs now
  re-seed the first-person camera anchor at the selected flight immediately;
  bounded feed-correction smoothing remains scoped to the same aircraft.
  When NEXT has no flight inside the normal 250 km Context window, it searches
  both civilian and military feeds at successively doubled radii through
  16,000 km and transfers the cockpit to the closest available aircraft.
  Tracked cameras now share one ENU frame across Cesium and the close-range
  guard: switches relocate to the new aircraft, zoom stops 150 m short of
  crossing the target, and the icon/model, label, trail head, and camera are
  prepared from the same frame. The guard frames once and then leaves
  Cesium's EntityView as the sole continuous camera writer. The tracked
  entity remains a pure position/billboard target with no unused aircraft
  orientation input; 3D→2D handoffs seed the current screen-projected course,
  course projection uses the camera's right/up basis so it remains valid
  through the >180° rear half of a tracked orbit, and the host readout consumes
  that same settled frame cache without a second dead-reckon. Selected
  3D models are seeded at the tracked position before scene insertion and
  update before scene preparation from one frame-cached sample, retain real-world scale at
  ordinary ranges, cap at 200 px
  when very close for a continuous 2D→3D handoff, and use a 40 px selected
  model floor near the long-range 3D→2D cutoff so the glTF silhouette remains
  comparable to the selected billboard; ambient model sizing is unchanged.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Minimal HUD right rail

constrained focus layout keeps the collapsed
  CCTV and Context launchers visible and accessible while the expanded
  Display panel scrolls inside an explicit remaining-height budget. The rail
  reserves both launcher heights and inter-panel gaps without a self-reversing
  layout measurement. Tactical HUD instead gives the expanded Display, CCTV,
  or Context panel exclusive use of the rail and hides its collapsed siblings
  until the active panel is collapsed.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Context-flow hardening

the cockpit left accordion stays below the HUD
  inside its measured safe top/bottom lane. Global Context focus guards exist
  only for the synchronous selection window, history survives same-layer
  reselection, and NEXT availability uses the same UNKNOWN-cohort gate as the
  navigation action. Contacts entry does not wait for unrelated serialized
  layer teardown; Space Missions waits for every incompatible live/current
  layer to settle off before replay data starts. A rejected teardown keeps
  that layer authoritatively enabled, restores any siblings already stopped,
  and aborts replay entry; the isolation
  guard remains active until Rocket Launches finishes enabling. Manually enabling
  another Data Layer is additive in both an active mode and the neutral shell:
  it does not exit Context, and the added layer joins the pre-entry snapshot
  when the session is eventually restored. Manually disabling a required mode
  dependency still exits and restores that union.
  While Space Missions is active, direct incompatible enables are refused
  before initialization or polling and explain that the mode must be exited.
  User entry alone owns the pre-entry snapshot; programmatic dependencies do
  not replace it, and rapid re-entry snapshots the pending settled restore
  target rather than partial manager state.
  Contacts-mode entry chooses the nearest aircraft to the current camera from
  one uncapped civilian-plus-military pool (military wins an exact distance
  tie), then falls back to the nearest AIS vessel. An initially empty set gets
  one retry on the next Awareness refresh tick rather than permanently losing
  automatic acquisition. Clearing a manually selected subject cancels that
  pending retry so an intentional deselection cannot acquire another contact.
  NEXT keeps a cycle-scoped visited set separate from PREVIOUS history. Once
  every current target is visited, it starts a deterministic new walk with the
  current subject retained as visited instead of re-admitting all candidates
  into a nearest-contact ping-pong. Expanded flight searches use the same reset
  rule. Vessel focus uses a 3 km bounding sphere at entry and during cycling.
  The user-facing mode is **CONTACTS**: it cycles the nearest contact of
  whichever supported type is selected (civilian or military plane, AIS vessel,
  or mapped installation). Satellites are explicitly outside the Awareness
  navigation cohorts and retain their independent tracking UX. The cockpit
  briefing opt-in is labeled `CYCLE OFF` / `CYCLE ON`, with state-specific help
  that distinguishes page cycling from continuously refreshed live data. The
  neutral standby summarizes both chooser modes, while the `CONTACTS` and cycle
  controls keep their short visible state as the accessible name and expose
  longer help only as a title.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — CCTV focus and teardown

explicit camera choices still activate during
  cockpit mode, but they retain aircraft tracking, suppress the view flight,
  and ask the user to exit cockpit. Layer enable is activation-only when a
  tracked entity or cockpit owns the view, with no flight or cockpit-exit toast.
  Voice select/next/previous/nearest actions report when tracking or cockpit
  refuses their requested flight without hiding the successful selection.
  Camera deactivation and layer disable both clear temporary probe clamps;
  disable re-arms the active record, re-enable restores nominal geometry without
  probing, and the next real activation re-runs the obstruction probe. Disable
  uses a direct hide sweep; obstruction hits retain the field-derived 12 m floor.
  Geometry-drain progress notifications are coalesced to roughly 300 ms or ten
  batches, whichever arrives first. Natural completion publishes its final
  state; disable publishes the terminal state explicitly when it cancels a drain.
  Coverage polylines are lazy: catalog init creates none, while enable in the
  default COVERAGE ON mode materializes the active camera and visible neighbor
  cohort (70 entities at the 14-camera cap). Activation always materializes the
  selected frustum, including COVERAGE OFF when projection remains on.
  Empty-space deselection removes the active projection and active-relative
  coverage emphasis but preserves the layer, coverage mode, ambient cards,
  catalog, panel settings, and viewer pose. With no active camera the panel
  exposes no stale dropdown/FOCUS/calibration target; NEXT starts at the first
  catalog entry and PREVIOUS starts at the last.
  While aircraft tracking or cockpit mode owns the view, the geometry drain
  rechecks ownership per batch and drops to two records every 250 ms. Enable
  focus decisions conservatively combine pre- and post-await ownership.
- Share-link camera restoration re-applies its settled pose and requests a
  render after the flight completes, ensuring Google Photorealistic 3D Tiles
  stream at a deep-link destination without requiring manual camera input.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Reversible Context handoff

enabling Global Context snapshots the exact
  enabled-layer set and every runtime parameter it changes, then clears
  unrelated active Data Layers. Mode switches, required-dependency disables, direct
  disable, and teardown restore that pre-entry state before control leaves
  Context. Directly switching between Flights and Space Missions remains
  supported without losing the original snapshot. Contacts waits for the
  dependency releases it owns before restoring that snapshot, so the first
  Space Missions selection completes without a stale teardown superseding it.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Space Mission horizon occlusion

mission dots and hover reticles apply
  their surface-anchor horizon state before Cesium draws or picks the frame,
  while shared-host labels use the same hidden-globe horizon contract. Rear-side
  markers therefore cannot remain from the prior camera frame, including in
  request-on-demand photoreal views; the conservative limb margin remains.
  Graphics that begin with Cesium's implicit visible default are enrolled in
  that pass on their first frame rather than bypassing the cull.
  Selecting a mission isolates its launch anchor until Show All / Deselect
  or the panel close control clears the selection.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Cockpit flight signals

Live Signals shows the current and nearest
  flight names as larger clickable controls. Selecting a name transfers the
  active cockpit tracker to that flight; type and distance remain secondary
  text without repetitive event-category headings.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Ground-safe cockpit

the first-person anchor and final camera position
  are clamped to the shared mesh-first rendered-surface floor with 12 m of
  clearance. In the photoreal stack, grounded entry keeps the existing safe
  map camera until that rendered mesh cell resolves instead of trusting a
  delayed/raw aircraft height as a temporary surface. Successful one-shot
  model ground snaps populate the same shared mesh cache, and repeated
  grounded source timestamps lift their stored history when the floor warms.
  Landing and taxi tracks therefore cannot place the camera below terrain or
  inside photoreal 3D Tiles.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Display panel width

across desktop HUD layouts, the expanded right-rail
  Display panel uses a 272 px glass-backed surface; its collapsed tab and
  narrow-screen layout retain their existing responsive widths.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Cockpit rolling telemetry

the central speed, heading, and altitude
  values use per-digit vertical rolls when their displayed values change.
  Increasing and decreasing values move in opposite directions, and heading
  accounts for the 359°/000° wrap.

## 2026-07-08–2026-08-02 (undated in source; bounded by surrounding entries) — Cockpit route cue

when reliable destination coordinates are available,
  the estimated-destination arrow occupies a fixed centered slot above the
  lower telemetry, follows the apparent ground-plane perspective, and rotates
  to show relative bearing within a legible ±120° steering range. Flights
  without destination enrichment omit the cue.
- The skylight feature set and six field-test hardening rounds shipped
  2026-07-03; **CCTV v2** shipped 2026-07-04.
  Voice tools are **28**. Global Context can be entered or exited directly,
  and Cockpit voice control supports status, entry from a selected or tracked
  aircraft (establishing Contacts first), exit, and filtered Previous/Next navigation through the full
  nearby-contact cohort. Contacts exposes source-honest counts inside its
  250 km subject window.

## 2026-07-08 — Height-datum system

Caltrans + TfL camera packs (~900
  cameras) and the height-datum work fix entity heights on the
  ellipsoidal globe end-to-end (geoid module, keyless Re:Earth terrain for the
  OSM stack, ground-floor system with rendered-mesh sampling, always-visible
  sprites/trails, OpenSky credit governor). The 2026-07-08 CHANGELOG entry
  records the subsystem's architecture, invariants, residuals, and verification.

## 2026-07-08–2026-08-19 (undated in source; bounded by surrounding entries) — Height-datum test surface

`npm test` 184 unit · `npm run
  test:track` 43 tracking invariants · headless QA harnesses under
  `scripts/qa-*.mjs` incl. `qa-height-datum.mjs` (numeric heights) and
  `qa-floor-verify.mjs` (any-airport ground-truth oracle).

## 2026-08-19 — Display-time ground floor (flights layer)

A grounded
  contact's render height is picked once per poll from the floor of its FIX
  cell, but what renders is the dead-reckoned position, which drifts across
  cells for the whole segment and for hundreds of metres while a contact
  coasts on a stale feed. On a graded apron that buried sprites under the
  mesh (measured −15.5 m at KAUS; `qa-floor-verify` reported FAIL). The fleet
  pass and the tracked display path now re-floor the DISPLAYED coordinate
  against `cachedGroundFloor` — read-only, grounded contacts only, and never
  while a 3D model owns the visual (T7 ground-snap one-shot). The poll's floor
  warm/sample batch additionally collects each grounded contact's display
  CORRIDOR (the ground it is about to cross — toward its newest fix while
  interpolating, along its course while coasting), need-ranked and deduped so
  parked contacts never crowd out moving ones. Budget is charged only for cells
  with no floor yet — warm cells are still emitted, because the mesh sampler
  must see a cell again once its DEM prior lands — which gives a service bound
  that falls out of the policy: every contact is served within
  `ceil(contacts / budget)` polls. Sample spacing along a projected arc derives
  from its length (never a fixed count, whose spacing widens with speed), and
  the cell walk steps at an eighth of a cell, so any cell the path occupies for
  ~14 m of ground or more is collected. The corridor
  integrates the SAME constant-rate turn the dead-reckon does, so a
  sustained-turn taxi warms its arc rather than a straight tangent. Visual
  ownership — not model existence — decides when the clamp stands aside: a model
  owns the visual only while it is actually RENDERING (`ready && show`, the
  pair the billboard handoff itself consults), and the tracked path also
  requires `_trackedModelRegimeActive()`. So neither a retained-but-hidden
  model (3D off, zoomed out, cockpit) nor one still loading suppresses
  flooring while the billboard is what the user sees. **The visual/data split is deliberate**: visual
  consumers are floored at the per-frame cache, while `_describeFlight` — and
  so `findByQuery`, `getTrackedInfo`, `getTrackedSubject` — keeps reporting
  sensor truth (barometric `altitudeM`, fix-time `renderAltitudeM`), because a
  query or an altimeter should answer what the aircraft reported, not where its
  icon was nudged to clear the tiles. Residual, unchanged by this
  work: the floor is a ~111 m cell, so intra-cell relief (terminals, jet
  bridges) and contacts moving faster than the 30 s warm batch can still read
  metres low. `qa-floor-verify.mjs` now **exits non-zero on FAIL** (1 = FAIL,
  2 = INCONCLUSIVE); it previously exited 0 on every verdict, which is how the
  burial stayed invisible. It also honours `QA_BASE_URL` and puppeteer's
  pinned Chrome-for-Testing, like the other harnesses.

## 2026-07-16 — The FIRMS Active Fires layer goes live
  the bundled 2026-05-25 sn

the FIRMS Active Fires layer is **LIVE** —
  the bundled 2026-05-25 snapshot (58 MB) is deleted; a new `/api/firms` proxy
  (vite.config.js) merges VIIRS NOAA-20/NOAA-21/Suomi-NPP NRT world CSVs
  (days=2 → trailing-24h clamp, 30 min memory+disk cache, single-flight,
  serve-stale-on-failure) behind server-side `FIRMS_MAP_KEY` (keyless → 503 +
  in-app KEY REQUIRED chip). Client polls 10 min (`src/data/firmsHeatmap.js`;
  adapter `src/data/firmsAdapt.js`, CSV parser `src/data/firmsCsv.js`).
  `/api/firms/status` reports cache age + MAP_KEY transaction usage.

## 2026-07-16 — Traffic supports optional live TomTom flow
  TomTom flow through the server-side, 

Traffic supports optional live
  TomTom flow through the server-side, budget-governed `/api/tomtom` proxy;
  keyless installs retain the byte-identical white-dot simulation.

## 2026-07-22 — CCTV v3 Parts A+B

replay, color-coded viewsheds,
  save-gated direct-manipulation calibration, `viewshed`/`adjust` voice
  actions, shared-floor E/N drag grounding, and bounded snapshot requests are
  integrated. Citywide static-plane LOD/pacing work remains outside runtime.

## 2026-07-02 — Milestone — skylight aircraft/satellite/enrichment work and pre-ship hardening

**2026-07-02 milestone:** the skylight aircraft/satellite/enrichment work and
pre-ship hardening fixes landed.
Runtime changes reflected below: **voice tools 17→20 at the 2026-07-02 milestone** (`next_iss_pass` + the 19 already on
main), type-aware 8-class aircraft sprites + path-derived rate-limited display heading, adsbdb
flight enrichment (cached proxy + route-plausibility gate), disk-cached CelesTrak TLE proxy,
ISS pass prediction, and per-layer data attribution. Gate at close: unit 98/98, build clean,
track 19/19, + five QA harnesses (heading 16/16, sprites 9/9, cctv 5/5, failstate 5/5,
attribution 18/18). New modules: `src/data/{motionModel,aircraftMeta,aircraftClass,aircraftIcons,issPass,routePlausible,dataCredits}.js`.
The live runtime now declares 28 voice tools; the 17→20 count above is retained only as milestone history.

## 2026-07-04 — CCTV v2 field validation

Field validation passed 2026-07-04 (core look + downtown no-clip confirmed) for the CCTV v2 pitched-frustum foundation; that round fixed three findings: the ground clamp now lifts the cap *center* only so the wireframe stays a true pyramid welded to the plane (was a flattened fan / the ~47.5 m divergence — RESOLVED), re-selecting the active camera is a no-op (killed a click-flash), and texture swaps gate on canvas content (killed a periodic white flash). Coverage grew to metro-wide 250 cameras (`CCTV_AUSTIN_MAX_SOURCES` default 36 → 250, hard bound 300) the same day, and city packs (Caltrans districts 4/7/11/3, TfL London JamCams) joined Austin as keyless default sources.

## 2026-07-05–2026-07-21 — CCTV v3 UX build and field validation

The viewshed + calibration gizmo UX was built 2026-07-05 and field validated 2026-07-21: the COVERAGE toggle became a tri-state cycle `OFF → ON → VIEWSHED` with color-coded translucent frustum volumes, and the 7 calibration sliders were deleted in favor of a direct-manipulation gizmo (`cctvGizmo.js`) with save-gated persistence. A gizmo hover-effect bug that mutated polyline geometry width (breaking the pick buffer and eating the following click) was root-caused 2026-07-05; input now checks the topmost depth-test-free handle with `scene.pick` first and falls back to `drillPick` only on overlap.

## 2026-09-14 — CCTV viewshed fill-volume exception for the active camera

The active camera's own fill volume is skipped while its monitor plane is showing — the fill is welded to the same far-cap corners as the plane and renders both faces (`cull: { enabled: false }`), so without the exception it sat opaque over the live video texture (reported: Bandung "Buahbatu" rendering solid red instead of its feed). The hue-tinted wireframe still renders for the active camera in this state, so the coverage-color identity isn't lost, just the occluding fill.

## 2026-09-22 — CCTV wireframe/viewshed-volume z-fight guard

The 4 corner rays and mount point are lifted `WIREFRAME_ZFIGHT_LIFT_M` (0.75 m) off the true frustum geometry along the local ellipsoid surface normal before becoming entity positions — root-caused to laptop-GPU-only flicker where ray endpoints skim terrain/3D-tile depth near-coincidentally (the bottom corner pair can sit below ground per the ground-clamp behavior), compounded by `depthFailMaterial`'s `EXT_frag_depth` dependency on inconsistently-supported GPUs. Not reproducible on every machine, so this is a root-cause-driven mitigation pending field confirmation, not a confirmed-complete fix. Same fix family as `VESSEL_LIFT_M` (`src/data/aisLiveVessels.js`) and `GROUND_FLOOR_LIFT_M` (`src/data/groundFloor.js`).

## 2026-09 — Detection-vs-CCTV-plane occlusion: pure geometry math, not `scene.pickFromRay`

Root cause of the reported bug (`VEH-XXXX` traffic labels drawing through the
3D CCTV monitor plane): the Universal Detection Overlay (`src/data/detection.js`)
paints on a 2D canvas layered above the WebGL scene and only ever tested
horizon/ellipsoid occlusion (`EllipsoidalOccluder.isPointVisible`) — it has no
concept of 3D scene geometry at all, so a bracket/label always composited
above whatever was actually in front of it in the 3D scene.

The obvious fix — a per-object `scene.pickFromRay` against the plane each
frame — was rejected. `cctv.js`'s `runActivationObstructionProbe` documents a
**zero-raycast-in-steady-state invariant**: exactly one raycast, once per
camera activation, never per frame. A live scene with dozens of traffic/
aircraft/vessel candidates would mean dozens of `pickFromRay` calls every
single frame, directly violating that invariant and adding real per-frame
scene-query cost to a paint loop that is already latency-sensitive.

Chosen fix instead: pure ray-vs-finite-rectangle intersection math
(`src/data/detectionPlaneOcclusion.js`, `isPointOccludedByPlane`/
`isOccludedByAnyPlane`) run against the plane's already-known
center/orientation/half-extents, read once per frame from the CCTV layer's
cached geometry (`cctvLayer.getOcclusionPlanes()`) — zero scene queries, same
purity standard `cctvGizmo.js`'s drag math already holds. Since at most one
CCTV monitor plane can ever be showing at a time (§2c one-plane-at-a-time
invariant in `cctv.js`), `getOcclusionPlanes()` returns an array of at most
one entry, making the per-object check a cheap empty-array no-op in the
overwhelmingly common case of no CCTV plane active. A grazing-angle guard
(`GRAZING_DOT_MIN`, mirroring `cctvGizmo.js`'s own guard for the same
underlying formula) avoids numerically unstable false positives when the view
ray is nearly parallel to the plane.

## 2026-07-29–2026-08-02 — CCTV citywide ambient cards build and shared-host migration

The LOD-selected nearby static-camera thumbnail cards (20/28/40 by zoom, `cctvLod.js`) were built 2026-07-29 and migrated onto the shared world-overlay host 2026-08-02, replacing whatever presentation preceded the shared-host card pipeline.

## 2026-09-14 → 2026-09-21 → 2026-09-22 — CCTV 3D monitor plane texture-copy failure (three iterative fixes, then an architectural fix)

The 3D monitor plane going solid black, then briefly showing "half" a frame, then still throwing `glCopySubTextureCHROMIUM` persisted across three iterative attempted fixes before being root-caused and replaced architecturally, all on 2026-09-22. Root cause across all three earlier attempts was the same: the plane's `ImageMaterialProperty` was bound directly to the live `HTMLVideoElement`, and Cesium's `Material.js` unconditionally calls `texture.copyFrom({source: video})` on that binding every render tick with no size-consistency check at all. Each earlier fix (rebuild-on-decoded-size-change, then a 2-tick debounce against a transient blip, then an immediate park-on-mismatch guard) added JS-side logic keyed off `videoWidth`/`videoHeight`, but a live diagnostic session confirmed hls.js's `recoverMediaError()` (invoked on a `MediaSource` error, which these unofficial feeds hit periodically) fully resets the `MediaSource`/`SourceBuffer`s via `detachMedia()`+`attachMedia()` with no corresponding change to `videoWidth`/`videoHeight` — a GL-error window no size-based guard can ever observe, because the reported resolution never actually changes.

Circuit-breaker invoked (CLAUDE.md rule: 2-3 failed fixes at the same root) rather than attempting a fourth size-guard variant. The architectural fix: the plane's material is now bound to the projection canvas (the same fixed-size offscreen double-buffer surface used for image feeds) from creation and never rebinds to the raw `HTMLVideoElement`, for any decoded size, at any point. The now-fully-superseded `rebuildVideoPlaneMaterial()` state machine (candidate/confirm ticks, `videoTextureW/H`, `textureMismatchGuardActive`) was deleted rather than left dead, since none of it can be reached anymore.

## 2026-09-28 — CCTV 3D monitor plane residual flicker on live video (proxy-video fix)

The 2026-09-22 double-buffer architecture (above) closed the GL-error crash, but a residual visible flicker on live HLS video remained even after a same-day dedup fix skipped redundant redraws when nothing new had decoded (`getVideoPlaybackQuality().totalVideoFrames` dedup — the video-mode equivalent of the image path's pixel-hash dedup). Root cause, confirmed against Cesium's own `Material.js` source: reassigning a canvas-backed `ImageMaterialProperty.image` to a NEW object reference (what the double-buffer swap does on every genuinely new frame) makes Cesium fully **destroy and recreate** the GPU texture, not update it in place — every swap is a real flash opportunity regardless of how infrequently it's triggered. The 2D panel's `<video>` preview never flickers because Cesium's native `HTMLVideoElement` binding path instead calls `texture.copyFrom({source: video})` — an in-place update, no destroy/recreate.

A raw `Cesium.Texture` + manual `copyFrom` fix was proposed first and explicitly rejected by the owner as too high-risk: it would make this codebase responsible for GPU-resource lifetime management Cesium currently owns entirely, a category of bug the 2026-09-22 incident (above) had *zero* of. Chosen fix instead reuses two already-tested, already-shipped mechanisms: `createProjectionProxyVideo()` creates a hidden, muted, autoplay `<video>` fed by `runtime.canvas.captureStream(12)` — the exact same `captureStream` call the 2D panel's mirror-stream preview (`getActiveProjectionMirrorStream()`, live since before this fix) already used — and binds it ONCE to `planeMaterial.image` at runtime creation. This lets the plane ride Cesium's own native in-place `copyFrom` path with zero new GPU-resource ownership on this codebase's side; Cesium remains the sole owner of texture create/destroy/copyFrom, exactly as before. `refreshProjectionTextures()` now no-ops for video mode whenever a live `proxyVideo` exists, eliminating the double-buffer swap (and its destroy+recreate) entirely for that path.

Structurally immune to both 2026-09-22 failure modes (mid-stream HLS decoded-size change; hls.js `recoverMediaError()` MediaSource reset with no `videoWidth`/`videoHeight` change) by construction: the proxy video's own source is `runtime.canvas` itself, whose size is the fixed `PROJECTION_CANVAS_WIDTH`/`HEIGHT` constants and never changes — real HLS frames still only reach the canvas via the unchanged `drawProjectionFrame()` → `ctx.drawImage(video, ...)` path, which already auto-scales any decoded size onto that fixed canvas. If `canvas.captureStream` is unsupported, `proxyVideo` stays null and video mode falls back unchanged to the pre-existing double-buffer swap (`PROJECTION_VIDEO_SWAP_MS`, ~12fps) — no regression for that environment, just no additional improvement.

## 2026-09 — CCTV camera picker: native select replaced with custom ARIA listbox

The camera picker in the CCTV panel used to be a native `<select id="cctv-camera-select">`. Its closed-state styling was custom CSS, but the open `<option>` popup is rendered entirely by the OS/browser and ignores that CSS: on Windows Chrome it rendered as a plain opaque-white OS listbox regardless of the dark closed-state styling, while macOS Chrome's native-select popup happened to honor `color`/`background-color` more faithfully — a platform rendering difference, not a regression. Fix: the `<select>` was replaced with a custom-built `role="listbox"` control so the open popup is ordinary page HTML/CSS instead of OS-native chrome, rendering identically on every platform.

Two follow-up fixes landed the same month: **Portal** — `#cctv-camera-listbox` is reparented onto `document.body` because `.cctv-panel-inner` has `backdrop-filter`, and per the CSS Filter Effects spec any element with `backdrop-filter`/`filter`/`transform` becomes the containing block for its `position: fixed` descendants — so left where `index.html` places it, the popup's viewport-relative `getBoundingClientRect()` coordinates resolved against the panel's box instead of the screen, rendering as a large mispositioned dark rectangle (field-reported same week as the initial ship). **Width** — `_positionCctvListbox()` now sizes the popup to `.cctv-panel-inner`'s content width rather than the trigger button's own width; the trigger sits between PREV/NEXT and is only ~1/3 of the panel's width, so a trigger-width popup truncated every camera label to a couple of characters (field-reported).

## 2026-08-16 — Hangar fleet: per-class real aircraft models

Since 2026-08-16 (Hangar fleet), aircraft models are PER-CLASS rather than one shared shape: real CC-BY GLBs for light/bizjet/turboprop/widebody/helicopter/uav (`CLASS_MODEL_REAL` in `src/data/aircraftClass.js`), the shared `airplane.glb` for the remaining civilian classes, and the military layer maps weight classes (real GLBs / 747 heavies / `jet.glb` fastjets).

## 2026-08-19 — Tracked-contact 2D↔3D handoff made default behavior

The tracked contact's 2D↔3D handoff became default behavior, driven by camera distance alone, independent of the DISPLAY-rail `3D` toggle (which continues to own the FLEET). Policy lives in `src/data/trackedModelRegime.js`: enter below `TRACKED_MODEL_ENTER_ALT_M` = 150,000 m, hand back to the billboard only above `TRACKED_MODEL_EXIT_ALT_M` = 172,500 m.

## 2026-08-20 — Tracked-model swap distance set by playtesting

The swap distance was set by playtesting: a first pass at 1,000,000 m switched too early; 2D reads correctly at ~600 km and the handoff belongs at ~150 km. Consequence, recorded on purpose: the tracked contact now enters 3D nearer than the FLEET does (`MODEL_ALT_CEIL_M` = 800,000 m, unchanged), so with the DISPLAY-rail `3D` toggle on, 150–800 km draws surrounding contacts as models while the selected one is still a glyph. The two enter/exit thresholds are asymmetric on purpose — a single threshold makes a tracked orbit sitting on the boundary strobe billboard↔model as the camera's altitude wobbles across it.

## 2026-10-05 — Scope intensity defaults to 0, shared themed scrollbar, scene popup scroll-close

- **Scope intensity first-run default is 0 (`SCOPE_INTENSITY_DEFAULT`), but the
  `sci` PARSE fallback stays 100.** Same split as feather (`scf` 35) and outside
  opacity (`ko` 5): a fresh boot with nothing said gets the new default; an old
  link with no `sci` was authored against a 100% mask and must still look that
  way.
- **Scene popup closes on any outside scroll instead of tracking its trigger.**
  The portaled popup is `position: fixed`; repositioning on every scroll would
  need a listener on every scrollable ancestor, whereas closing is one capturing
  `scroll` listener on the document. Popup height is capped at ~5 rows so it
  never overlaps the shot list.
- **One selector group carries the CCTV scrollbar look to the other panel
  scrollers** rather than duplicating the block per panel. The `#cesium-credits`
  lightbox list and the first-run/key-setup lists keep their own styling.

## 2026-10-05 — Esri Satellite boot basemap, Denpasar default CCTV camera

- **Boot basemap is `DEFAULT_BOOT_STACK = 'esri-imagery'` even when the Google
  tileset loads.** The tileset is still created (so choosing Google 3D is
  instant and `isStackAvailable('photoreal')` stays true) but is added with
  `show = false`. Cesium's `Cesium3DTileset.update` only runs while `show` is
  true, so a hidden tileset requests no tiles; deferring the load itself was
  not needed.
- **CCTV default is chosen at catalog init and `enable()`, not by "nearest to
  the camera".** The old default was `records[0]`, an Austin camera, because
  the live Austin source loads first; `enable()` filled it in before the panel's
  focus flow ran, so the fly-to never fired. A pending-default flag lets the
  panel's enable flow both activate and fly to the default exactly once, while
  a real selection or deselect clears it.
- **The scene picker is a second copy of the CCTV listbox pattern, not a shared
  component,** to avoid refactoring the shipped CCTV picker in the same change.
  Unify when a third picker appears.

## 2026-08-23 — Grounded 3D handoff made terrain-validity gated

A ready civilian or military glTF does not own the visual until `groundSnap` can answer with a MEASURED photoreal-surface height. Two states matter: COLD (nothing has ever resolved for this icao — model stays hidden, billboard stays floored) and WARM (a snap resolved and then a >`MOVE_INVALIDATE_M` (50 m) taxi move stopped it answering directly — the measurement is demoted to a bounded last-known rather than deleted, bounded by `HELD_SNAP_MAX_DRIFT_M` = 250 m, deliberately a quarter of the billboard chain's `HELD_FLOOR_MAX_DRIFT_KM` because a held snap IS the model's placement rather than only ever raising a sprite).

## 2026-08-22 — Detection defaults to ON for every style on first run

Since 2026-08-22, detection also STARTS on — Dense @ 75% for every style on a first run, Normal included — as a `GLOBAL_POST_DEFAULTS` baseline that does NOT set `_detectionUserOverridden`. This is distinct from the pre-existing exception where selecting a military style (CRT/NVG/FLIR) auto-enables the same Dense preset until the user manually changes detection.

## 2026-08-22 — Detection made to take no continuous-render hold

`src/data/detectionRenderDemand.js` was built so detection repaints on CHANGE and asks the governor for exactly one more frame while work that spans frames is still outstanding, rather than holding continuous render unconditionally. This is load-bearing for the detection-on-by-default flip: the old unconditional `holdContinuousRender('detection')` would have pinned every idle first-run tab at 60 fps, defeating the render governor. Measured on a parked scene with zero layers: 0 renders per 5 s with detection ON, identical to OFF; reinstating the hold gives 301. A live adversarial review found several invariants broken in the first cut before they were fixed (every kind of outstanding work must terminate; label fades count in both directions; paint and demand must share one monotonic timestamp, never `Date.now()`; a skipped paint defers, never cancels; a changed detectable set dirties the solve without requesting its own frame).

Verified live 2026-08-23: AIR brackets stay prompt because the AIRCRAFT LAYERS hold the render loop, not detection. Brackets are painted from live positions and take no part in detection's own change-notification system; the only reason a bracket doesn't go stale on a parked scene is that `flights.enable()` / `militaryFlights.enable()` each take a continuous-render hold for their own per-frame fleet animation. This is a coupling that a later perf pass could break silently if it strips those holds the way it stripped detection's own hold.

## 2026-08-22 → 2026-08-23 → 2026-08-24 — First-run post-processing defaults revision history

The reasonable-defaults batch landed 2026-08-22, was extended and partly revised 2026-08-23, and reached its final lock 2026-08-24. Values moved through several intermediate stops before settling:

- **Detection OUTSIDE opacity** moved `5% → 3% → 1%` (2026-08-24 final lock). `AIRCRAFT_BRACKET_FLOOR_ANCHOR` moves with it — both are `0.01` since the 2026-08-24 lock (`0.03` on 08-23, `0.05` before) — because the mapping is pinned to bracket BRIGHTNESS, not slider position.
- **Scope feather** moved `0% → 8% → 11%` (0% was a one-day hard-crop stop; 35% was the value before that). The `scf` PARSE fallback deliberately stays at `35` — a link predating `scf` was authored when 35 was what its author saw, and restoring the author's view is what a share link is for.
- **Detection Fade** opened at `7%` since the 2026-08-24 final lock, `16%` before it.
- **3D aircraft models** moved from `OFF` to `ON` in `proximity` mode as part of the same batch.

The `scf` / `ko` PARSE fallbacks deliberately do NOT move with the live defaults: they answer what an OLD LINK that omits the field meant, authored under that era's default (`scf` → 35, `ko` → 5); every link since carries both fields explicitly, so no era whose default later changed depends on a fallback either way.

## 2026-10-05 — Indonesia unofficial pack: Pelindung Bandung as a curated 60-camera subset

pelindung.bandung.go.id exposes an unauthenticated catalog (`:8443/api/cek`, 436 cameras) and live HLS streams (`:3443/video/...`), ~270 of which were serving fresh segments when probed. The pack takes **60** of them, not all: the global `DEFAULT_CCTV_MAX_SOURCES` cap is 900 and shared with Austin/Caltrans/TfL, every camera is an unofficial stream with no agreement behind it (a smaller footprint is easier to revoke and defend), and this is a demo. Selection = live at generation time, inside the Bandung bounding box, coordinate-deduped (42 duplicate-coordinate groups upstream), then farthest-point sampling for city-wide spread; malformed `https:/` URLs were normalized. Heading is unknown upstream, so `headingDeg: 0` with `headingConfidence: 'low'`.

Why Pelindung over ATCS Bandung: the ATCS catalog is reachable but every `:1990/<name>/index.m3u8` returns 404 (mediamtx, no publisher), including the 3 older Bandung rows, which remain in the pack but show no video. Bali Tower (`cctv.balitower.co.id`) timed out on 80/443 from the dev network and was not included. Bina Marga, BPJT, RTTMC and smartcity.jakarta.go.id were not probed in this change.

## 2026-10-05 — Bina Marga toll cameras: approximate positions, Cipali excluded

binamarga.pu.go.id/contents/cctv_tol lists 82 toll segments; each segment page embeds `<source ….m3u8>` streams from the concessionaires' own hosts, with a name ("ATP KM 61+400 A") but no coordinates. Rather than skip them or pull coordinates from a source outside the allowed list, 14 cameras are placed by linear interpolation of the KM number along a hand-drawn route polyline (anchors from general geography, not surveyed). This is explicitly low precision (~2 km+), so every row says `APPROX. LOCATION` in name, provider and license, `headingConfidence` is `low` and heading is the assumed road bearing. A test enforces the label.

Cipali (`cctvastra.lintasmarga.com`, 20 live streams) was dropped: its server sends an incomplete certificate chain, Node's fetch rejects it, and the proxy returns 502. Making it work would require turning off TLS verification for that host, which is not worth it for a demo. The Cipali anchors were never shipped. All 9 live Becakayu streams are included (GT Marga Jaya 1 404s upstream); the 4 ramp/loop cameras have no KM in their name, so their KM is guessed from the street name and the license says so.

Bali: nothing was added. The ATCS Denpasar camera list sits behind `/ldevice` + `/api/v3/pv`, which need Authorization and client headers embedded in the site's JS; using those was judged out of bounds, and guessing stream IDs would be enumeration. Bali Tower is unreachable from the dev network (80/443 time out).

## 2026-10-05 — ATCS Denpasar: 37 streams with guessed positions, two precision tiers

The operator supplied 37 `…/stream/<ID>/stream.m3u8` URLs copied from the public ATCS page's Network tab (no Authorization header on those requests); all 37 serve advancing live HLS and pass through the manifest proxy. The authenticated device API (`/ldevice`, `/api/v3/pv`) is still not touched. The stream IDs carry only a street name, so coordinates are inferred, in two honest tiers rather than one dishonest one: 21 streets were recognisable and placed from general knowledge of Denpasar (`APPROX. LOCATION`); 16 were not, and are spread on a ~600 m ring around the centre labelled `CITY-LEVEL ONLY` so they stay selectable without pretending to be anywhere specific. A test enforces the labels and Denpasar bounds. The operator chose "guess all, labelled" over waiting for real coordinates; replace rows as true coordinates arrive. The older `denpasar-unofficial-gunung-agung` row uses the `index.m3u8` path; the new ones use `stream.m3u8`.

## 2026-10-05 — ATCS Denpasar batch 2: 58 more streams, same labelling

The operator sent 58 further `…/stream/<ID>/stream.m3u8` URLs from the same Network-tab capture (no Authorization header). All 58 served advancing live HLS (media sequence moved between two probes 20 s apart; segments fetched 200). Three entries arrived malformed and were normalised to the standard form: `A075PASARSATRIAPTZ` (URL truncated at `stream.m3`), `A101BATUKARU-RINJANIPTZ` (double slash after `/stream/`), and `A102UDAYANA-BELITON` (no `PTZ` suffix; kept as given, it works). Positions follow the batch-1 two-tier scheme: 38 street/intersection guesses (`APPROX. LOCATION`) and 20 unidentifiable ones on a ring (`CITY-LEVEL ONLY`). The batch-2 ring is wider (~830 m) and rotated half a step so its markers never coincide with batch-1 ring markers. IDs contain hyphens for intersections, so the pack test's URL pattern now allows `-`.

## 2026-10-05 — Removed the 3 dead ATCS Bandung rows

`bandung-unofficial-samsat/buahbatu/pasteur` (`atcs-dishub.bandung.go.id:1990`) returned 404 on every probe since the pack landed (mediamtx had no publisher), so they could never play and only added dead entries to the unofficial-first camera list. Removed at the operator's request; re-add a row if the Dishub streams come back. Proxy tests that use `Samsat` URLs as sample inputs are unaffected (they exercise URL resolution, not the pack).

## 2026-10-07 — Bina Marga toll batches 4-7: catalog cap 900 → 1200, only the densest ruas

The portal lists 82 ruas; 451 live streams carried a parseable `KM nn+nnn` name. Rather than add all of them, batches 4-6 added the ruas with the most KM-bearing live streams (about 190 cameras across 15 corridors) and raised `DEFAULT_CCTV_MAX_SOURCES` from 900 to 1200, the existing hard clamp for `CCTV_MAX_SOURCES`. Over the cap the catalog is silently truncated (only a `console.warn`), so each batch was checked against the live `/api/cctv/sources` count (1087 after batch 6, ~110 slots spare) rather than trusting the arithmetic. The user chose "fill to the cap" over a smaller step, but the last ~110 slots stay free so a later pack cannot push cameras off the end.

Batch 7 added Dalam Kota/JTC (20 cams, KM 0+400-19+000): the OSM Cawang-Pluit chain via Tomang is 18.3 km while the operator's KM runs to ~20, so camera KM is scaled linearly onto the chain; against Wikipedia's interchange KMs that leaves up to ~1 km of error, within the "approximate" label. Catalog count after batch 7: 1107.

Deferred on purpose: Semarang ABC (names like `KM 431 C + 800 - C/B` mix a KM with an A/B/C section letter, and which origin applies to each section is not stated), Gempol-Pasuruan and Pasuruan-Probolinggo (the OSM chains do not connect, nearest gap 10.5 km, so each would need an invented origin), Solo-Ngawi and Palimanan-Kanci (few cameras, origins unverified), Terbanggi Besar-Kayu Agung (KM 162-214 on a 160 km chain whose origin is ambiguous). A wrong origin moves every camera of a ruas by the same error, which is worse than leaving the ruas out. Cipali (`cctvastra.lintasmarga.com`) stays excluded for the TLS-chain reason in the 2026-10-05 entry.

KM origins are assumptions per corridor (listed in `docs/CURRENT-STATE.md`), set from Wikipedia interchange KMs where available; Sedyatmo uses 19.0 so it meets the JORR crossing (an earlier 18.6 put the junction ~400 m off). Streams that returned 000/502/504 on three probe rounds (five Medan-Tebing Tinggi KM 58-62 cameras) were dropped instead of shipped dead. One builder rounding bug produced `headingDeg: 360`; it is normalised to 0 and the pack test rejects values outside 0-359.

## 2026-10-07 — ATCS Surabaya: 141 streams, catalog cap 1200 → 1400

The operator copied 157 stream URLs from the Surabaya ATCS page's Network tab (no Authorization header; the repo does not touch any authenticated API). Rather than trusting the list, every URL was probed through four passes with a gap between them (the host throttles: a first run with 8 parallel connections made about 40% of requests time out, so the final passes used 2). A stream was kept only if its `EXT-X-MEDIA-SEQUENCE` advanced between passes: 139 kept in the first pass (two more recovered later, see below), 10 excluded because the sequence stood still or the playlist was empty, 7 excluded because they always return 404, and one URL was a duplicate (`cctv_422`, listed twice under different names). One entry pointed at a segment (`cctv_479/stream0.ts`); it was normalised to the sibling `stream.m3u8`, which is live. Entries 87-88 are simply absent from the operator's numbering.

The stream host is plain `http://` on a bare IP:5000. The existing media proxy already accepts `http:`/`https:` and the registered pack row is the only allowlist (a segment on a different origin is refused), so no proxy change was needed; the pack test pins that one plain-http host instead of loosening the https rule for every row. A live segment through `/api/cctv/media/:id/rel` returned 200 and a foreign origin returned 404.

Positions follow the Denpasar two-tier scheme: 133 street/intersection names were placed from general knowledge of Surabaya and are labelled `APPROX. LOCATION` (error roughly 1-3 km, possibly more); 8 names that could not be identified are spread on a ~900 m ring around the centre and labelled `CITY-LEVEL ONLY`.

Capacity: the catalog held 1107 rows against a hard cap of 1200, so 139+ more would have been silently truncated. The user chose to raise the cap to 1400 (both `DEFAULT_CCTV_MAX_SOURCES` and the `Math.min` clamp in `src/data/cctvProxy.mjs`) over trimming the batch. The catalog is now 1248 rows; the cost is a heavier CCTV layer when everything is shown, not a correctness change.

The one Cianjur URL (`atcs.cianjurkab.go.id:5443/LieApp/...`) was not added: the host timed out on every attempt (including its root), so liveness could not be shown. It can be added later with the same method.

Re-probe of the 10 "frozen" streams (single connection, 4 passes 25 s apart): `cctv_194` and `cctv_78` had resumed and advanced in every pass, so they were added (141 total). The other 8 stay out: 7 returned an identical media sequence in all four passes (119, 285, 463, 455, 483, 387, 350; 350 reports sequence 0), and `cctv_484` now returns 404. A frozen playlist means the encoder is stalled, which a viewer would see as a still frame, so excluding it is deliberate.

## 2026-10-07 — ATCS Cianjur: one stream, city-level position

The Cianjur URL timed out on every attempt during the Surabaya batch (even the site root), so it was held back rather than added unproven. A retry later the same day answered 200 three times in a row; the media sequence advanced (3102 → 3106 over 20 s), a segment fetch returned 200 `video/MP2T`, and the same checks passed through `/api/cctv/media/:id` and its `/rel` path. It uses the standard HTTPS row shape (non-443 port 5443 needed no proxy change). The stream name `liliarahsuroso` does not identify a street, so the single row is `CITY-LEVEL ONLY`, at the centre of Cianjur town; the earlier timeout looks like an intermittent host, so the stream may drop out again.

## 2026-10-07 — ATCS Mataram: 12 streams, LL-HLS served as plain HLS

The operator's list had 23 lines but only 12 distinct URLs; several labels (simpang 4 amm, airlangga, kamboja, walikota, rembiga, tanah aji barat/timur/utara, golkar barat, taman utama, bundaran tugu pesawat) map onto the same URL, and labels often do not match the slug. One row is kept per URL and named from the slug, which is the only identifier the source itself provides; the label→URL mapping from the list is not trusted. All 12 advanced their media sequence across 3 probes 20 s apart.

The playlists are Low-Latency HLS (`EXT-X-PART`, `PRELOAD-HINT`, `SERVER-CONTROL:CAN-BLOCK-RELOAD`). The proxy fetches each playlist as a plain GET and cannot hold a blocking reload open, and `EXT-X-PART` / `PRELOAD-HINT` URIs were not rewritten to the proxy, so hls.js in low-latency mode would request parts straight from our origin (404) and reload without blocking. `rewriteHlsManifest` now drops those tags; the complete `EXTINF` segments that remain are a valid standard live playlist (init + segments proxied, checked through a temp dev server: playlist 200 with no LL tags, init.mp4 200, segment 200, foreign origin on `/rel` 404). The cost is a few seconds more latency than true LL-HLS, irrelevant for a monitor plane.

Positions follow the Denpasar/Surabaya tiers. 6 rows (Gajah Mada, Pelican Udayana, BI, Taman, Pagesangan x2) are anchored on OpenStreetMap place searches and labelled `APPROX. LOCATION` (error ~1–3 km); the 6 where no place resolved (Tanah Aji, Sweta, Turide, Golkar x3) sit on a ring around the centre of Mataram as `CITY-LEVEL ONLY`.

## 2026-10-12 — ATCS Pasuruan and Sumedang: 66 streams, one scoped TLS fix (Malang: see next entry)

The operator's lists were Pasuruan 33 lines (WARUNGDOWO_TENGAH twice), Sumedang 36, Malang ~210. Pasuruan: 2 URLs (Exit Tol Purwodadi, Exit Tol Gempol) return 404, so 31 rows. Sumedang: 35 distinct URLs. All 66 return a valid `#EXTM3U` playlist and a first segment through the proxy.

Pasuruan first failed with 502 on every camera. Cause: the origin sends its leaf certificate twice and never the intermediate (DigiCert Global G2 TLS RSA SHA256 2020 CA1). Browsers and curl fetch the missing intermediate from the certificate's AIA URL; Node's `fetch` does not, so it raised `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. The fix adds that one public intermediate (from the AIA URL, SHA-256 C8:02:5F:9F…:25:A9, valid to 2031-03-29, chains to DigiCert Global Root G2) to Node's default trust list at proxy start (`src/server/intermediateCaTrust.mjs`, certificate in `config/ca/`). Verification stays on; an intermediate only vouches for certificates it issued, so no host gains trust it lacked with a complete chain (an expired host still fails: checked against expired.badssl.com). `rejectUnauthorized:false`, a per-request agent and `NODE_EXTRA_CA_CERTS` were rejected (the first disables verification for everyone; the others add a dependency or an out-of-repo setup step). The trust list is process-wide rather than per host, because Node has no per-host CA option for the global `fetch` without adding `undici`. Pasuruan's leaf certificate expires 2026-12-07; if the operator renews it with the same chain nothing changes, otherwise the new intermediate must be added to `config/ca/`.

Positions are guesses from the street label (OSM place search): 21 + 23 `APPROX. LOCATION`, 10 + 12 `CITY-LEVEL ONLY`. Sumedang's URL path embeds a token that looks like a Shinobi API/group key; it is a public-page URL copied from the browser, but it can be rotated by the provider, which would break those 35 rows (revoke by prefix).

Malang was held back in this entry and added in the next one.

## 2026-10-12 — ATCS Malang: 199 streams behind an anonymous portal session

The ~210 lines the operator supplied held 199 distinct URLs; 10 URLs appeared with two different labels (the first is used). The streams answer 403 ("Akses Ditolak") without a session. Measured: only the cookie `nancy_auth_v1c` plus `Referer: https://cctv.malangkota.go.id/sebaran-cctv` are needed (`NANCY_TOKEN_Q/W` and `ci_session` are not), and the cookie is bound to the User-Agent that obtained it. A plain GET of the portal root (307 to `/sebaran-cctv`, `Set-Cookie` on each hop, Max-Age 3 h) issues it with no login, so this is the same access the public page gives any visitor, not a credential; it is still unofficial and revocable by prefix.

Design (`src/server/portalSession.mjs`): opt-in per catalog row (`portalSession`), so no other source changes behavior; same-origin validation of the bootstrap URL and of every redirect (≤5 hops); cookies held in memory per origin, never logged or sent to the browser; TTL = min(cookie Max-Age, 30 min) so a revoked cookie is not trusted for hours; concurrent bootstraps coalesced; a 403 forces one refresh and one retry, with forced refreshes rate-limited to once per 30 s so a dead origin cannot make the proxy hammer the portal. Using one fixed proxy UA for bootstrap and streams is what keeps the UA-bound cookie valid. Rejected: copying the operator's browser cookie into config (a secret that expires in hours) and replaying it from the browser (the cookie is host-bound and would need CORS).

Malang also omits its TLS intermediate (GeoTrust TLS RSA CA G1, from the AIA URL, valid to 2027-11-02, SHA-256 C0:6E:30:7F…:23:0E). It joins the DigiCert one in `config/ca/` under the same scoped-trust reasoning as Pasuruan. The leaf expires 2026-11-09.

Positions: 100 of 127 distinct streets resolved through an OSM place search (167 rows `APPROX. LOCATION`, same-street cameras spread ~40 m); 32 rows sit on a ring around central Malang (`CITY-LEVEL ONLY`). Capacity: the merged catalog reached 1526 rows against a cap of 1400, which silently kept only 73 of the 199 Malang rows. The cap (`DEFAULT_CCTV_MAX_SOURCES`, its `Math.min` clamp and the health-map size, now one constant) was raised to 1600. The cost is a heavier CCTV layer when everything is shown. Verified through the dev proxy: 199/199 playlists and a first segment (HTTP 200, MPEG-TS), Pasuruan 31/31, Sumedang 35/35.

Mitigasi sementara: the session approach rests on the portal's present behavior (cookie name, UA binding, Referer check); if Pemkot Malang changes it, all 199 rows 403 until `portalSession.mjs` is adapted.

## 2026-10-08 — CCTV HLS live-sync distance: back to hls.js default (3 segments)

`liveSyncDurationCount: 5` was set when the only slow source was Jakarta (~7.5 s segments, 1–14 s fetch times). The count multiplies each stream's own `EXT-X-TARGETDURATION`, and the pack has since grown hosts with very different shapes. Measured live windows (2026-10-07): Denpasar and Mataram 2 s segments / 14 s window, Serbaraja and hk-opt 2 s / ~10 s, Surabaya 3 s / 7.5 s, Jasamarga 10 s / 22 s. With 5 segments, a 2 s-segment host plays 10 s behind live with only ~4 s (Denpasar/Mataram) or ~0 s (Serbaraja, hk-opt) before the segment being fetched leaves the playlist; a slow fetch or a late timer then has little room before the segment being fetched leaves the playlist. hls.js does not retry 4xx, so such a miss costs a `startLoad()` recovery and a visible freeze.

The override is removed rather than replaced by a seconds-based value: the default (3 segments) gives 8 s margin on Denpasar/Mataram and keeps the old fixed count from sitting further outside the short windows of Surabaya/Jasamarga. A per-playlist computed `liveSyncDuration` was considered and left out as more machinery than the evidence justifies.

**This change is not the fix for the `denpasar-unofficial-gunung-agung` `/rel` 404 on `seg19122`** (reported while the live head was ~seg19158). That segment was ~36 segments (~72 s) behind the head, far outside a 14 s window, so a live-sync margin shortfall of a few seconds cannot explain it. The margin change only narrows the room for small, late requests; it was made because 5 segments is demonstrably too far back for 2 s-segment hosts, independent of that 404. The probable cause of the 72 s-stale request is a tab that was in the background: hls.js has no visibility handling and its playlist-reload and fragment timers are throttled there, so on return it asks for a segment from a stale playlist the upstream has already deleted. That is inferred from the hls.js source and upstream probes, not reproduced in a browser (see "CCTV HLS: reload on tab return" below). A separate, confirmed upstream behaviour also produces single 404s unrelated to the client: the oldest segment still listed in the playlist is sometimes already deleted, and the stream's segment prefix and sequence reset when the encoder restarts. If 404s persist with the tab in the foreground, look at `hls.latency` and the fragLoadError details before tuning further.

## 2026-10-08 — CCTV HLS: reload on tab return

Symptom: `denpasar-unofficial-gunung-agung` `/rel` returned 404 for `seg19122` while the live head was ~seg19158 (~72 s back, far outside the 14 s window). hls.js has no `visibilitychange` handling, and a hidden tab throttles the timers behind its playlist reloads and fragment loads, so after a long hide the player resumes with a stale playlist and playhead and requests segments the upstream has deleted. hls.js does not retry 4xx, so each miss is a fatal `FRAG_LOAD_ERROR` and a recovery cycle.

Chosen: on `visibilitychange` back to visible after ≥10 s hidden (`HLS_RELOAD_AFTER_HIDDEN_MS`, above the shortest measured live window of ~7.5 s), call `hls.loadSource(hls.url)` on the active camera's instance. On an attached instance that is a clean restart: `MANIFEST_LOADING` resets `startFragRequested`, `lastCurrentTime` and the levels, the media source is rebuilt, and the new playlist puts the playhead at the live edge. `startLoad(-1)` was rejected: it overrides the start position with the stale `lastCurrentTime`, i.e. the same bad position. Only the active camera is reloaded; inactive ones are paused and are handled by the deferred stop-loading-on-deselect work.

Status: the cause is inferred from the hls.js source and upstream probes and has **not been reproduced in a browser**. Expected check: hide the tab for several minutes on a Denpasar camera and confirm no `/rel` 404 on return. A separate, confirmed upstream behaviour (the oldest listed segment already deleted, encoder restarts changing the segment prefix and sequence) still yields occasional single 404s that this change does not address; the existing bounded `startLoad()` recovery covers those.

## 2026-10-08 — Startup restore: splash waits for the view, basemap is never restored

Symptoms (reported with screenshots): after a reload the "Restoring shared view..." splash stayed up for a long time while the CCTV chip counted `LOADING FRAMES`, and the app came back on Google 3D instead of Esri.

Causes (read from code; per-stage timings were not measured): every reload of the same tab is a share restore, because the hash is written continuously. The splash waited on `initialRestorePromise`, the aggregate of the 1.5 s pre-flight timer, the 3 s camera flight, and the lifecycle of every saved layer, so a heavy layer (CCTV) held the cover. Separately, `main.js` activates Esri at boot and the hash `map=photoreal` was then applied on top, so Google 3D loaded second.

Chosen:
- The splash gates on a narrower `initialViewReadyPromise` (camera + visual/panel callback). Saved layers still restore, still hold hash-write suppression via the full aggregate, and show their own chips. The 1.5 s timer and 3 s flight stay: they exist so a recipient sees the shared pose animate in, and they are small next to layer restore.
- The basemap leaves the share/hash contract entirely (not written, not parsed, not restored), instead of "restore only Esri". Ignoring `map=` makes Esri the only load path with no second activation; a half-honoured key would still need the hash to be rewritten on every reload.

Trade-off: a user who prefers Google 3D re-selects it after each reload, and shared links no longer reproduce the sender's basemap. Chosen explicitly by the owner (Google 3D is opt-in).

Not done: restoring layers lazily after first interaction, or lowering the 1.5 s timer. Both would change when saved layers start and were not requested.
