/**
 * enrichmentQueue.js — adsbdb type/route enrichment queue + throttle
 * (Wave 3 item #31 of the file-split program, extracted out of flights.js).
 *
 * flights.js's private module state (bounded fan-out request queue, the
 * ambient fleet type-classification sweep, and its rolling token-bucket
 * budget) is unchanged in behavior by this extraction — this module was
 * only ever imported/instantiated by flights.js, so there is no shared-
 * module reconciliation to do here (unlike items #28-#30's flights.js /
 * militaryFlights.js pairs): militaryFlights.js has no adsbdb enrichment
 * at all (its aircraft are pre-classified from the military registry), so
 * there is no Tier B/Tier A split to preserve — this is a straight
 * relocation, not a merge.
 *
 * Why: a parked/taxiing plane's feed data rarely carries a real aircraft
 * type or route (OpenSky's `category` field is 0/"no info" for ~94% of
 * planes in the field), so this module asks the free community adsbdb API
 * for type + registration + route, best-effort and fail-silent, bounded so
 * it can never (a) hammer adsbdb or (b) starve the plane the operator just
 * clicked behind a deep ambient backlog:
 *  - Bounded fan-out: max `maxInflight` concurrent requests, dispatches
 *    dripped at least `dispatchGapMs` apart (a rate ceiling independent of
 *    inflight count).
 *  - Priority lane: tracked-plane and about-to-render-in-3D lookups jump to
 *    the front of the queue; the ambient sweep (below) only ever fills the
 *    back.
 *  - Per-session dedup: each request key (`t:<icao>` / `r:<callsign>`) is
 *    looked up at most once per session — repeat sessions resolve instantly
 *    from the dev-server proxy's permanent per-key disk cache (negative
 *    results included), so this queue never even re-asks.
 *  - Ambient sweep budget: a rolling token bucket (starts full at `ceil`,
 *    refills `refillTokens` every `refillWindowMs`, clamped at `ceil` — no
 *    banking beyond one bucket) bounds the SUSTAINED ambient request rate
 *    well under the drip's hard ceiling, so a long session in a busy region
 *    can't monopolize the community API even though a fresh region still
 *    gets an initial classification burst.
 *
 * Same per-layer factory-closure pattern as `groundSnap.js`/
 * `deadReckoning.js`: the caller supplies accessor closures for state that
 * gets reassigned (flight-data/billboard maps, tracked icao/entity, viewer,
 * billboard collection — all replaced wholesale by flights.js's test-seed
 * and destroy() paths) plus callbacks for the two touch points genuinely
 * owned by the caller (re-presenting a billboard whose class changed,
 * resyncing a 3D model to a new class, refreshing the tracked label). A
 * captured direct reference to any of the reassigned bindings would go
 * stale the first time flights.js's destroy()/test-seed hooks ran.
 */

const REQUEST_PATTERN_TYPE = 'type';
const REQUEST_PATTERN_ROUTE = 'route';

/**
 * Create a per-layer adsbdb enrichment queue + ambient sweep instance.
 *
 * @param {object} deps
 * @param {() => Map<string, object>} deps.getFlightData - icao24 → flight metadata (reassigned on test-seed/destroy)
 * @param {() => Map<string, import('cesium').Billboard>} deps.getBillboards - icao24 → fleet billboard (reassigned on test-seed/destroy)
 * @param {() => import('cesium').Viewer|null} deps.getViewer
 * @param {() => import('cesium').BillboardCollection|null} deps.getBillboardCollection
 * @param {() => string|null} deps.getTrackedIcao
 * @param {() => import('cesium').Entity|null} deps.getTrackedEntity
 * @param {(klassMeta: {typeCode: string, category: *}) => string} deps.classifyAircraft - same signature as aircraftClass.js's export
 * @param {(camera: import('cesium').Camera) => {isPointVisible: (p: import('cesium').Cartesian3) => boolean}} deps.horizonOccluder
 * @param {(icao24: string, bb: import('cesium').Billboard) => void} deps.applyFleetBillboardPresentation - re-presents a billboard after its class changed
 * @param {(icao24: string) => void} deps.syncModelToClass - resyncs a live/pending/tracked model after its class changed
 * @param {(icao24: string) => void} deps.updateTrackedLabelModel - refreshes the tracked HUD label after an enrichment lands
 * @param {number} [deps.maxInflight=4] - max concurrent adsbdb requests
 * @param {number} [deps.dispatchGapMs=200] - min ms between dispatches (the drip; ≤5 req/s at the default)
 * @param {number} [deps.ambientBudgetCeil=300] - ambient sweep token-bucket ceiling (also the initial-burst size)
 * @param {number} [deps.ambientRefillTokens=150] - tokens added back per refill window
 * @param {number} [deps.ambientRefillWindowMs=300000] - refill window length (ms)
 * @param {number} [deps.ambientPerSweep=150] - max new ambient enqueues per poll sweep
 * @param {string} [deps.qaOverrideGlobal='__GEV_ENRICH_AMBIENT_QA'] - `window[...]` key headless QA harnesses use to shrink the bucket knobs (can't wait out a real multi-minute window); read lazily each refill so a pre-boot override or mid-run swap applies. Left overridable (not hardcoded) since a future caller with a different global name is plausible.
 * @returns {object} enrichment engine instance — see method JSDoc below
 */
export function createEnrichmentQueue(deps) {
  const {
    getFlightData, getBillboards, getViewer, getBillboardCollection,
    getTrackedIcao, getTrackedEntity, classifyAircraft, horizonOccluder,
    applyFleetBillboardPresentation, syncModelToClass, updateTrackedLabelModel,
    maxInflight = 4,
    dispatchGapMs = 200,
    ambientBudgetCeil = 300,
    ambientRefillTokens = 150,
    ambientRefillWindowMs = 5 * 60 * 1000,
    ambientPerSweep = 150,
    qaOverrideGlobal = '__GEV_ENRICH_AMBIENT_QA',
  } = deps;

  let active = 0;
  let lastDispatchMs = 0;
  /** @type {ReturnType<typeof setTimeout>|null} pending drip wake-up */
  let dripTimer = null;
  const queue = [];
  const seen = new Set();
  let ambientBudget = ambientBudgetCeil;
  /** Epoch ms the bucket last accounted a refill window from (0 = unset). */
  let ambientRefillAnchorMs = 0;

  function enqueue(key, url, onData, priority = false) {
    if (seen.has(key)) return;
    seen.add(key);
    const job = { url, onData };
    // Priority (tracked / model-eligible) goes to the FRONT so a deep ambient
    // backlog can never delay the plane the user just clicked or zoomed into.
    if (priority) queue.unshift(job); else queue.push(job);
    drain();
  }

  function drain() {
    while (active < maxInflight && queue.length) {
      // Drip: at most one dispatch per dispatchGapMs. When the gap hasn't
      // elapsed yet, park a single wake-up timer and stop — completions and
      // enqueues in the meantime re-enter here harmlessly.
      const wait = dispatchGapMs - (Date.now() - lastDispatchMs);
      if (wait > 0) {
        if (!dripTimer) {
          dripTimer = setTimeout(() => { dripTimer = null; drain(); }, wait);
        }
        return;
      }
      lastDispatchMs = Date.now();
      const job = queue.shift();
      active += 1;
      fetch(job.url)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (data && data.found) job.onData(data); })
        .catch(() => { /* enrichment never surfaces errors */ })
        .finally(() => { active -= 1; drain(); });
    }
  }

  const engine = {
    /** Request adsbdb TYPE (typeCode/typeName/registration) enrichment for one contact.
     *  Best-effort, fail-silent, requested at most once per session. On a landed
     *  answer that changes the contact's class, re-presents its billboard and
     *  resyncs any live/pending/tracked model.
     *  @param {string} icao24
     *  @param {boolean} [priority=false] - jump to the front of the queue (tracked / model-eligible) */
    requestTypeEnrichment(icao24, priority = false) {
      if (!/^[0-9a-f]{6}$/i.test(icao24)) return;
      enqueue(`t:${icao24}`, `/api/adsbdb/type/${icao24.toLowerCase()}`, (data) => {
        const meta = getFlightData().get(icao24);
        if (!meta) return; // evicted while the lookup was in flight
        meta.typeCode = data.typeCode || meta.typeCode;
        meta.typeName = data.typeName || meta.typeName;
        meta.registration = data.registration || meta.registration;
        if (meta.typeCode) {
          const klass = classifyAircraft({ typeCode: meta.typeCode, category: meta.category });
          if (klass !== meta.klass) {
            meta.klass = klass;
            const bb = getBillboards().get(icao24);
            if (bb) applyFleetBillboardPresentation(icao24, bb);
            // Hangar fleet: the class's GLB/scale may have changed — resync the
            // live model, any in-flight load, and the tracked standalone model.
            syncModelToClass(icao24);
          }
        }
        if (icao24 === getTrackedIcao() && getTrackedEntity()) updateTrackedLabelModel(icao24);
      }, priority);
    },

    /** Request adsbdb ROUTE (airline/origin/destination) enrichment for one
     *  contact. Only fires for airline-style callsigns (LLL + digit) — GA
     *  tails won't resolve — and only for the TRACKED plane (always priority).
     *  @param {string} icao24 */
    requestRouteEnrichment(icao24) {
      const cs = String(getFlightData().get(icao24)?.callsign || '').trim().toUpperCase();
      if (!/^[A-Z]{3}\d/.test(cs)) return;
      enqueue(`r:${cs}`, `/api/adsbdb/route/${encodeURIComponent(cs)}`, (data) => {
        const meta = getFlightData().get(icao24);
        if (!meta) return;
        meta.airline = data.airline || meta.airline;
        if (data.origin && data.destination) meta.route = { origin: data.origin, destination: data.destination };
        if (icao24 === getTrackedIcao() && getTrackedEntity()) updateTrackedLabelModel(icao24);
      }, true); // route lookups only fire for the TRACKED plane — front of the queue
    },

    /** Read the ambient sweep knobs, applying a headless-QA override if the
     *  caller's global is set (production never sets it; the constructor
     *  defaults apply). Read lazily each refill so a pre-boot override (or a
     *  mid-run windowMs swap) applies. */
    ambientBudgetKnobs() {
      const o = (typeof window !== 'undefined' && window[qaOverrideGlobal]) || null;
      return {
        ceil: Number.isFinite(o?.ceil) && o.ceil > 0 ? o.ceil : ambientBudgetCeil,
        refillTokens: Number.isFinite(o?.refillTokens) && o.refillTokens > 0 ? o.refillTokens : ambientRefillTokens,
        windowMs: Number.isFinite(o?.windowMs) && o.windowMs > 0 ? o.windowMs : ambientRefillWindowMs,
      };
    },

    /** Advance the token bucket: add refillTokens per FULLY elapsed window
     *  since the anchor, clamp at the ceiling, and move the anchor forward by
     *  the whole windows consumed (while the bucket sits full this still
     *  advances, so idle time never banks more than one bucket's worth of
     *  burst).
     *  @param {number} nowMs */
    refillAmbientBudget(nowMs) {
      const { ceil, refillTokens, windowMs } = engine.ambientBudgetKnobs();
      if (!ambientRefillAnchorMs) { ambientRefillAnchorMs = nowMs; return; }
      const windows = Math.floor((nowMs - ambientRefillAnchorMs) / windowMs);
      if (windows <= 0) return;
      ambientBudget = Math.min(ceil, ambientBudget + windows * refillTokens);
      ambientRefillAnchorMs += windows * windowMs;
    },

    /** Ambient fleet type-classification sweep — run once per poll. Enqueues
     *  ON-SCREEN, not-yet-requested planes NEAREST-TO-CAMERA FIRST, bounded by
     *  the shared queue's concurrent/drip dispatch, `ambientPerSweep` new
     *  enqueues per call, and the rolling token-bucket budget. Fail-silent by
     *  contract: never throws into the poll loop, never blocks rendering,
     *  never touches tracking state.
     *  @param {import('cesium').BoundingSphere} scratchBoundingSphere - scratch reused across candidates (frustum-visibility test only; caller owns it so this module carries no Cesium import) */
    sweepAmbientEnrichment(scratchBoundingSphere) {
      engine.refillAmbientBudget(Date.now());
      const viewer = getViewer();
      const billboardCollection = getBillboardCollection();
      if (ambientBudget <= 0 || !viewer || !billboardCollection || !billboardCollection.show) return;
      try {
        const camera = viewer.camera;
        const camPos = camera.positionWC;
        const occluder = horizonOccluder(camera);
        const cull = camera.frustum.computeCullingVolume(camPos, camera.directionWC, camera.upWC);
        const flightData = getFlightData();
        const cand = [];
        for (const [icao24, bb] of getBillboards()) {
          if (seen.has(`t:${icao24}`)) continue; // answered / queued / negative this session
          if (!/^[0-9a-f]{6}$/i.test(icao24)) continue; // adsbdb keys are 6-char hex only
          if (flightData.get(icao24)?.onGround) continue; // ground traffic never spends ambient budget (click-to-enrich still works)
          if (!bb.position || !occluder.isPointVisible(bb.position)) continue; // beyond the limb
          scratchBoundingSphere.center = bb.position;
          if (cull.computeVisibility(scratchBoundingSphere) === 2 /* Cesium.Intersect.OUTSIDE */) continue; // off-screen
          cand.push([icao24, distanceSquared(camPos, bb.position)]);
        }
        cand.sort((a, b) => a[1] - b[1]); // nearest first — what the user is looking at resolves first
        const n = Math.min(cand.length, ambientPerSweep, ambientBudget);
        for (let i = 0; i < n; i++) {
          ambientBudget -= 1;
          engine.requestTypeEnrichment(cand[i][0]); // non-priority: fills the back of the queue
        }
      } catch { /* ambient enrichment is best-effort — never disturb the poll loop */ }
    },

    /** Reset the ambient budget to full and clear its refill anchor — call on
     *  layer init/re-enable so a fresh session starts with the initial burst
     *  rather than wherever a prior session's bucket happened to sit. */
    resetAmbientBudget() {
      ambientBudget = engine.ambientBudgetKnobs().ceil;
      ambientRefillAnchorMs = 0;
    },

    /** Clear all queued/seen state and cancel the pending drip timer — call
     *  on layer destroy() so a torn-down layer's in-flight drip can't fire
     *  into a stale flight-data map after reassignment. */
    clear() {
      queue.length = 0;
      seen.clear();
      if (dripTimer) { clearTimeout(dripTimer); dripTimer = null; }
    },
  };

  return engine;
}

/** Local copy of Cesium.Cartesian3.distanceSquared's math — avoided importing
 *  `cesium` into this module purely for one scalar distance check; the caller
 *  already has the import and passes real Cartesian3 instances through. */
function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}
